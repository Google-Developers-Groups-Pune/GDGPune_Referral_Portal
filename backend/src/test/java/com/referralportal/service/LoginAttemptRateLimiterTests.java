package com.referralportal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class LoginAttemptRateLimiterTests {

    @Test
    void rejectsIpAfterConfiguredAttemptLimit() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(4);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 3, 3);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> limiter.checkAllowed("user@example.com", "127.0.0.1"));

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(jdbcTemplate, times(1)).update(anyString(), any(Object[].class));
    }

    @Test
    void rejectsAccountWithGenericUnauthorizedResponseAfterConfiguredLimit() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1, 3);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 2, 10);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> limiter.checkAllowed("user@example.com", "127.0.0.1"));

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(exception.getReason()).isEqualTo("Invalid email or password.");
        verify(jdbcTemplate, times(2)).update(anyString(), any(Object[].class));
    }
}