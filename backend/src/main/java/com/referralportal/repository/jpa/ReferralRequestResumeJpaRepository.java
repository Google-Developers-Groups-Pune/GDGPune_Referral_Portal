package com.referralportal.repository.jpa;

import com.referralportal.entity.ReferralRequestResume;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralRequestResumeJpaRepository extends JpaRepository<ReferralRequestResume, Long> {

    @Query("select resume.requestId from ReferralRequestResume resume where resume.requestId in :requestIds")
    List<Long> findRequestIdsWithResume(@Param("requestIds") List<Long> requestIds);

    @Modifying
    @Query("delete from ReferralRequestResume resume where resume.requestId in "
            + "(select request.id from CompanyReferralRequest request where request.seeker.id = :seekerId)")
    void deleteBySeekerId(@Param("seekerId") long seekerId);
}