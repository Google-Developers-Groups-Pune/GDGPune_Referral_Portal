package com.referralportal.repository.jpa;

import com.referralportal.entity.ReferralSubmissionEvidence;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralSubmissionEvidenceJpaRepository extends JpaRepository<ReferralSubmissionEvidence, Long> {

    /** The review queue without the screenshot bytes; oldest first so nothing waits forever. */
    @Query("select e.responseId as responseId, e.filename as filename, e.contentType as contentType, "
            + "e.sizeBytes as sizeBytes, e.uploadedAt as uploadedAt, e.reviewStatus as reviewStatus, "
            + "e.reviewNote as reviewNote, e.reviewedAt as reviewedAt, reviewer.name as reviewerName "
            + "from ReferralSubmissionEvidence e left join e.reviewedBy reviewer "
            + "where e.reviewStatus = :status order by e.uploadedAt asc")
    List<EvidenceMeta> findMetaByReviewStatus(@Param("status") String status);

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
