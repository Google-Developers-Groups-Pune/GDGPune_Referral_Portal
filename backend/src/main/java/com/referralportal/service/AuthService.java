package com.referralportal.service;

import com.referralportal.repository.UserRepository;
import com.referralportal.repository.jpa.UserJpaRepository;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Registration for email/password accounts. Sign-in itself goes through AuthenticationManager. */
@Service
public class AuthService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int BCRYPT_MAX_PASSWORD_BYTES = 72;

    @Autowired
    private UserRepository users;
    @Autowired
    private UserJpaRepository userJpa;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @Transactional
    public void register(String name, String email, String rawPassword) {
        if (rawPassword.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_PASSWORD_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Password must be no more than 72 UTF-8 bytes.");
        }
        String normalizedEmail = email.trim().toLowerCase();
        if (userJpa.findByEmail(normalizedEmail).isPresent()) {
            throw emailTaken();
        }
        try {
            users.createPasswordAccount(name.trim(), normalizedEmail, passwordEncoder.encode(rawPassword), newToken());
        } catch (DataIntegrityViolationException concurrentInsert) {
            throw emailTaken();
        }
    }

    private static ResponseStatusException emailTaken() {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "An account with this email already exists. Try signing in instead.");
    }

    private static String newToken() {
        byte[] bytes = new byte[16]; // 128 bits, rendered as 32 hex characters
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
