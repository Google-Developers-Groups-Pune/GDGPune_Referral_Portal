package com.referralportal.referral;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.referralportal.common.ScreenshotImages;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class ScreenshotImagesTests {

    @Test
    void acceptsCompletePngJpegAndWebpImages() {
        assertEquals("image/png", ScreenshotImages.read(ScreenshotFixtures.upload("a.png", ScreenshotFixtures.PNG)).contentType());
        assertEquals("image/jpeg", ScreenshotImages.read(ScreenshotFixtures.upload("a.jpg", ScreenshotFixtures.JPEG)).contentType());
        assertEquals("image/webp", ScreenshotImages.read(ScreenshotFixtures.upload("a.webp", ScreenshotFixtures.WEBP)).contentType());
    }

    @Test
    void rejectsFilesThatOnlyStartLikeAnImage() {
        byte[] headerOnlyPng = Arrays.copyOf(ScreenshotFixtures.PNG, 12);
        assertStatus(HttpStatus.UNPROCESSABLE_CONTENT, headerOnlyPng);
        assertStatus(HttpStatus.UNPROCESSABLE_CONTENT, ScreenshotFixtures.truncated(ScreenshotFixtures.PNG));
        assertStatus(HttpStatus.UNPROCESSABLE_CONTENT, ScreenshotFixtures.truncated(ScreenshotFixtures.JPEG));
        assertStatus(HttpStatus.UNPROCESSABLE_CONTENT, Arrays.copyOf(ScreenshotFixtures.WEBP, ScreenshotFixtures.WEBP.length - 2));
        assertStatus(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "%PDF-1.7 not an image".getBytes());
    }

    private static void assertStatus(HttpStatus expected, byte[] data) {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> ScreenshotImages.read(ScreenshotFixtures.upload("x.png", data)));
        assertEquals(expected, error.getStatusCode());
    }
}
