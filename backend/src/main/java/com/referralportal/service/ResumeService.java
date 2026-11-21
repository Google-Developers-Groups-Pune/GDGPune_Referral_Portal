package com.referralportal.service;

import com.referralportal.dto.ResumeDtos.ResumeInfo;
import com.referralportal.entity.ResumeFile;
import com.referralportal.repository.jpa.ResumeFileJpaRepository;
import com.referralportal.repository.jpa.UserJpaRepository;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Upload, read, and remove the signed-in seeker's own resume. One PDF per user, stored in MySQL. */
@Service
public class ResumeService {

    private static final long MAX_BYTES = 5L * 1024 * 1024; // 5 MB
    private static final String PDF = "application/pdf";

    @Autowired
    private UserService users;
    @Autowired
    private ResumeFileJpaRepository resumes;
    @Autowired
    private UserJpaRepository userJpa;

    @Transactional
    public void upload(Authentication auth, MultipartFile file) {
        long userId = users.current(auth).id();
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF file to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Resume must be 5 MB or smaller.");
        }
        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded file.");
        }
        if (!looksLikePdf(data)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only PDF resumes are accepted.");
        }
        ResumeFile resume = resumes.findById(userId).orElseGet(ResumeFile::new);
        if (resume.getUser() == null) {
            resume.setUser(userJpa.getReferenceById(userId));
        }
        resume.setFilename(safeName(file.getOriginalFilename()));
        resume.setContentType(PDF);
        resume.setSizeBytes(data.length);
        resume.setSha256(sha256(data));
        resume.setData(data);
        resume.setUploadedAt(Instant.now());
        resumes.save(resume);
    }

    public ResumeFile download(Authentication auth) {
        long userId = users.current(auth).id();
        return resumes.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No resume uploaded yet."));
    }

    public Optional<ResumeInfo> info(Authentication auth) {
        long userId = users.current(auth).id();
        return resumes.findMetaByUser_Id(userId).map(meta -> new ResumeInfo(
                meta.getFilename(), meta.getContentType(), meta.getSizeBytes(), meta.getUploadedAt().toString()));
    }

    @Transactional
    public void delete(Authentication auth) {
        long userId = users.current(auth).id();
        if (resumes.existsById(userId)) {
            resumes.deleteById(userId);
        }
    }

    /** Magic-byte check: a real PDF starts with "%PDF". Content-Type from the browser is not trusted. */
    private static boolean looksLikePdf(byte[] data) {
        return data.length >= 5 && data[0] == '%' && data[1] == 'P' && data[2] == 'D' && data[3] == 'F';
    }

    private static String safeName(String original) {
        if (original == null || original.isBlank()) {
            return "resume.pdf";
        }
        String name = original.replaceAll(".*[/\\\\]", "").trim();
        if (name.isBlank()) {
            name = "resume.pdf";
        }
        if (!name.toLowerCase().endsWith(".pdf")) {
            name = name + ".pdf";
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
