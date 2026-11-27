package com.referralportal.common;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reads and checks an uploaded screenshot. The type comes from the file's own first bytes, never from the
 * browser's Content-Type, so whatever is later served back to an admin is really a PNG, JPEG or WebP image.
 */
public final class ScreenshotImages {

    public static final long MAX_BYTES = 5L * 1024 * 1024; // matches spring.servlet.multipart.max-file-size

    private ScreenshotImages() {}

    public record Screenshot(String filename, String contentType, byte[] data, String sha256) {}

    public static Screenshot read(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Attach a screenshot of the submitted referral.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "The screenshot must be 5 MB or smaller.");
        }
        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded screenshot.");
        }
        String contentType = detect(data);
        if (contentType == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Upload the screenshot as a PNG, JPEG or WebP image.");
        }
        return new Screenshot(safeName(file.getOriginalFilename(), contentType), contentType, data, sha256(data));
    }

    static String detect(byte[] d) {
        if (d.length >= 8 && (d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G'
                && d[4] == 0x0D && d[5] == 0x0A && d[6] == 0x1A && d[7] == 0x0A) {
            return "image/png";
        }
        if (d.length >= 3 && (d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (d.length >= 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F'
                && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') {
            return "image/webp";
        }
        return null;
    }

    private static String safeName(String original, String contentType) {
        String extension = switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            default -> ".webp";
        };
        String name = original == null ? "" : original.replaceAll(".*[/\\\\]", "").replaceAll("[\\p{Cntrl}\"]", "").trim();
        if (name.isBlank()) {
            name = "screenshot" + extension;
        }
        return name.length() > 255 ? name.substring(name.length() - 255) : name;
    }

    private static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
