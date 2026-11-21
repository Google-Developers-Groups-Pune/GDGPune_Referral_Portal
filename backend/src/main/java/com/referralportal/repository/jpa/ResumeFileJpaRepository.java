package com.referralportal.repository.jpa;

import com.referralportal.entity.ResumeFile;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResumeFileJpaRepository extends JpaRepository<ResumeFile, Long> {

    /** Metadata only — a closed projection so the resume bytes are not loaded to render the UI. */
    Optional<ResumeMetaView> findMetaByUser_Id(long userId);

    interface ResumeMetaView {
        String getFilename();

        String getContentType();

        long getSizeBytes();

        Instant getUploadedAt();
    }
}
