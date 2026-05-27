package com.citi.put.checks.reports;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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
class ReportDeliveryBatchIT {

  static GreenMail greenMail;
  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired com.citi.put.checks.scheduling.ReportDeliveryDispatcher dispatcher;

  private final List<UUID> reportIds = new ArrayList<>();

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    greenMail = new GreenMail(new ServerSetup(0, "localhost", ServerSetup.PROTOCOL_SMTP));
    greenMail.start();

    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.reports.delivery-enabled", () -> "true");
    registry.add("checks.reports.initial-delay-ms", () -> "300000");
    registry.add("checks.reports.batch-size", () -> "2");
    registry.add("spring.mail.host", () -> "localhost");
    registry.add("spring.mail.port", () -> String.valueOf(greenMail.getSmtp().getPort()));
  }

  @AfterAll
  static void cleanup() {
    wireMock.stop();
    if (greenMail != null) {
      greenMail.stop();
    }
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    greenMail.reset();
    reportIds.clear();
    jdbc.update("DELETE FROM report_executions");
    jdbc.update("DELETE FROM reports WHERE name LIKE 'Batch IT%'");
    jdbc.update(
        "UPDATE shedlock SET lock_until = now() - interval '1 minute'"
            + " WHERE name = 'reportDeliveryDispatcher'");
    jdbc.update("DELETE FROM shedlock WHERE name = 'reportDeliveryDispatcher'");

    seedUser("batch-report-owner@citi.com");
    seedCsi("81001", "Batch Report CSI");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "batch-report-user",
          "email": "batch-report-owner@citi.com",
          "name": "Batch Report Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "81001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void batchSizeLimitsReportDeliveries() {
    Instant pastTime = Instant.now().minus(1, ChronoUnit.MINUTES);
    for (int i = 0; i < 5; i++) {
      reportIds.add(seedActiveReport("Batch IT Report " + i, pastTime));
    }

    dispatcher.pollAndDeliver();

    int delivered = 0;
    for (UUID reportId : reportIds) {
      Integer count =
          jdbc.queryForObject(
              "SELECT count(*) FROM report_executions WHERE report_id = ?",
              Integer.class,
              reportId);
      if (count != null && count > 0) {
        delivered++;
      }
    }

    assertThat(delivered)
        .as("batch-size=2 should limit delivery to 2 of 5 due reports")
        .isEqualTo(2);
  }

  private UUID seedActiveReport(String name, Instant nextDeliveryAt) {
    UUID id = UUID.randomUUID();
    String scheduleJson = "{\"frequency\":\"daily\",\"time\":\"06:00\",\"timezone\":\"UTC\"}";
    jdbc.update(
        "INSERT INTO reports (id, name, description, template, status, sections, schedule,"
            + " recipients, created_by, created_at, updated_at, next_delivery_at)"
            + " VALUES (?, ?, 'Test', 'standard', 'ACTIVE', '[]'::jsonb, ?::jsonb,"
            + " '{batch@citi.com}'::text[], 'batch-report-owner@citi.com', ?, ?, ?)",
        id,
        name,
        scheduleJson,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()),
        Timestamp.from(nextDeliveryAt));
    return id;
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Test', ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', 'batch-report-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
