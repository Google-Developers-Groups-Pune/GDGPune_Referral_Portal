package com.referralportal.service;

import com.referralportal.dto.AdminDtos.EvidenceCounts;
import com.referralportal.dto.AdminDtos.EvidenceItem;
import com.referralportal.dto.AdminDtos.EvidenceQueue;
import com.referralportal.entity.CompanyReferralRequest;
import com.referralportal.entity.Referral;
import com.referralportal.entity.ReferralRequestCredit;
import com.referralportal.entity.ReferralRequestResponse;
import com.referralportal.entity.ReferralSubmissionEvidence;
import com.referralportal.entity.ReferrerProfile;
import com.referralportal.entity.User;
import com.referralportal.repository.jpa.CompanyReferralRequestJpaRepository;
import com.referralportal.repository.jpa.OpenRoleJpaRepository;
import com.referralportal.repository.jpa.ReferralJpaRepository;
import com.referralportal.repository.jpa.ReferralRequestCreditJpaRepository;
import com.referralportal.repository.jpa.ReferralRequestResponseJpaRepository;
import com.referralportal.repository.jpa.ReferralSubmissionEvidenceJpaRepository;
import com.referralportal.repository.jpa.ReferralSubmissionEvidenceJpaRepository.EvidenceMeta;
import com.referralportal.repository.jpa.ReferrerProfileJpaRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin review of referral submission screenshots.
 *
 * <p>Approval is the moment a referral counts: the response becomes {@code confirmed}, a {@code referrals} row is
 * recorded, and the referrer may earn a credit (at most two per rolling 30 days, each valid 90 days). The seeker's
 * request allowance was reserved when they created the request; from here on it stays used.
 *
 * <p>Rejection sends the response back to {@code accepted} with a fresh four-day window, so the referrer can upload
 * a better screenshot. If they never do, the usual assignment timeout closes it and the seeker can continue with
 * other referrers or get their allowance back, exactly as for a referrer who never submitted.
 */
@Service
public class ReferralEvidenceReviewService {

    private static final int CREDIT_DAYS = 90;
    private static final Set<String> STATUSES = Set.of(ReferralSubmissionEvidence.PENDING,
            ReferralSubmissionEvidence.APPROVED, ReferralSubmissionEvidence.REJECTED);

    @Autowired
    private AdminAccess access;
    @Autowired
    private ReferralSubmissionEvidenceJpaRepository evidenceRows;
    @Autowired
    private ReferralRequestResponseJpaRepository responses;
    @Autowired
    private CompanyReferralRequestJpaRepository requests;
    @Autowired
    private ReferrerProfileJpaRepository referrerProfiles;
    @Autowired
    private ReferralRequestCreditJpaRepository credits;
    @Autowired
    private ReferralJpaRepository referrals;
    @Autowired
    private OpenRoleJpaRepository openRoles;
    @Autowired
    private ReferralRequestBudget budget;
    @Autowired
    private ReferralNotificationService notifications;

    @Transactional(readOnly = true)
    public EvidenceQueue queue(Authentication authentication, String status) {
        access.requireAdmin(authentication);
        String wanted = status == null || status.isBlank() ? ReferralSubmissionEvidence.PENDING : status;
        if (!STATUSES.contains(wanted)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown review status.");
        }
        List<EvidenceMeta> metas = new ArrayList<>(evidenceRows.findMetaByReviewStatus(wanted));
        if (!ReferralSubmissionEvidence.PENDING.equals(wanted)) {
            metas.sort((a, b) -> compareNewestFirst(a.getReviewedAt(), b.getReviewedAt()));
        }
        Map<Long, ReferralRequestResponse> byId = metas.isEmpty() ? Map.of()
                : responses.findWithDetailsByIdIn(metas.stream().map(EvidenceMeta::getResponseId).toList()).stream()
                        .collect(Collectors.toMap(ReferralRequestResponse::getId, Function.identity()));
        List<EvidenceItem> items = metas.stream()
                .filter(meta -> byId.containsKey(meta.getResponseId()))
                .map(meta -> item(meta, byId.get(meta.getResponseId())))
                .toList();
        EvidenceCounts counts = new EvidenceCounts(
                evidenceRows.countByReviewStatus(ReferralSubmissionEvidence.PENDING),
                evidenceRows.countByReviewStatus(ReferralSubmissionEvidence.APPROVED),
                evidenceRows.countByReviewStatus(ReferralSubmissionEvidence.REJECTED));
        return new EvidenceQueue(counts, items);
    }

    @Transactional(readOnly = true)
    public ReferralSubmissionEvidence screenshot(Authentication authentication, long responseId) {
        access.requireAdmin(authentication);
        return evidenceRows.findById(responseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Screenshot not found."));
    }

    @Transactional
    public Map<String, Object> approve(Authentication authentication, long responseId) {
        User admin = access.requireAdmin(authentication);
        Locked locked = lockForReview(admin, responseId);
        ReferralRequestResponse response = locked.response();
        ReferralSubmissionEvidence evidence = locked.evidence();
        Instant now = Instant.now();

        response.setStatus("confirmed");
        response.setConfirmedAt(now);
        responses.save(response);
        evidence.setReviewStatus(ReferralSubmissionEvidence.APPROVED);
        evidence.setReviewedBy(admin);
        evidence.setReviewedAt(now);
        evidence.setReviewNote(null);
        evidenceRows.save(evidence);

        CompanyReferralRequest request = response.getRequest();
        if (!referrals.existsByReferrerIdAndCandidateIdAndCompanyId(response.getReferrer().getId(),
                request.getSeeker().getId(), request.getCompany().getId())) {
            Referral referral = new Referral();
            referral.setReferrer(response.getReferrer());
            referral.setCandidate(request.getSeeker());
            referral.setCompany(request.getCompany());
            openRoles.findFirstByCompanyIdAndTitle(request.getCompany().getId(), request.getRoleTitle())
                    .ifPresent(referral::setRole);
            referral.setStatus("submitted");
            referral.setCreatedAt(response.getSubmittedAt() == null ? now : response.getSubmittedAt());
            referral.setUpdatedAt(now);
            referrals.save(referral);
        }

        boolean awarded = false;
        ReferrerProfile referrer = referrerProfiles.findByUserIdForUpdate(response.getReferrer().getId()).orElse(null);
        if (referrer != null && budget.mayEarnAnother(response.getReferrer().getId(), now)
                && credits.findBySourceResponseId(response.getId()).isEmpty()) {
            ReferralRequestCredit credit = new ReferralRequestCredit();
            credit.setUser(response.getReferrer());
            credit.setSourceResponse(response);
            credit.setCreatedAt(now);
            credit.setExpiresAt(now.plus(CREDIT_DAYS, ChronoUnit.DAYS));
            credits.save(credit);
            awarded = true;
        }
        notifications.confirmed(request, response, awarded);
        notifications.verified(request, response);
        return Map.of("status", response.getStatus(), "creditAwarded", awarded);
    }

    @Transactional
    public Map<String, Object> reject(Authentication authentication, long responseId, String note) {
        User admin = access.requireAdmin(authentication);
        String reason = note == null ? "" : note.trim();
        if (reason.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tell the referrer why the screenshot was rejected.");
        }
        Locked locked = lockForReview(admin, responseId);
        ReferralRequestResponse response = locked.response();
        ReferralSubmissionEvidence evidence = locked.evidence();
        Instant now = Instant.now();

        evidence.setReviewStatus(ReferralSubmissionEvidence.REJECTED);
        evidence.setReviewedBy(admin);
        evidence.setReviewedAt(now);
        evidence.setReviewNote(reason.length() > 500 ? reason.substring(0, 500) : reason);
        evidenceRows.save(evidence);

        // Back to the referrer with a fresh assignment window: reminders and the four-day timeout restart.
        response.setStatus("accepted");
        response.setSubmittedAt(null);
        response.setAcceptedAt(now);
        response.setRemindersSent((short) 0);
        response.setLastRemindedAt(null);
        responses.save(response);
        notifications.evidenceRejected(response, evidence.getReviewNote());
        return Map.of("status", response.getStatus());
    }

    /** Locks request, then response, then evidence: the same order the rest of the referral flow uses. */
    private Locked lockForReview(User admin, long responseId) {
        Long requestId = responses.findRequestId(responseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Submitted referral not found."));
        requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referral request not found."));
        ReferralRequestResponse response = responses.findByIdForUpdate(responseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Submitted referral not found."));
        ReferralSubmissionEvidence evidence = evidenceRows.findByIdForUpdate(responseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No screenshot was uploaded for this referral."));
        Long adminId = admin.getId();
        if (adminId.equals(response.getReferrer().getId()) || adminId.equals(response.getRequest().getSeeker().getId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Another admin must review a referral you are part of.");
        }
        if (!"submitted".equals(response.getStatus())
                || !ReferralSubmissionEvidence.PENDING.equals(evidence.getReviewStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This screenshot has already been reviewed.");
        }
        return new Locked(response, evidence);
    }

    private EvidenceItem item(EvidenceMeta meta, ReferralRequestResponse response) {
        CompanyReferralRequest request = response.getRequest();
        User referrer = response.getReferrer();
        ReferrerProfile profile = referrer.getReferrerProfile();
        return new EvidenceItem(response.getId(), request.getId(), request.getCompany().getName(), request.getRoleTitle(),
                request.getJobUrl(), request.getSeeker().getName(), request.getSeeker().getEmail(), referrer.getName(),
                profile == null ? null : profile.getJobTitle(), profile == null ? null : profile.getWorkEmail(),
                time(response.getAcceptedAt()), time(response.getSubmittedAt()), meta.getFilename(), meta.getContentType(),
                meta.getSizeBytes(), time(meta.getUploadedAt()), meta.getReviewStatus(), meta.getReviewNote(),
                time(meta.getReviewedAt()), meta.getReviewerName());
    }

    private static int compareNewestFirst(Instant a, Instant b) {
        if (a == null) {
            return b == null ? 0 : 1;
        }
        return b == null ? -1 : b.compareTo(a);
    }

    private static String time(Instant value) {
        return value == null ? null : value.toString();
    }

    private record Locked(ReferralRequestResponse response, ReferralSubmissionEvidence evidence) {}
}
