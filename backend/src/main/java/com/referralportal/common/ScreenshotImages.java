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
            case "image/png" -> pngChunksIntact(d) && sane(headerSize(d));
            case "image/jpeg" -> hasJpegScan(d) && hasJpegEnd(d) && sane(headerSize(d));
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

    /**
     * PNG: walks the chunks (length, type, data, CRC). IHDR must come first, every chunk must fit in the file, at
     * least one IDAT must carry image data, and an empty IEND must end the file exactly. A header and trailer with
     * nothing between them, or a cut-off upload, fails. Only lengths are read; nothing is decompressed.
     */
    private static boolean pngChunksIntact(byte[] d) {
        int at = 8;
        boolean first = true;
        boolean imageData = false;
        while (at + 12 <= d.length) {
            long length = be32(d, at);
            long end = at + 12 + length;
            if (end > d.length) {
                return false;
            }
            if (first && !ascii(d, at + 4, "IHDR")) {
                return false;
            }
            if (ascii(d, at + 4, "IDAT") && length > 0) {
                imageData = true;
            }
            if (ascii(d, at + 4, "IEND")) {
                return length == 0 && end == d.length && imageData;
            }
            first = false;
            at = (int) end;
        }
        return false;
    }

    /**
     * JPEG: walks the marker segments from the start and requires a start-of-scan (SOS) segment followed by
     * compressed data. A file with headers but no scan holds no picture.
     */
    private static boolean hasJpegScan(byte[] d) {
        int at = 2;
        while (at + 4 <= d.length) {
            if ((d[at] & 0xFF) != 0xFF) {
                return false;
            }
            int marker = d[at + 1] & 0xFF;
            if (marker == 0xFF) { // fill byte
                at++;
                continue;
            }
            if (marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { // markers without a length
                at += 2;
                continue;
            }
            if (marker == 0xD9) { // end of image before any scan
                return false;
            }
            int length = (d[at + 2] & 0xFF) << 8 | (d[at + 3] & 0xFF);
            if (length < 2 || at + 2 + length > d.length) {
                return false;
            }
            if (marker == 0xDA) {
                // Scan data must follow the SOS header, before the final FF D9.
                return at + 2 + length < d.length - 2;
            }
            at += 2 + length;
        }
        return false;
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

    /**
     * WebP: the RIFF size must match the file, every chunk must fit inside it (with its padding byte) and the
     * chunks must end exactly at the end of the file. A still image needs one VP8 or VP8L chunk with real data:
     * first in a simple file, or after a VP8X header in an extended one. A VP8X header alone is not an image.
     */
    private static int[] webpSize(byte[] d) {
        if (d.length < 20 || le32(d, 4) + 8 != d.length) {
            return null;
        }
        int[] canvas = null;
        int[] image = null;
        int at = 12;
        boolean first = true;
        while (at < d.length) {
            if (at + 8 > d.length) {
                return null;
            }
            long size = le32(d, at + 4);
            int payload = at + 8;
            long end = payload + size + (size & 1);
            if (end > d.length) {
                return null;
            }
            if (ascii(d, at, "VP8X")) {
                if (!first || size < 10) {
                    return null;
                }
                canvas = new int[] {le24(d, payload + 4) + 1, le24(d, payload + 7) + 1};
            } else if (ascii(d, at, "VP8L") || ascii(d, at, "VP8 ")) {
                if (image != null || (!first && canvas == null)) {
                    return null;
                }
                image = ascii(d, at, "VP8L") ? vp8lSize(d, payload, size) : vp8Size(d, payload, size);
                if (image == null) {
                    return null;
                }
            } else if (first) {
                return null;
            }
            first = false;
            at = (int) end;
        }
        if (image == null) {
            return null;
        }
        return canvas != null ? canvas : image;
    }

    /** Lossless: signature 0x2F, then 14-bit width and height; data must follow the 5-byte header. */
    private static int[] vp8lSize(byte[] d, int at, long size) {
        if (size <= 5 || (d[at] & 0xFF) != 0x2F) {
            return null;
        }
        long bits = le32(d, at + 1);
        return new int[] {(int) (bits & 0x3FFF) + 1, (int) ((bits >> 14) & 0x3FFF) + 1};
    }

    /** Lossy: key-frame start code 9D 01 2A, then 14-bit width and height; data must follow the 10-byte header. */
    private static int[] vp8Size(byte[] d, int at, long size) {
        if (size <= 10 || (d[at + 3] & 0xFF) != 0x9D || (d[at + 4] & 0xFF) != 0x01 || (d[at + 5] & 0xFF) != 0x2A) {
            return null;
        }
        return new int[] {le16(d, at + 6) & 0x3FFF, le16(d, at + 8) & 0x3FFF};
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

    private static long be32(byte[] d, int at) {
        return (long) (d[at] & 0xFF) << 24 | (d[at + 1] & 0xFF) << 16 | (d[at + 2] & 0xFF) << 8 | (d[at + 3] & 0xFF);
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
