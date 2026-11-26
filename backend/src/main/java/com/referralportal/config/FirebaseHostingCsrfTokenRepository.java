package com.referralportal.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

final class FirebaseHostingCsrfTokenRepository implements CsrfTokenRepository {

    private final HttpSessionCsrfTokenRepository session = new HttpSessionCsrfTokenRepository();
    private final CookieCsrfTokenRepository cookie = CookieCsrfTokenRepository.withHttpOnlyFalse();

    FirebaseHostingCsrfTokenRepository() {
        session.setHeaderName("X-XSRF-TOKEN");
    }

    @Override
    public CsrfToken generateToken(HttpServletRequest request) {
        return session.generateToken(request);
    }

    @Override
    public void saveToken(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
        session.saveToken(token, request, response);
        cookie.saveToken(token, request, response);
    }

    @Override
    public CsrfToken loadToken(HttpServletRequest request) {
        return session.loadToken(request);
    }
}
