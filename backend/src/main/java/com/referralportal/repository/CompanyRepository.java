package com.referralportal.repository;

import com.referralportal.repository.jpa.CompanyJpaRepository;
import com.referralportal.repository.jpa.ReferrerProfileJpaRepository;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Repository;

import static com.referralportal.dto.CompanyDtos.CompanyView;

@Repository
public class CompanyRepository {

    @Autowired
    private CompanyJpaRepository companies;
    @Autowired
    private ReferrerProfileJpaRepository referrerProfiles;

    public List<CompanyView> findCompanies(long seekerId) {
        return companies.findAllWithVerifiedReferrers().stream()
            .filter(company -> !isVerifiedOwnCompany(seekerId, company.getId()))
            .map(company -> new CompanyView(company.getId(), company.getName(), company.getEmailDomain(),
                company.isSponsor()))
            .toList();
    }

    public boolean isVerifiedOwnCompany(long userId, long companyId) {
        return referrerProfiles.findById(userId)
                .map(rp -> rp.getVerifiedAt() != null && rp.getCompany().getId() == companyId)
                .orElse(false);
    }
}
