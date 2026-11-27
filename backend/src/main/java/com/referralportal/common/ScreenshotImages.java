package com.referralportal.common;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reads and checks an uploaded screenshot. The type comes from the file's own bytes, never from the browser's
 * Content-Type, and the file's structure is checked (header, dimensions, intact ending) so an admin is not
 * handed something that cannot be displayed. The image is not fully decoded on the server, which keeps a
 * hostile file from making the server allocate memory for a huge image.
 */
public final class ScreenshotImages {

    public static final long MAX_BYTES = 5L * 1024 * 1024; // matches spring.servlet.multipart.max-file-size
    static final int MAX_SIDE = 20_000;

    private static final String INVALID = "Upload the screenshot as a PNG, JPEG or WebP image.";
    private static final String DAMAGED = "The screenshot file looks damaged. Take or export it again and upload it.";

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
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, INVALID);
        }
        if (!intact(data, contentType)) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT, DAMAGED);
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
        if (d.length >= 12 && ascii(d, 0, "RIFF") && ascii(d, 8, "WEBP")) {
            return "image/webp";
        }
        return null;
    }

    /** True when the file has a readable header with sane dimensions and is not cut off. */
    static boolean intact(byte[] d, String contentType) {
        return switch (contentType) {
            case "image/png" -> endsWithPngTrailer(d) && sane(headerSize(d));
            case "image/jpeg" -> hasJpegEnd(d) && sane(headerSize(d));
            case "image/webp" -> sane(webpSize(d));
            default -> false;
        };
    }

    /** Width and height from the image header via ImageIO, without decoding pixels. Null when unreadable. */
    private static int[] headerSize(byte[] data) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(data))) {
            if (in == null) {
                return null;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                return null;
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                return new int[] {reader.getWidth(0), reader.getHeight(0)};
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** PNG files end with an IEND chunk: length 0, "IEND", fixed CRC. A cut-off upload does not. */
    private static boolean endsWithPngTrailer(byte[] d) {
        int at = d.length - 12;
        return at >= 8 && d[at] == 0 && d[at + 1] == 0 && d[at + 2] == 0 && d[at + 3] == 0 && ascii(d, at + 4, "IEND");
    }

    /** JPEG data ends with the EOI marker FF D9; some tools append a few bytes after it, so look near the end. */
    private static boolean hasJpegEnd(byte[] d) {
        for (int i = d.length - 2; i >= Math.max(2, d.length - 4096); i--) {
            if ((d[i] & 0xFF) == 0xFF && (d[i + 1] & 0xFF) == 0xD9) {
                return true;
            }
        }
        return false;
    }

    /** WebP: the RIFF size must match the file, and the first chunk must be a known image chunk. */
    private static int[] webpSize(byte[] d) {
        if (d.length < 30) {
            return null;
        }
        long riffSize = le32(d, 4);
        if (riffSize + 8 != d.length) {
            return null;
        }
        if (ascii(d, 12, "VP8X")) {
            return new int[] {le24(d, 24) + 1, le24(d, 27) + 1};
        }
        if (ascii(d, 12, "VP8L")) {
            if ((d[20] & 0xFF) != 0x2F) {
                return null;
            }
            long bits = le32(d, 21);
            return new int[] {(int) (bits & 0x3FFF) + 1, (int) ((bits >> 14) & 0x3FFF) + 1};
        }
        if (ascii(d, 12, "VP8 ")) {
            // Key frame start code 9D 01 2A, then 14-bit width and height.
            if ((d[23] & 0xFF) != 0x9D || (d[24] & 0xFF) != 0x01 || (d[25] & 0xFF) != 0x2A) {
                return null;
            }
            return new int[] {le16(d, 26) & 0x3FFF, le16(d, 28) & 0x3FFF};
        }
        return null;
    }

    private static boolean sane(int[] size) {
        return size != null && size[0] > 0 && size[1] > 0 && size[0] <= MAX_SIDE && size[1] <= MAX_SIDE;
    }

    private static boolean ascii(byte[] d, int offset, String text) {
        byte[] expected = text.getBytes(StandardCharsets.US_ASCII);
        if (offset < 0 || offset + expected.length > d.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if (d[offset + i] != expected[i]) {
                return false;
            }
        }
        return true;
    }

    private static int le16(byte[] d, int at) {
        return (d[at] & 0xFF) | (d[at + 1] & 0xFF) << 8;
    }

    private static int le24(byte[] d, int at) {
        return le16(d, at) | (d[at + 2] & 0xFF) << 16;
    }

    private static long le32(byte[] d, int at) {
        return le24(d, at) | (long) (d[at + 3] & 0xFF) << 24;
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
