package com.referralportal.controller;

import com.referralportal.service.CompanyService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;

import static com.referralportal.dto.CompanyDtos.CompaniesResponse;

@RestController
@RequestMapping("/api")
public class CompanyController {

    @Autowired
    private CompanyService companies;

    @GetMapping("/companies")
    public CompaniesResponse list(Authentication auth) {
        return companies.list(auth);
    }
}
