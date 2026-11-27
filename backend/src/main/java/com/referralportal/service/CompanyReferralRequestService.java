package com.referralportal.service;

import com.referralportal.common.ChipLists;
import com.referralportal.common.ScreenshotImages;
import com.referralportal.common.ScreenshotImages.Screenshot;
import com.referralportal.dto.ReferralRequestDtos;
import com.referralportal.entity.Company;
import com.referralportal.entity.CompanyReferralRequest;
import com.referralportal.entity.Profile;
import com.referralportal.entity.ReferralRequestResponse;
import com.referralportal.entity.ReferralRequestResume;
import com.referralportal.entity.ReferralSubmissionEvidence;
import com.referralportal.entity.ReferrerProfile;
import com.referralportal.entity.ResumeFile;
import com.referralportal.entity.User;
import com.referralportal.repository.jpa.CompanyJpaRepository;
import com.referralportal.repository.jpa.CompanyReferralRequestJpaRepository;
import com.referralportal.repository.jpa.ProfileJpaRepository;
import com.referralportal.repository.jpa.ReferralJpaRepository;
import com.referralportal.repository.jpa.ReferralRequestResponseJpaRepository;
import com.referralportal.repository.jpa.ReferralSubmissionEvidenceJpaRepository;
import com.referralportal.repository.jpa.ReferralSubmissionEvidenceJpaRepository.ReviewState;
import com.referralportal.repository.jpa.ReferrerProfileJpaRepository;
import com.referralportal.repository.jpa.ResumeFileJpaRepository;
import com.referralportal.repository.jpa.ReferralRequestResumeJpaRepository;
import com.referralportal.repository.jpa.UserJpaRepository;
import com.referralportal.user.CurrentUser;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import static com.referralportal.dto.ReferralRequestDtos.AcceptRequest;
import static com.referralportal.dto.ReferralRequestDtos.CreateRequest;
import static com.referralportal.dto.ReferralRequestDtos.ReferrerInboxItem;
import static com.referralportal.dto.ReferralRequestDtos.SeekerRequest;
import static com.referralportal.dto.ReferralRequestDtos.SeekerResponse;

@Service
public class CompanyReferralRequestService {

    private static final int REQUEST_DAYS = 4;

    @Autowired
    private UserService users;
    @Autowired
    private UserJpaRepository userRows;
    @Autowired
    private ProfileJpaRepository profiles;
    @Autowired
    private CompanyJpaRepository companies;
    @Autowired
    private ReferrerProfileJpaRepository referrerProfiles;
    @Autowired
    private CompanyReferralRequestJpaRepository requests;
    @Autowired
    private ReferralRequestResponseJpaRepository responses;
    @Autowired
    private ReferralJpaRepository referrals;
    @Autowired
    private ReferralRequestBudget budget;
    @Autowired
    private ReferralNotificationService notifications;
    @Autowired
    private ResumeFileJpaRepository resumeFiles;
    @Autowired
    private ReferralRequestResumeJpaRepository requestResumes;
    @Autowired
    private ReferralSubmissionEvidenceJpaRepository evidenceRows;

    /**
     * Creations serialize on the seeker's user row. READ_COMMITTED is required as well: resolving
     * the current user may read first, and under REPEATABLE_READ the duplicate and budget checks
     * after the lock would still use that older snapshot.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SeekerRequest create(Authentication authentication, CreateRequest input) {
        CurrentUser current = users.current(authentication);
        Instant now = Instant.now();
        User seeker = userRows.findByIdForUpdate(current.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        Profile profile = profiles.findById(current.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Complete your seeker profile first."));
        if (!Boolean.TRUE.equals(input.shareProfile())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose whether to share your profile with invited referrers.");
        }
        if (blank(input.jobUrl())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide a job link.");
        }
        if (Boolean.TRUE.equals(input.shareSeekerPhone()) && blank(profile.getPhoneNumber())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add a phone number to your profile before sharing it.");
        }
        ResumeFile uploadedResume = resumeFiles.findById(current.id()).orElse(null);
        boolean hasResume = uploadedResume != null;
        Company company = companies.findById(input.companyId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Company not found."));
        Optional<ReferrerProfile> seekerReferrer = referrerProfiles.findById(current.id());
        if (seekerReferrer.filter(rp -> rp.getVerifiedAt() != null && rp.getCompany().getId().equals(company.getId())).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You cannot request a referral from your own company.");
        }
        List<ReferrerProfile> eligible = referrerProfiles
                .findByCompany_IdAndVerifiedAtIsNotNullAndReferrerTrue(company.getId())
                .stream().filter(rp -> !rp.getUserId().equals(current.id())).toList();
        if (eligible.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This company has no verified referrers yet.");
        }
        String roleTitle = input.roleTitle().trim();
        if (!requests.findActiveDuplicate(current.id(), company.getId(), roleTitle).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have an active request for this company and role.");
        }
        if (budget.allowance(current.id(), now).left() <= 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have used all of your referral requests and credits for this period.");
        }

        CompanyReferralRequest request = new CompanyReferralRequest();
        request.setSeeker(seeker);
        request.setCompany(company);
        request.setRoleTitle(roleTitle);
        request.setJobUrl(blankToNull(input.jobUrl()));
        request.setSeekerNote(blankToNull(input.seekerNote()));
        request.setShareProfile(true);
        request.setShareSeekerEmail(true);
        request.setShareSeekerPhone(Boolean.TRUE.equals(input.shareSeekerPhone()));
        request.setShareSeekerResume(hasResume);
        request.setCreatedAt(now);
        request.setExpiresAt(now.plus(REQUEST_DAYS, ChronoUnit.DAYS));
        request = requests.save(request);
        if (uploadedResume != null) {
            ReferralRequestResume snapshot = new ReferralRequestResume();
            snapshot.setRequestId(request.getId());
            snapshot.setFilename(uploadedResume.getFilename());
            snapshot.setContentType(uploadedResume.getContentType());
            snapshot.setSizeBytes(uploadedResume.getSizeBytes());
            snapshot.setSha256(uploadedResume.getSha256());
            snapshot.setData(uploadedResume.getData());
            snapshot.setUploadedAt(uploadedResume.getUploadedAt());
            requestResumes.save(snapshot);
        }
        budget.charge(current.id(), request, now);

        for (ReferrerProfile referrerProfile : eligible) {
            ReferralRequestResponse response = new ReferralRequestResponse();
            response.setRequest(request);
            response.setReferrer(referrerProfile.getUser());
            response.setCreatedAt(now);
            response = responses.save(response);
            notifications.invite(request, response.getReferrer());
        }
        return seekerRequest(request);
    }

    @Transactional(readOnly = true)
    public List<SeekerRequest> seekerRequests(Authentication authentication) {
        long seekerId = users.current(authentication).id();
        return requests.findBySeekerId(seekerId).stream().map(this::seekerRequest).toList();
    }

    @Transactional(readOnly = true)
    public List<ReferrerInboxItem> inbox(Authentication authentication) {
        long referrerId = users.current(authentication).id();
        List<ReferralRequestResponse> inbox = responses.findInboxByReferrerId(referrerId);
        if (inbox.isEmpty()) {
            return List.of();
        }
        List<Long> requestIds = inbox.stream().map(response -> response.getRequest().getId()).toList();
        Set<Long> requestIdsWithResume = Set.copyOf(requestResumes.findRequestIdsWithResume(requestIds));
        Map<Long, ReviewState> reviews = evidenceRows.findReviewStates(
                inbox.stream().map(ReferralRequestResponse::getId).toList()).stream()
                .collect(Collectors.toMap(ReviewState::getResponseId, Function.identity()));
        return inbox.stream().map(response -> inboxItem(response,
                requestIdsWithResume.contains(response.getRequest().getId()), reviews.get(response.getId()))).toList();
    }

    @Transactional
    public Map<String, Object> accept(Authentication authentication, long requestId, AcceptRequest input) {
        CurrentUser current = users.current(authentication);
        Instant now = Instant.now();
        CompanyReferralRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referral request not found."));
        if (!"open".equals(request.getStatus()) || !request.getExpiresAt().isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This referral request is no longer accepting responses.");
        }
        ReferralRequestResponse response = responses.findByRequestIdAndReferrerId(requestId, current.id())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You were not invited to this request."));
        if (!"pending".equals(response.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already responded to this request.");
        }
        boolean anotherReferrerActive = responses.findByRequestIdOrderByCreatedAt(requestId).stream()
            .anyMatch(other -> !other.getId().equals(response.getId())
                && Set.of("accepted", "submitted", "confirmed").contains(other.getStatus()));
        if (anotherReferrerActive) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Another referrer has already accepted this request.");
        }
        ReferrerProfile referrer = referrerProfiles.findByUserIdForUpdate(current.id())
                .filter(profile -> profile.getVerifiedAt() != null && profile.isReferrer()
                && profile.getCompany().getId().equals(request.getCompany().getId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "You must be a verified referrer at this company to respond to referral requests."));
        String referrerPhone = Optional.ofNullable(referrer.getUser().getProfile()).map(Profile::getPhoneNumber).orElse(null);
        if (Boolean.TRUE.equals(input.shareReferrerPhone()) && blank(referrerPhone)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add a phone number to your profile before sharing it.");
        }
        if (referrals.existsByReferrerIdAndCandidateIdAndCompanyId(current.id(), request.getSeeker().getId(), request.getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already referred this person at your company.");
        }
        response.setStatus("accepted");
        response.setAcceptedAt(now);
        response.setShareReferrerEmail(Boolean.TRUE.equals(input.shareReferrerEmail()));
        response.setShareReferrerPhone(Boolean.TRUE.equals(input.shareReferrerPhone()));
        responses.save(response);
        for (ReferralRequestResponse other : responses.findByRequestIdOrderByCreatedAt(requestId)) {
            if (!other.getId().equals(response.getId()) && "pending".equals(other.getStatus())) {
                other.setStatus("accepted_elsewhere");
                other.setClosedAt(now);
                responses.save(other);
            }
        }
        notifications.accepted(request, response);
        return Map.of("responseId", response.getId(), "status", response.getStatus());
    }

    @Transactional
    public Map<String, Object> continueWithOtherReferrers(Authentication authentication, long requestId) {
        long seekerId = users.current(authentication).id();
        Instant now = Instant.now();
        CompanyReferralRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referral request not found."));
        if (!request.getSeeker().getId().equals(seekerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        List<ReferralRequestResponse> existing = responses.findByRequestIdOrderByCreatedAt(requestId);
        boolean assignedReferrerTimedOut = existing.stream().anyMatch(response ->
                "closed".equals(response.getStatus()) && response.getAcceptedAt() != null
                        && response.getSubmittedAt() == null);
        boolean anotherAssignmentActive = existing.stream().anyMatch(response ->
            Set.of("accepted", "submitted", "confirmed").contains(response.getStatus()));
        Instant decisionDeadline = request.getClosedAt() == null ? Instant.MIN
            : request.getClosedAt().plus(REQUEST_DAYS, ChronoUnit.DAYS);
        if (!"closed".equals(request.getStatus()) || !assignedReferrerTimedOut || anotherAssignmentActive
            || !now.isBefore(decisionDeadline)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "There is no active continuation window for this referral request.");
        }

        int reopened = 0;
        for (ReferrerProfile profile : referrerProfiles
                .findByCompany_IdAndVerifiedAtIsNotNullAndReferrerTrue(request.getCompany().getId())) {
            if (profile.getUserId().equals(seekerId)) {
                continue;
            }
            ReferralRequestResponse response = existing.stream()
                    .filter(item -> item.getReferrer().getId().equals(profile.getUserId()))
                    .findFirst().orElse(null);
            if (response == null || !Set.of("accepted_elsewhere", "pending").contains(response.getStatus())) {
                continue;
            }
            response.setStatus("pending");
            response.setClosedAt(null);
            response.setRemindersSent((short) 0);
            response.setLastRemindedAt(null);
            response = responses.save(response);
            notifications.invite(request, response.getReferrer());
            reopened++;
        }

        if (reopened == 0) {
            expireAndRefund(request, existing, now);
            return Map.of("status", request.getStatus(), "creditReturned", true);
        }

        request.setStatus("open");
        request.setClosedAt(null);
        request.setExpiresAt(now.plus(REQUEST_DAYS, ChronoUnit.DAYS));
        requests.save(request);
        return Map.of("status", request.getStatus(), "referrersNotified", reopened);
    }

    private void expireAndRefund(CompanyReferralRequest request, List<ReferralRequestResponse> requestResponses,
            Instant now) {
        request.setStatus("expired");
        request.setClosedAt(now);
        requests.save(request);
        for (ReferralRequestResponse response : requestResponses) {
            if ("accepted_elsewhere".equals(response.getStatus()) || "pending".equals(response.getStatus())) {
                response.setStatus("expired");
                response.setClosedAt(now);
                responses.save(response);
            }
        }
        budget.refundCreditIfUsed(request);
        notifications.expired(request);
    }

    @Transactional
    public Map<String, Object> decline(Authentication authentication, long requestId) {
        long referrerId = users.current(authentication).id();
        CompanyReferralRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referral request not found."));
        ReferralRequestResponse response = responses.findByRequestIdAndReferrerId(requestId, referrerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "You were not invited to this request."));
        if (!"open".equals(request.getStatus()) || !"pending".equals(response.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request can no longer be declined.");
        }
        response.setStatus("declined");
        response.setClosedAt(Instant.now());
        responses.save(response);
        return Map.of("status", response.getStatus());
    }

    @Transactional
    public Map<String, Object> cancel(Authentication authentication, long requestId) {
        long seekerId = users.current(authentication).id();
        CompanyReferralRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referral request not found."));
        if (!request.getSeeker().getId().equals(seekerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (!"open".equals(request.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This request is already closed.");
        }
        List<ReferralRequestResponse> requestResponses = responses.findByRequestIdOrderByCreatedAt(requestId);
        if (requestResponses.stream().anyMatch(response -> "accepted".equals(response.getStatus())
                || "submitted".equals(response.getStatus()) || "confirmed".equals(response.getStatus()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A referrer has accepted this request; it can no longer be cancelled.");
        }
        request.setStatus("expired");
        request.setClosedAt(Instant.now());
        requests.save(request);
        for (ReferralRequestResponse response : requestResponses) {
            if ("pending".equals(response.getStatus())) {
                response.setStatus("expired");
                response.setClosedAt(Instant.now());
                responses.save(response);
            }
        }
        budget.refundCreditIfUsed(request);
        return Map.of("status", request.getStatus());
    }

    /**
     * The referrer marks the referral submitted by uploading a screenshot as evidence. The response then waits
     * for an admin to review it (see {@link ReferralEvidenceReviewService}); only approval confirms the
     * referral, records it in {@code referrals} and may award the referrer a credit.
     */
    @Transactional
    public Map<String, Object> markSubmitted(Authentication authentication, long requestId, MultipartFile screenshotFile) {
        long referrerId = users.current(authentication).id();
        Screenshot screenshot = ScreenshotImages.read(screenshotFile);
        ReferralRequestResponse response = ownedResponse(requestId, referrerId, true);
        if ("submitted".equals(response.getStatus()) || "confirmed".equals(response.getStatus())) {
            return Map.of("status", response.getStatus());
        }
        if (!"accepted".equals(response.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only an accepted referral can be marked submitted.");
        }
        Instant now = Instant.now();
        if (referrals.existsByReferrerIdAndCandidateIdAndCompanyId(referrerId,
            response.getRequest().getSeeker().getId(), response.getRequest().getCompany().getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You have already referred this person at your company.");
        }
        // A screenshot rejected earlier is replaced, so the admin always reviews the latest upload.
        ReferralSubmissionEvidence evidence = evidenceRows.findByIdForUpdate(response.getId())
                .orElseGet(ReferralSubmissionEvidence::new);
        evidence.setResponseId(response.getId());
        evidence.setFilename(screenshot.filename());
        evidence.setContentType(screenshot.contentType());
        evidence.setSizeBytes(screenshot.data().length);
        evidence.setSha256(screenshot.sha256());
        evidence.setData(screenshot.data());
        evidence.setUploadedAt(now);
        evidence.setReviewStatus(ReferralSubmissionEvidence.PENDING);
        evidence.setReviewedBy(null);
        evidence.setReviewedAt(null);
        evidence.setReviewNote(null);
        evidenceRows.save(evidence);
        response.setStatus("submitted");
        response.setSubmittedAt(now);
        responses.save(response);
        notifications.submitted(response.getRequest(), response);
        return Map.of("status", response.getStatus());
    }

    private ReferralRequestResponse ownedResponse(long requestId, long referrerId, boolean requireAccepted) {
        CompanyReferralRequest request = requests.findByIdForUpdate(requestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Referral request not found."));
        ReferralRequestResponse response = responses.findByRequestIdAndReferrerId(requestId, referrerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));
        if (requireAccepted && response.getAcceptedAt() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return response;
    }

    private SeekerRequest seekerRequest(CompanyReferralRequest request) {
        List<ReferralRequestResponse> all = responses.findByRequestIdOrderByCreatedAt(request.getId());
        List<SeekerResponse> accepted = all.stream()
                .filter(response -> response.getAcceptedAt() != null)
                .map(response -> {
                    ReferrerProfile profile = referrerProfiles.findById(response.getReferrer().getId()).orElse(null);
                    String referrerPhone = profile == null || !response.isShareReferrerPhone() ? null
                            : Optional.ofNullable(profile.getUser().getProfile()).map(Profile::getPhoneNumber).orElse(null);
                    return new SeekerResponse(response.getId(), response.getStatus(), response.getReferrer().getName(),
                            profile == null ? null : profile.getJobTitle(),
                            response.isShareReferrerEmail() && profile != null ? profile.getWorkEmail() : null,
                            referrerPhone, time(response.getAcceptedAt()), time(response.getSubmittedAt()),
                            time(response.getConfirmedAt()));
                }).toList();
        int pending = (int) all.stream().filter(response -> "pending".equals(response.getStatus())).count();
        int declined = (int) all.stream().filter(response -> "declined".equals(response.getStatus())).count();
        int acceptedCount = (int) all.stream().filter(response -> Set.of("accepted", "submitted", "confirmed")
            .contains(response.getStatus())).count();
        int otherReferrers = (int) all.stream().filter(response ->
            "accepted_elsewhere".equals(response.getStatus()) || "pending".equals(response.getStatus())).count();
        boolean timedOutAssignment = all.stream().anyMatch(response -> "closed".equals(response.getStatus())
            && response.getAcceptedAt() != null && response.getSubmittedAt() == null);
        boolean anotherAssignmentActive = all.stream().anyMatch(response ->
            Set.of("accepted", "submitted", "confirmed").contains(response.getStatus()));
        boolean canContinue = "closed".equals(request.getStatus()) && timedOutAssignment
            && !anotherAssignmentActive && otherReferrers > 0 && request.getClosedAt() != null
            && Instant.now().isBefore(request.getClosedAt().plus(REQUEST_DAYS, ChronoUnit.DAYS));
        String status = request.getStatus();
        if (canContinue) {
            status = "awaiting_seeker";
        } else if ("open".equals(status) && acceptedCount > 0) {
            status = "in_progress";
        } else if ("open".equals(status) && pending == 0 && declined > 0) {
            status = "no_acceptances";
        }
        return new SeekerRequest(request.getId(), request.getCompany().getName(), request.getRoleTitle(), request.getJobUrl(),
                request.getSeekerNote(), status, time(request.getCreatedAt()), time(request.getExpiresAt()),
            pending, declined, canContinue, otherReferrers, "expired".equals(request.getStatus()), accepted);
    }

    private ReferrerInboxItem inboxItem(ReferralRequestResponse response, boolean hasResumeSnapshot, ReviewState review) {
        CompanyReferralRequest request = response.getRequest();
        User seeker = request.getSeeker();
        Profile profile = profiles.findById(seeker.getId()).orElse(null);
        boolean accepted = response.getAcceptedAt() != null;
        boolean profileShared = request.isShareProfile() && profile != null;
        String email = accepted && request.isShareSeekerEmail() ? seeker.getEmail() : null;
        String phone = accepted && request.isShareSeekerPhone() && profile != null ? profile.getPhoneNumber() : null;
        boolean canSharePhone = Optional.ofNullable(response.getReferrer().getProfile())
            .map(Profile::getPhoneNumber).filter(value -> !value.isBlank()).isPresent();
        boolean pendingAndOpen = "pending".equals(response.getStatus())
            && "open".equals(request.getStatus()) && request.getExpiresAt().isAfter(Instant.now());
        boolean resumeAccessAllowed = pendingAndOpen
            || java.util.Set.of("accepted", "submitted", "confirmed").contains(response.getStatus());
        boolean resumeAvailable = resumeAccessAllowed && request.isShareSeekerResume()
            && hasResumeSnapshot;
        List<String> referralRolePreferences = referrerProfiles.findById(response.getReferrer().getId())
            .map(referrer -> ChipLists.fromJson(referrer.getReferralRolePreferences())).orElse(List.of());
        return new ReferrerInboxItem(response.getId(), request.getId(), request.getCompany().getName(), request.getRoleTitle(),
                request.getJobUrl(), seeker.getName(), profileShared ? profile.getExperienceLevel() : null,
                profileShared ? ChipLists.fromJson(profile.getSkills()) : List.of(),
            profileShared ? ChipLists.fromJson(profile.getRolesWanted()) : List.of(), referralRolePreferences,
                profileShared ? profile.getPitch() : null,
                profileShared ? profile.getGithubUrl() : null,
                profileShared ? profile.getLinkedinUrl() : null,
                profileShared ? profile.getPortfolioUrl() : null,
                request.getSeekerNote(), canSharePhone, email, phone, resumeAvailable,
            response.getStatus(), time(response.getCreatedAt()),
                time(response.getAcceptedAt()), time(response.getSubmittedAt()), response.getRemindersSent(),
                review == null ? null : review.getReviewStatus(), review == null ? null : review.getReviewNote());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String time(Instant value) {
        return value == null ? null : value.toString();
    }
}