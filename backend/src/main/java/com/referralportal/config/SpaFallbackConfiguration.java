package com.referralportal.config;

import java.io.IOException;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;
import org.springframework.web.servlet.resource.ResourceHandlerUtils;

/**
 * Serves the built SPA from {@code classpath:/static/} and falls back to {@code index.html} for
 * any unknown page URL, so client-side routing (including its catch-all redirect to "/") handles
 * it instead of Spring's whitelabel 404 page.
 *
 * <p>Backend namespaces and missing files that have an extension (e.g. a stale
 * {@code /assets/app-123.js}) still return a real 404.
 */
@Configuration
public class SpaFallbackConfiguration implements WebMvcConfigurer {

    private static final String STATIC_LOCATION = "classpath:/static/";
    private static final String[] BACKEND_PREFIXES = {"api/", "actuator/", "oauth2/", "login/"};

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(STATIC_LOCATION)
                .resourceChain(true)
                .addResolver(new SpaFallbackResourceResolver());
    }

    static final class SpaFallbackResourceResolver extends PathResourceResolver {

        @Override
        protected Resource getResource(String resourcePath, Resource location) throws IOException {
            // Same invalid-path rules as Spring's resource handler ("../", WEB-INF, URLs, bad encodings):
            // such paths get a 404, never a file and never the SPA fallback.
            if (!resourcePath.isEmpty() && ResourceHandlerUtils.shouldIgnoreInputPath(resourcePath)) {
                return null;
            }
            // super applies PathResourceResolver's checks, including that the file stays under the location.
            Resource requested = resourcePath.isEmpty() ? null : super.getResource(resourcePath, location);
            if (requested != null) {
                return requested;
            }
            if (!isSpaRoute(resourcePath)) {
                return null;
            }
            Resource index = location.createRelative("index.html");
            return index.exists() && index.isReadable() ? index : null;
        }

        static boolean isSpaRoute(String resourcePath) {
            for (String prefix : BACKEND_PREFIXES) {
                // Exclude the namespace itself (e.g. "login") as well as everything under it.
                if (resourcePath.startsWith(prefix) || resourcePath.equals(prefix.substring(0, prefix.length() - 1))) {
                    return false;
                }
            }
            String lastSegment = resourcePath.substring(resourcePath.lastIndexOf('/') + 1);
            return !lastSegment.contains(".");
        }
    }
}
