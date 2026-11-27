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

    @Test
    void rejectsWebpWithoutUsableImageData() {
        // A VP8X canvas header (10-byte payload) and nothing else: claims 1x1, holds no picture.
        byte[] headerOnly = webp(chunk("VP8X", new byte[10]));
        assertStatus(HttpStatus.UNPROCESSABLE_CONTENT, headerOnly);

        // The image chunk claims more data than the file has, even though the outer RIFF size was adjusted.
        byte[] image = Arrays.copyOfRange(ScreenshotFixtures.WEBP, 12, ScreenshotFixtures.WEBP.length);
        byte[] cutChunk = webp(Arrays.copyOf(image, image.length - 4));
        assertStatus(HttpStatus.UNPROCESSABLE_CONTENT, cutChunk);

        // An extended file with a canvas header followed by the real image chunk is fine.
        byte[] extended = webp(chunk("VP8X", new byte[10]), image);
        assertEquals("image/webp", ScreenshotImages.read(ScreenshotFixtures.upload("a.webp", extended)).contentType());
    }

    private static byte[] chunk(String fourcc, byte[] payload) {
        byte[] out = new byte[8 + payload.length + (payload.length & 1)];
        System.arraycopy(fourcc.getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, out, 0, 4);
        putLe32(out, 4, payload.length);
        System.arraycopy(payload, 0, out, 8, payload.length);
        return out;
    }

    /** A RIFF/WEBP container around the given chunks, with the outer size always matching the file. */
    private static byte[] webp(byte[]... chunks) {
        int body = 0;
        for (byte[] c : chunks) {
            body += c.length;
        }
        byte[] out = new byte[12 + body];
        System.arraycopy("RIFF".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, out, 0, 4);
        putLe32(out, 4, 4 + body);
        System.arraycopy("WEBP".getBytes(java.nio.charset.StandardCharsets.US_ASCII), 0, out, 8, 4);
        int at = 12;
        for (byte[] c : chunks) {
            System.arraycopy(c, 0, out, at, c.length);
            at += c.length;
        }
        return out;
    }

    private static void putLe32(byte[] d, int at, int value) {
        for (int i = 0; i < 4; i++) {
            d[at + i] = (byte) (value >>> (8 * i));
        }
    }

    private static void assertStatus(HttpStatus expected, byte[] data) {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> ScreenshotImages.read(ScreenshotFixtures.upload("x.png", data)));
        assertEquals(expected, error.getStatusCode());
    }
}
