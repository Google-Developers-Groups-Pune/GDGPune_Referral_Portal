package com.referralportal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class AdminDtos {

    private AdminDtos() {}

    /** One submitted referral awaiting (or past) admin review of its screenshot. */
    public record EvidenceItem(long responseId, long requestId, String companyName, String roleTitle, String jobUrl,
            String seekerName, String seekerEmail, String referrerName, String referrerTitle, String referrerWorkEmail,
            String acceptedAt, String submittedAt, String filename, String contentType, long sizeBytes, String sha256,
            String uploadedAt, String reviewStatus, String reviewNote, String reviewedAt, String reviewerName) {}

    public record EvidenceCounts(long pending, long approved, long rejected) {}

    public record EvidenceQueue(EvidenceCounts counts, List<EvidenceItem> items) {}

    /**
     * {@code screenshotSha256} is the screenshot the admin actually looked at. If the referrer has replaced it
     * since, the review is refused, so a dialog left open never approves or rejects an image nobody saw.
     */
    public record ApproveRequest(
            @NotBlank(message = "Reload the queue and review the screenshot again.") String screenshotSha256) {}

    public record RejectRequest(
            @NotBlank(message = "Tell the referrer why the screenshot was rejected.")
            @Size(max = 500, message = "Keep the reason under 500 characters.") String note,
            @NotBlank(message = "Reload the queue and review the screenshot again.") String screenshotSha256) {}
}
