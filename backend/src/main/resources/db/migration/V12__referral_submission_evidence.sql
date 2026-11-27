-- Screenshot a referrer uploads when marking a referral submitted. An admin reviews it: approval
-- confirms the referral and may award the referrer a credit; rejection sends the referral back to
-- the referrer to upload a new screenshot. One row per response; a re-upload replaces it.
CREATE TABLE referral_submission_evidence (
  response_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  uploaded_at DATETIME(6) NOT NULL,
  review_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  review_note VARCHAR(500) NULL,
  CONSTRAINT fk_submission_evidence_response
    FOREIGN KEY (response_id) REFERENCES referral_request_responses(id) ON DELETE CASCADE,
  CONSTRAINT fk_submission_evidence_reviewer
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_submission_evidence_queue (review_status, uploaded_at)
) ENGINE=InnoDB;
