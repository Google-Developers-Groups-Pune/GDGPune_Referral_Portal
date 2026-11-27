package com.referralportal.service;

import com.referralportal.entity.User;
import com.referralportal.repository.jpa.UserJpaRepository;
import com.referralportal.user.CurrentUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin rights come from {@code users.is_admin}, read on every call rather than cached in the session, so
 * granting or revoking admin takes effect immediately for both password and Google/GitHub accounts:
 * {@code UPDATE users SET is_admin = TRUE WHERE email = '...';}
 */
@Service
public class AdminAccess {

    @Autowired
    private UserService users;
    @Autowired
    private UserJpaRepository userRows;

    public User requireAdmin(Authentication authentication) {
        CurrentUser current = users.current(authentication);
        return userRows.findById(current.id())
                .filter(User::isAdmin)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Only admins can do this."));
    }

    public boolean isAdmin(long userId) {
        return userRows.findById(userId).map(User::isAdmin).orElse(false);
    }
}
