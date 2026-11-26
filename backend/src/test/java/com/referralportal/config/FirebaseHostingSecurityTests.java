package com.referralportal.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.session.web.http.CookieSerializer;

class FirebaseHostingSecurityTests {

    @Test
    void firebaseModeUsesForwardableSessionCookieWithoutChangingDefault() {
        CloudRunSessionConfiguration config = new CloudRunSessionConfiguration();
        assertThat(sessionCookie(config.cookieSerializer(true)))
                .startsWith("__session=").contains("Secure", "HttpOnly", "SameSite=Lax");
        assertThat(sessionCookie(config.cookieSerializer(false))).startsWith("SESSION=");
    }

    @Test
    void csrfUsesSessionEvenWhenFirebaseStripsTheXsrfCookie() throws Exception {
        CsrfFilter filter = new CsrfFilter(new FirebaseHostingCsrfTokenRepository());
        filter.setRequestHandler(new SpaCsrfTokenRequestHandler());
        MockHttpSession session = new MockHttpSession();

        MockHttpServletRequest get = new MockHttpServletRequest("GET", "/api/auth/csrf");
        get.setSession(session);
        MockHttpServletResponse getResponse = new MockHttpServletResponse();
        filter.doFilter(get, getResponse, new MockFilterChain());
        Cookie tokenCookie = getResponse.getCookie("XSRF-TOKEN");
        assertThat(tokenCookie).isNotNull();
        assertThat(tokenCookie.isHttpOnly()).isFalse();

        MockHttpServletRequest post = new MockHttpServletRequest("POST", "/api/auth/login");
        post.setSession(session);
        post.addHeader("X-XSRF-TOKEN", tokenCookie.getValue());
        MockHttpServletResponse postResponse = new MockHttpServletResponse();
        MockFilterChain accepted = new MockFilterChain();
        filter.doFilter(post, postResponse, accepted);
        assertThat(accepted.getRequest()).isNotNull();

        MockHttpServletRequest forged = new MockHttpServletRequest("POST", "/api/auth/login");
        forged.setSession(session);
        forged.addHeader("X-XSRF-TOKEN", "invalid");
        MockHttpServletResponse forgedResponse = new MockHttpServletResponse();
        filter.doFilter(forged, forgedResponse, new MockFilterChain());
        assertThat(forgedResponse.getStatus()).isEqualTo(403);

        MockHttpServletRequest missing = new MockHttpServletRequest("POST", "/api/auth/login");
        missing.setSession(session);
        MockHttpServletResponse missingResponse = new MockHttpServletResponse();
        filter.doFilter(missing, missingResponse, new MockFilterChain());
        assertThat(missingResponse.getStatus()).isEqualTo(403);

        MockHttpServletRequest differentSession = new MockHttpServletRequest("POST", "/api/auth/login");
        differentSession.setSession(new MockHttpSession());
        differentSession.addHeader("X-XSRF-TOKEN", tokenCookie.getValue());
        MockHttpServletResponse differentSessionResponse = new MockHttpServletResponse();
        filter.doFilter(differentSession, differentSessionResponse, new MockFilterChain());
        assertThat(differentSessionResponse.getStatus()).isEqualTo(403);
    }

    private String sessionCookie(CookieSerializer serializer) {
        MockHttpServletResponse response = new MockHttpServletResponse();
        serializer.writeCookieValue(new CookieSerializer.CookieValue(new MockHttpServletRequest(), response, "test-id"));
        return response.getHeader("Set-Cookie");
    }
}
