package com.referralportal.repository.jpa;

import com.referralportal.entity.ReferralRequestResponse;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralRequestResponseJpaRepository extends JpaRepository<ReferralRequestResponse, Long> {

    @Query("select rr from ReferralRequestResponse rr join fetch rr.request r join fetch r.company join fetch r.seeker "
            + "where rr.referrer.id = :referrerId order by rr.createdAt desc")
    List<ReferralRequestResponse> findInboxByReferrerId(@Param("referrerId") long referrerId);

    @Query("select rr from ReferralRequestResponse rr join fetch rr.request r join fetch r.company join fetch rr.referrer "
            + "where r.seeker.id = :seekerId order by rr.createdAt desc")
    List<ReferralRequestResponse> findAssignmentsBySeekerId(@Param("seekerId") long seekerId);

    @Query("select rr from ReferralRequestResponse rr join fetch rr.request r join fetch r.company join fetch r.seeker "
            + "join fetch rr.referrer where rr.id in :responseIds")
    List<ReferralRequestResponse> findWithDetailsByIdIn(@Param("responseIds") Collection<Long> responseIds);

    List<ReferralRequestResponse> findByRequestIdOrderByCreatedAt(Long requestId);

    /** Whether this referrer already submitted (or had verified) a referral for the same person at the same company. */
    @Query("select case when count(rr) > 0 then true else false end from ReferralRequestResponse rr "
            + "where rr.referrer.id = :referrerId and rr.request.seeker.id = :seekerId "
            + "and rr.request.company.id = :companyId and rr.status in ('submitted', 'confirmed') and rr.id <> :excludeId")
    boolean existsOtherSubmission(@Param("referrerId") long referrerId, @Param("seekerId") long seekerId,
            @Param("companyId") long companyId, @Param("excludeId") long excludeId);

    Optional<ReferralRequestResponse> findByRequestIdAndReferrerId(Long requestId, Long referrerId);

        @Lock(LockModeType.PESSIMISTIC_WRITE)
        @Query("select rr from ReferralRequestResponse rr where rr.id = :responseId")
        Optional<ReferralRequestResponse> findByIdForUpdate(@Param("responseId") long responseId);


    @Query("select count(rr) from ReferralRequestResponse rr where rr.referrer.id = :referrerId "
            + "and rr.confirmedAt is not null and rr.confirmedAt >= :since")
    long countConfirmedSince(@Param("referrerId") long referrerId, @Param("since") Instant since);

    @Query("select rr.request.id from ReferralRequestResponse rr where rr.id = :responseId")
    Optional<Long> findRequestId(@Param("responseId") long responseId);

    @Query("select rr.id from ReferralRequestResponse rr where rr.status = 'accepted' and rr.submittedAt is null "
            + "and rr.remindersSent < 3 and ((rr.remindersSent = 0 and rr.acceptedAt <= :dueBefore) "
            + "or (rr.remindersSent > 0 and rr.lastRemindedAt <= :dueBefore)) order by rr.id")
    List<Long> findDueForReminderIds(@Param("dueBefore") Instant dueBefore);

    @Query("select rr.id from ReferralRequestResponse rr where rr.status = 'accepted' and rr.submittedAt is null "
            + "and rr.acceptedAt <= :staleBefore order by rr.id")
    List<Long> findStaleAcceptedIds(@Param("staleBefore") Instant staleBefore);
}