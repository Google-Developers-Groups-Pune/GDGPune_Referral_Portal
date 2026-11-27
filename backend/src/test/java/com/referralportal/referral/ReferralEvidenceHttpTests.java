package com.referralportal.referral;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.referralportal.dto.ReferralRequestDtos.AcceptRequest;
import com.referralportal.dto.ReferralRequestDtos.CreateRequest;
import com.referralportal.dto.ReferralRequestDtos.SeekerRequest;
import com.referralportal.service.CompanyReferralRequestService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

/** The screenshot and admin endpoints through the real security filter chain (session auth + CSRF). */
@SpringBootTest(properties = {
        "spring.security.oauth2.client.registration.google.client-id=test-google-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-google-secret",
        "spring.security.oauth2.client.registration.github.client-id=test-github-client",
        "spring.security.oauth2.client.registration.github.client-secret=test-github-secret",
        "spring.datasource.url=jdbc:mysql://localhost:3307/referral_portal?allowPublicKeyRetrieval=true&useSSL=false",
        "spring.datasource.username=referral",
        "spring.datasource.password=referral_local"
})
@Transactional
class ReferralEvidenceHttpTests {

    private static final byte[] PNG = ScreenshotFixtures.PNG;

    @Autowired
    private WebApplicationContext context;
    @Autowired
    private CompanyReferralRequestService requests;
    @Autowired
    private JdbcClient jdbc;
    @Autowired
    private jakarta.persistence.EntityManager entityManager;
    @MockitoBean
    private JavaMailSender mailSender;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(SecurityMockMvcConfigurers.springSecurity()).build();
    }

    @Test
    void referrerUploadsScreenshotAndOnlyAnAdminCanReviewIt() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        String seekerEmail = "http-seeker-" + suffix + "@example.test";
        String referrerEmail = "http-referrer-" + suffix + "@example.test";
        String adminEmail = "http-admin-" + suffix + "@example.test";
        long seekerId = insertUser("Http Seeker", seekerEmail);
        long referrerId = insertUser("Http Referrer", referrerEmail);
        long adminId = insertUser("Http Admin", adminEmail);
        jdbc.sql("UPDATE users SET is_admin = TRUE WHERE id = ?").param(adminId).update();
        long companyId = insertCompany(suffix);
        insertProfile(seekerId);
        insertProfile(referrerId);
        jdbc.sql("INSERT INTO referrer_profiles (user_id, company_id, work_email, verified_at, accepts_referral_requests) "
                + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, TRUE)").params(referrerId, companyId, "http-work-" + suffix + "@company.test").update();
        SeekerRequest request = requests.create(auth(seekerEmail), new CreateRequest(companyId, "Platform Engineer",
                "https://jobs.example.test/platform", "", true, false));
        requests.accept(auth(referrerEmail), request.id(), new AcceptRequest(false, false));
        long responseId = jdbc.sql("SELECT id FROM referral_request_responses WHERE request_id = ? AND referrer_id = ?")
                .params(request.id(), referrerId).query(Long.class).single();
        MockMultipartFile screenshot = new MockMultipartFile("screenshot", "proof.png", "image/png", PNG);
        String submitUrl = "/api/referral-requests/" + request.id() + "/submitted";

        mvc.perform(multipart(submitUrl).file(screenshot).with(authentication(auth(referrerEmail))))
                .andExpect(status().isForbidden()); // no CSRF token
        mvc.perform(multipart(submitUrl).with(csrf()).with(authentication(auth(referrerEmail))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Attach a screenshot of the submitted referral."));
        mvc.perform(multipart(submitUrl).file(screenshot).with(csrf()).with(authentication(auth(referrerEmail))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("submitted"));

        mvc.perform(get("/api/admin/referral-evidence").with(authentication(auth(referrerEmail))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Only admins can do this."));
        mvc.perform(get("/api/me").with(authentication(auth(adminEmail))))
                .andExpect(jsonPath("$.isAdmin").value(true));
        mvc.perform(get("/api/me").with(authentication(auth(referrerEmail))))
                .andExpect(jsonPath("$.isAdmin").value(false));
        mvc.perform(get("/api/admin/referral-evidence?status=pending").with(authentication(auth(adminEmail))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].responseId", hasItem((int) responseId)));
        mvc.perform(get("/api/admin/referral-evidence/" + responseId + "/screenshot").with(authentication(auth(adminEmail))))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Security-Policy", containsString("sandbox")))
                .andExpect(content().bytes(PNG));

        String reviewUrl = "/api/admin/referral-evidence/" + responseId;
        entityManager.flush();
        String sha = jdbc.sql("SELECT sha256 FROM referral_submission_evidence WHERE response_id = ?")
                .param(responseId).query(String.class).single();
        String approveBody = "{\"screenshotSha256\":\"" + sha + "\"}";
        mvc.perform(post(reviewUrl + "/reject").with(csrf()).with(authentication(auth(adminEmail)))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\" \",\"screenshotSha256\":\"" + sha + "\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(reviewUrl + "/approve").with(csrf()).with(authentication(auth(adminEmail)))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()); // the reviewed screenshot must be named
        mvc.perform(post(reviewUrl + "/approve").with(csrf()).with(authentication(auth(referrerEmail)))
                        .contentType(MediaType.APPLICATION_JSON).content(approveBody))
                .andExpect(status().isForbidden());
        mvc.perform(post(reviewUrl + "/approve").with(csrf()).with(authentication(auth(adminEmail)))
                        .contentType(MediaType.APPLICATION_JSON).content(approveBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.creditAwarded").value(true));
    }

    private OAuth2AuthenticationToken auth(String email) {
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_USER"));
        var principal = new DefaultOAuth2User(authorities, Map.of("email", email, "name", "Test User"), "email");
        return new OAuth2AuthenticationToken(principal, authorities, "google");
    }

    private long insertUser(String name, String email) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.sql("INSERT INTO users (name, email, auth_provider) VALUES (?, ?, 'test')").params(name, email).update(keys);
        return keys.getKey().longValue();
    }

    private long insertCompany(String suffix) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.sql("INSERT INTO companies (name, email_domain) VALUES ('Evidence Test', ?)")
                .param("evidence-" + suffix + ".example.test").update(keys);
        return keys.getKey().longValue();
    }

    private void insertProfile(long userId) {
        jdbc.sql("INSERT INTO profiles (user_id, experience_level, pitch, skills, roles_wanted) "
                + "VALUES (?, '3-6', 'Builds things.', JSON_ARRAY('Java'), JSON_ARRAY('Backend'))").param(userId).update();
    }
}
