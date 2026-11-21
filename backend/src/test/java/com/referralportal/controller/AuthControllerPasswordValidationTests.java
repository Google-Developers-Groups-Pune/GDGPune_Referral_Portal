package com.referralportal.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.referralportal.dto.AuthDtos.LoginRequest;
import com.referralportal.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class AuthControllerPasswordValidationTests {

    @Test
    void loginRejectsPasswordOver72Utf8BytesBeforeAuthentication() {
        AuthenticationManager authenticationManager = mock(AuthenticationManager.class);
        AuthController controller = new AuthController();
        ReflectionTestUtils.setField(controller, "authenticationManager", authenticationManager);
        ReflectionTestUtils.setField(controller, "auth", new AuthService());

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> controller.login(new LoginRequest("user@example.com", "é".repeat(37)),
                        new MockHttpServletRequest(), new MockHttpServletResponse()));

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(authenticationManager);
    }
}