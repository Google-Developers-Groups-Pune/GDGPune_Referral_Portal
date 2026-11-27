package com.referralportal.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockServletContext;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.servlet.resource.ResourceHttpRequestHandler;

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
        assertNull(resolver.getResource("api", location));
        assertNull(resolver.getResource("login", location));
        assertNull(resolver.getResource("oauth2", location));
        assertNull(resolver.getResource("actuator", location));
    }

    @Test
    void requestsThroughResourceHandlerServeFilesAndFallBackButNeverEscapeLocation() throws Exception {
        Path secret = staticDir.getParent().resolve("spa-fallback-secret-" + System.nanoTime() + ".txt");
        Files.writeString(secret, "top secret");
        try {
            ResourceHttpRequestHandler handler = new ResourceHttpRequestHandler();
            handler.setServletContext(new MockServletContext());
            handler.setLocations(List.of(location));
            handler.setResourceResolvers(List.of(resolver));
            handler.afterPropertiesSet();

            assertThat(serve(handler, "assets/app.js").getContentAsString()).isEqualTo("console.log(1)");
            assertThat(serve(handler, "xyz").getContentAsString()).isEqualTo("<html>spa</html>");

            // Spring reports a rejected path as NoResourceFoundException, which MVC turns into a 404.
            assertThrows(NoResourceFoundException.class, () -> serve(handler, "../" + secret.getFileName()));
        } finally {
            Files.deleteIfExists(secret);
        }
    }

    private static MockHttpServletResponse serve(ResourceHttpRequestHandler handler, String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/" + path);
        request.setAttribute(HandlerMapping.PATH_WITHIN_HANDLER_MAPPING_ATTRIBUTE, path);
        MockHttpServletResponse response = new MockHttpServletResponse();
        handler.handleRequest(request, response);
        return response;
    }
}
