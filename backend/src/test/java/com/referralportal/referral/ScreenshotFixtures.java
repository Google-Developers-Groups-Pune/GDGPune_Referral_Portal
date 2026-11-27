package com.referralportal.referral;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Base64;
import javax.imageio.ImageIO;
import org.springframework.mock.web.MockMultipartFile;

/** Complete, valid images for upload tests, plus damaged variants. */
final class ScreenshotFixtures {

    static final byte[] PNG = encode("png", 40, 20);
    static final byte[] JPEG = encode("jpg", 40, 20);
    /** A 1x1 lossless WebP (ImageIO has no WebP writer). */
    static final byte[] WEBP = Base64.getDecoder().decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

    private ScreenshotFixtures() {}

    static MockMultipartFile screenshot() {
        return upload("proof.png", PNG);
    }

    static MockMultipartFile upload(String filename, byte[] data) {
        return new MockMultipartFile("screenshot", filename, "image/png", data);
    }

    static byte[] truncated(byte[] data) {
        return Arrays.copyOf(data, data.length - 20);
    }

    private static byte[] encode(String format, int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        image.setRGB(3, 3, 0x4285F4);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(image, format, out)) {
                throw new IllegalStateException("No ImageIO writer for " + format);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }
}
