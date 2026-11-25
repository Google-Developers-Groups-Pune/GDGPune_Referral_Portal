package com.referralportal.service;

import com.referralportal.dto.CompanyDtos;
import com.referralportal.repository.CompanyRepository;
import com.referralportal.user.CurrentUser;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import static com.referralportal.dto.CompanyDtos.CompaniesResponse;

@Service
public class CompanyService {

    @Autowired
    private UserService users;
    @Autowired
    private CompanyRepository companies;
    @Autowired
    private ReferralRequestBudget requestBudget;

    public CompaniesResponse list(Authentication auth) {
        CurrentUser user = users.current(auth);
        List<CompanyDtos.CompanyView> items = companies.findCompanies(user.id());
        ReferralRequestBudget.Allowance allowance = requestBudget.allowance(user.id(), java.time.Instant.now());
        return new CompaniesResponse(allowance.left(), allowance.baseMax(),
            allowance.bonusAvailable(), items);
    }
}
