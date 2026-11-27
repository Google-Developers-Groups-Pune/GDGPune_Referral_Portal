package com.referralportal.controller;

import com.referralportal.dto.AdminDtos.EvidenceQueue;
import com.referralportal.dto.AdminDtos.RejectRequest;
import com.referralportal.entity.ReferralSubmissionEvidence;
import com.referralportal.service.ReferralEvidenceReviewService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin dashboard API. Every call checks {@code users.is_admin} (see AdminAccess). */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private ReferralEvidenceReviewService reviews;

    @GetMapping("/referral-evidence")
    public EvidenceQueue queue(Authentication auth, @RequestParam(value = "status", required = false) String status) {
        return reviews.queue(auth, status);
    }

    @GetMapping("/referral-evidence/{responseId}/screenshot")
    public ResponseEntity<byte[]> screenshot(Authentication auth, @PathVariable long responseId) {
        ReferralSubmissionEvidence evidence = reviews.screenshot(auth, responseId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(evidence.getContentType()))
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(evidence.getFilename()).build().toString())
                // The bytes are checked to be an image on upload; this stops a browser treating them as anything else.
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(evidence.getData());
    }

    @PostMapping("/referral-evidence/{responseId}/approve")
    public Map<String, Object> approve(Authentication auth, @PathVariable long responseId) {
        return reviews.approve(auth, responseId);
    }

    @PostMapping("/referral-evidence/{responseId}/reject")
    public Map<String, Object> reject(Authentication auth, @PathVariable long responseId,
            @Valid @RequestBody RejectRequest input) {
        return reviews.reject(auth, responseId, input.note());
    }
}
