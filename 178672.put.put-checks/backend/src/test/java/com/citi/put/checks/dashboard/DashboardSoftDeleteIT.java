package com.citi.put.checks.dashboard;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.dashboard.dto.AttentionItemDto;
import com.citi.put.checks.dashboard.dto.DashboardSummaryDto;
import com.citi.put.checks.dashboard.dto.SearchResultDto;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class DashboardSoftDeleteIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired DashboardService dashboardService;
  @Autowired ObjectMapper objectMapper;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private UserIdentity adminIdentity;
  private UUID checkId;

  @BeforeEach
  void setUp() throws Exception {
    wireMock.resetAll();

    seedUser("dash-del@citi.com");
    seedCsi("92001", "Dashboard CSI");

    adminIdentity =
        objectMapper.readValue(
            """
        {"user_id":"dash-user","email":"dash-del@citi.com","name":"Dash Tester",
         "roles":["checks-admin"],"csi_ownership":[{"csi_id":"92001","role":"owner"}]}
        """,
            UserIdentity.class);

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {"user_id":"dash-user","email":"dash-del@citi.com","name":"Dash Tester",
         "roles":["checks-admin"],"csi_ownership":[{"csi_id":"92001","role":"owner"}]}
        """)));

    checkId = seedCheck("92001", "FAILING");

    jdbc.update(
        "UPDATE checks SET deleted_at = ? WHERE id = ?", Timestamp.from(Instant.now()), checkId);
  }

  @Test
  void softDeletedCheckNotInSummary() {
    DashboardSummaryDto before = dashboardService.getSummary(adminIdentity, "92001");

    UUID visibleCheck = seedCheck("92001", "FAILING");

    DashboardSummaryDto after = dashboardService.getSummary(adminIdentity, "92001");
    assertThat(after.counts().failing())
        .as("Non-deleted FAILING check should appear; soft-deleted one should not")
        .isEqualTo(before.counts().failing() + 1);

    jdbc.update("DELETE FROM checks WHERE id = ?", visibleCheck);
  }

  @Test
  void softDeletedCheckNotInAttentionItems() {
    List<AttentionItemDto> items = dashboardService.getAttentionItems(adminIdentity, null, 10);
    boolean found = items.stream().anyMatch(i -> checkId.toString().equals(i.id()));
    assertThat(found).as("Soft-deleted check should not appear in attention items").isFalse();
  }

  @Test
  void softDeletedCheckNotInSearch() {
    List<SearchResultDto> results = dashboardService.search(adminIdentity, "Dashboard", null);
    boolean found = results.stream().anyMatch(r -> r.title().contains("Soft Delete"));
    assertThat(found).as("Soft-deleted check should not appear in search results").isFalse();
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Test', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', 'dash-del@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?) ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedCheck(String csiId, String status) {
    UUID id = UUID.randomUUID();
    String configJson =
        "{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"http://localhost/x\",\"expectedStatusCode\":200,\"timeoutMs\":5000}";
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'Soft Delete Check', 'HTTP', ?, 'Dashboard CSI', ?,"
            + " ?::jsonb, 'dash-del@citi.com', ?, ?)",
        id,
        csiId,
        status,
        configJson,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }
}
