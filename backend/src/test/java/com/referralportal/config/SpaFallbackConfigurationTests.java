package com.referralportal.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

class SpaFallbackConfigurationTests {

    @TempDir
    Path staticDir;

    private Resource location;
    private final SpaFallbackConfiguration.SpaFallbackResourceResolver resolver =
            new SpaFallbackConfiguration.SpaFallbackResourceResolver();

    @BeforeEach
    void setUp() throws Exception {
        Files.writeString(staticDir.resolve("index.html"), "<html>spa</html>");
        Files.createDirectories(staticDir.resolve("assets"));
        Files.writeString(staticDir.resolve("assets/app.js"), "console.log(1)");
        location = new FileSystemResource(staticDir.toString() + "/");
    }

    @Test
    void existingStaticFileIsServedAsIs() throws Exception {
        assertEquals("app.js", resolver.getResource("assets/app.js", location).getFilename());
    }

    @Test
    void unknownPageUrlFallsBackToIndexHtml() throws Exception {
        assertEquals("index.html", resolver.getResource("xyz", location).getFilename());
        assertEquals("index.html", resolver.getResource("some/deep/path", location).getFilename());
        assertEquals("index.html", resolver.getResource("chats/42", location).getFilename());
    }

    @Test
    void backendPathsAndMissingFilesStillReturnNotFound() throws Exception {
        assertNull(resolver.getResource("api/unknown", location));
        assertNull(resolver.getResource("actuator/unknown", location));
        assertNull(resolver.getResource("oauth2/authorization/unknown", location));
        assertNull(resolver.getResource("login/oauth2/code/unknown", location));
        assertNull(resolver.getResource("assets/missing-123.js", location));
    }
}
