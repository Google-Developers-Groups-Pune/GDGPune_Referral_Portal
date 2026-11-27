package com.referralportal.repository.jpa;

import com.referralportal.entity.ReferralSubmissionEvidence;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralSubmissionEvidenceJpaRepository extends JpaRepository<ReferralSubmissionEvidence, Long> {

    String META = "select e.responseId as responseId, e.filename as filename, e.contentType as contentType, "
            + "e.sizeBytes as sizeBytes, e.sha256 as sha256, e.uploadedAt as uploadedAt, e.reviewStatus as reviewStatus, "
            + "e.reviewNote as reviewNote, e.reviewedAt as reviewedAt, reviewer.name as reviewerName "
            + "from ReferralSubmissionEvidence e left join e.reviewedBy reviewer where e.reviewStatus = :status ";

    /** Screenshots awaiting review, without their bytes; oldest first so nothing waits forever. */
    @Query(META + "order by e.uploadedAt asc, e.responseId asc")
    List<EvidenceMeta> findOldestMetaByReviewStatus(@Param("status") String status, Pageable page);

    /** Reviewed screenshots, without their bytes; most recently reviewed first. */
    @Query(META + "order by e.reviewedAt desc, e.responseId desc")
    List<EvidenceMeta> findLatestReviewedMeta(@Param("status") String status, Pageable page);

    /** Review state only, for the referrer's inbox. */
    @Query("select e.responseId as responseId, e.reviewStatus as reviewStatus, e.reviewNote as reviewNote "
            + "from ReferralSubmissionEvidence e where e.responseId in :responseIds")
    List<ReviewState> findReviewStates(@Param("responseIds") Collection<Long> responseIds);

    long countByReviewStatus(String reviewStatus);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from ReferralSubmissionEvidence e where e.responseId = :responseId")
    Optional<ReferralSubmissionEvidence> findByIdForUpdate(@Param("responseId") long responseId);

    interface EvidenceMeta {
        Long getResponseId();

        String getFilename();

        String getContentType();

        long getSizeBytes();

        String getSha256();

        Instant getUploadedAt();

        String getReviewStatus();

        String getReviewNote();

        Instant getReviewedAt();

        String getReviewerName();
    }

    interface ReviewState {
        Long getResponseId();

        String getReviewStatus();

        String getReviewNote();
    }
}
