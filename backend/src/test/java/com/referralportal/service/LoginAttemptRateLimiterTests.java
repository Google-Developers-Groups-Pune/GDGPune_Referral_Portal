package com.referralportal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

class LoginAttemptRateLimiterTests {

    @Test
    void rejectsIpAfterConfiguredAttemptLimit() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(4);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 3, 3, 5, 300);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> limiter.checkAllowed("user@example.com", "127.0.0.1"));

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        verify(jdbcTemplate, times(1)).update(anyString(), any(Object[].class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void blockedEmailIsRejectedWithRemainingTime() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(new int[] {5, 130}));
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 10, 100, 5, 300);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> limiter.checkAllowed("user@example.com", "127.0.0.1"));

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(exception.getReason())
                .isEqualTo("Too many failed sign-in attempts. Please try again in 3 minutes.");
        assertThat(exception.getHeaders().getFirst("Retry-After")).isEqualTo("130");
    }

    @Test
    @SuppressWarnings("unchecked")
    void emailBelowFailureLimitIsAllowed() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(new int[] {4, 200}));
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 10, 100, 5, 300);

        assertDoesNotThrow(() -> limiter.checkAllowed("user@example.com", "127.0.0.1"));
    }

    @Test
    void failuresBelowLimitAreCountedWithoutBlocking() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(4);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 10, 100, 5, 300);

        assertDoesNotThrow(() -> limiter.recordFailedLogin("user@example.com", "127.0.0.1"));
        verify(jdbcTemplate, times(1)).update(anyString(), any(Object[].class));
    }

    @Test
    void fifthFailureStartsFiveMinuteBlock() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(5);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 10, 100, 5, 300);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> limiter.recordFailedLogin("user@example.com", "127.0.0.1"));

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(exception.getReason())
                .isEqualTo("Too many failed sign-in attempts. Please try again in 5 minutes.");
        assertThat(exception.getHeaders().getFirst("Retry-After")).isEqualTo("300");
        verify(jdbcTemplate).update(contains("SET window_started_at = UTC_TIMESTAMP(6)"), any(Object[].class));
    }

    @Test
    void failuresForSameEmailFromDifferentNetworksUseSeparateCounters() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 900, 10, 100, 5, 300);

        limiter.recordFailedLogin("User@Example.com", "203.0.113.7");
        limiter.recordFailedLogin("user@example.com", "203.0.113.7");
        limiter.recordFailedLogin("user@example.com", "198.51.100.9");

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, times(3)).update(anyString(), args.capture());
        Object attackerNetwork = args.getAllValues().get(0)[0];
        assertThat(args.getAllValues().get(1)[0]).isEqualTo(attackerNetwork);
        assertThat(args.getAllValues().get(2)[0]).isNotEqualTo(attackerNetwork);
    }

    @Test
    void failedLoginCountersCommitWhenBlocking() throws NoSuchMethodException {
        Transactional transaction = LoginAttemptRateLimiter.class
                .getMethod("recordFailedLogin", String.class, String.class)
                .getAnnotation(Transactional.class);

        assertThat(transaction.noRollbackFor()).contains(ResponseStatusException.class);
    }

    @Test
    void commitsAttemptCountersWhenRateLimitRejects() throws NoSuchMethodException {
        Transactional transaction = LoginAttemptRateLimiter.class
                .getMethod("checkAllowed", String.class, String.class)
                .getAnnotation(Transactional.class);

        assertThat(transaction.noRollbackFor()).contains(ResponseStatusException.class);
    }

    @Test
    void cleanupUsesConfiguredRateLimitWindow() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        LoginAttemptRateLimiter limiter = new LoginAttemptRateLimiter(jdbcTemplate, 172800, 10, 100, 5, 300);

        limiter.removeExpiredBuckets();

        verify(jdbcTemplate).update(contains("TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(6))"), eq(172800));
    }
}