package com.referralportal.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class LoginAttemptRateLimiter {

    private static final String UPSERT_ATTEMPT = """
            INSERT INTO auth_login_rate_limits (bucket_hash, window_started_at, attempt_count)
            VALUES (?, UTC_TIMESTAMP(6), 1)
            ON DUPLICATE KEY UPDATE
                attempt_count = IF(window_started_at < TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(6)),
                    1, attempt_count + 1),
                window_started_at = IF(window_started_at < TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(6)),
                    UTC_TIMESTAMP(6), window_started_at)
            """;
    private static final String SELECT_ATTEMPTS =
            "SELECT attempt_count FROM auth_login_rate_limits WHERE bucket_hash = ?";
    /** Failure count and seconds left in its window, for a failure bucket whose window is still open. */
    private static final String SELECT_ACTIVE_FAILURES = """
            SELECT attempt_count,
                   TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(6), TIMESTAMPADD(SECOND, ?, window_started_at))
            FROM auth_login_rate_limits
            WHERE bucket_hash = ? AND window_started_at >= TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(6))
            """;
    private static final String FAILED_LOGIN_BUCKET = "login-failure";

    private final JdbcTemplate jdbcTemplate;
    private final int windowSeconds;
    private final int accountAttemptLimit;
    private final int ipAttemptLimit;
    private final int failedLoginLimit;
    private final int failedLoginBlockSeconds;

    public LoginAttemptRateLimiter(JdbcTemplate jdbcTemplate,
            @Value("${app.auth.login-rate-limit.window-seconds:900}") int windowSeconds,
            @Value("${app.auth.login-rate-limit.account-attempts:10}") int accountAttemptLimit,
            @Value("${app.auth.login-rate-limit.ip-attempts:100}") int ipAttemptLimit,
            @Value("${app.auth.login-rate-limit.failed-attempts:5}") int failedLoginLimit,
            @Value("${app.auth.login-rate-limit.failed-block-seconds:300}") int failedLoginBlockSeconds) {
        this.jdbcTemplate = jdbcTemplate;
        this.windowSeconds = windowSeconds;
        this.accountAttemptLimit = accountAttemptLimit;
        this.ipAttemptLimit = ipAttemptLimit;
        this.failedLoginLimit = failedLoginLimit;
        this.failedLoginBlockSeconds = failedLoginBlockSeconds;
    }

    /** Runs before a password sign-in: rejects a flooding network, or an email that is temporarily blocked. */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public void checkAllowed(String email, String clientIp) {
        if (increment("ip", clientIp) > ipAttemptLimit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    retryMessage());
        }
        String bucketHash = failedLoginBucket(email, clientIp);
        List<int[]> active = jdbcTemplate.query(SELECT_ACTIVE_FAILURES,
                (row, i) -> new int[] {row.getInt(1), row.getInt(2)},
                failedLoginBlockSeconds, bucketHash, failedLoginBlockSeconds);
        if (!active.isEmpty() && active.get(0)[0] >= failedLoginLimit) {
            throw tooManyFailedLogins(active.get(0)[1]);
        }
    }

    /**
     * Counts a wrong password for this email from this network (keyed by both, so nobody can lock a user
     * out from another network). The attempt that reaches the limit is answered with
     * 429 and starts a block of {@code failed-block-seconds} from now; it then expires on its own.
     */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public void recordFailedLogin(String email, String clientIp) {
        String bucketHash = failedLoginBucket(email, clientIp);
        jdbcTemplate.update(UPSERT_ATTEMPT, bucketHash, failedLoginBlockSeconds, failedLoginBlockSeconds);
        int failures = jdbcTemplate.queryForObject(SELECT_ATTEMPTS, Integer.class, bucketHash);
        if (failures >= failedLoginLimit) {
            // Restart the window so the block lasts the full period from this attempt.
            jdbcTemplate.update("UPDATE auth_login_rate_limits SET window_started_at = UTC_TIMESTAMP(6) WHERE bucket_hash = ?",
                    bucketHash);
            throw tooManyFailedLogins(failedLoginBlockSeconds);
        }
    }

    @Transactional(noRollbackFor = ResponseStatusException.class)
    public void checkRegistrationAllowed(String email, String clientIp) {
        if (increment("registration-ip", clientIp) > ipAttemptLimit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many registration attempts from this network. Try again later.");
        }
        if (increment("registration-email", normalizeEmail(email)) > accountAttemptLimit) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many verification codes requested. Try again in 15 minutes.");
        }
    }

    @Transactional
    public void recordSuccessfulLogin(String email, String clientIp) {
        jdbcTemplate.update("DELETE FROM auth_login_rate_limits WHERE bucket_hash = ?",
                failedLoginBucket(email, clientIp));
    }

    @Transactional
    public void recordSuccessfulRegistration(String email) {
        jdbcTemplate.update("""
                UPDATE auth_login_rate_limits
                SET window_started_at = UTC_TIMESTAMP(6), attempt_count = 0
                WHERE bucket_hash = ?
                """, fingerprint("registration-email", normalizeEmail(email)));
    }

    @Scheduled(fixedDelayString = "${app.auth.login-rate-limit.cleanup-delay:21600000}")
    @Transactional
    public void removeExpiredBuckets() {
        jdbcTemplate.update("""
                DELETE FROM auth_login_rate_limits
                WHERE window_started_at < TIMESTAMPADD(SECOND, -?, UTC_TIMESTAMP(6))
                """, Math.max(windowSeconds, failedLoginBlockSeconds));
    }

    private int increment(String type, String value) {
        String bucketHash = fingerprint(type, value);
        jdbcTemplate.update(UPSERT_ATTEMPT, bucketHash, windowSeconds, windowSeconds);
        return jdbcTemplate.queryForObject(SELECT_ATTEMPTS, Integer.class, bucketHash);
    }

    /** 429 with a Retry-After header (seconds) so the sign-in form knows when to re-enable itself. */
    private static ResponseStatusException tooManyFailedLogins(int secondsLeft) {
        int seconds = Math.max(1, secondsLeft);
        int minutes = (seconds + 59) / 60;
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.RETRY_AFTER, Integer.toString(seconds));
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Too many failed sign-in attempts. Please try again in " + minutes
                        + (minutes == 1 ? " minute." : " minutes.")) {
            @Override
            public HttpHeaders getHeaders() {
                return headers;
            }
        };
    }

    private String retryMessage() {
        int retryMinutes = Math.max(1, (windowSeconds + 59) / 60);
        String unit = retryMinutes == 1 ? "minute" : "minutes";
        return "Too many sign-in attempts from this network. Try again in " + retryMinutes + " " + unit + ".";
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    /** Failed-password bucket for one email from one network (a newline can't appear in either part). */
    private static String failedLoginBucket(String email, String clientIp) {
        return fingerprint(FAILED_LOGIN_BUCKET, normalizeEmail(email) + "\n" + clientIp);
    }

    private static String fingerprint(String type, String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((type + ":" + value).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable.", impossible);
        }
    }
}