package com.referralportal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank(message = "Please enter your name.") @Size(max = 120) String name,
            @NotBlank(message = "Please enter your email.")
            @Email(message = "Please enter a valid email.") @Size(max = 190) String email,
            @NotBlank(message = "Please enter a password.")
            @Size(min = 8, max = 100, message = "Password must be at least 8 characters.") String password) {}

    public record LoginRequest(
            @NotBlank(message = "Please enter your email.")
            @Email(message = "Please enter a valid email.") String email,
            @NotBlank(message = "Please enter your password.") String password) {}
}
