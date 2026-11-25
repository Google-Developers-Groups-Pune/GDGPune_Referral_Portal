package com.referralportal.dto;

import java.util.List;

public final class CompanyDtos {

    private CompanyDtos() {}

    public record CompanyView(long id, String name, String domain, boolean sponsor) {}

        public record CompaniesResponse(int referralRequestsLeft,
            int referralRequestsMax, int referralBonusCredits, List<CompanyView> companies) {}
}
