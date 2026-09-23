package com.citi.put.checks.reports;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import jakarta.mail.internet.MimeMessage;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ReportDeliveryDispatcherIT {

  static GreenMail greenMail;
  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired com.citi.put.checks.scheduling.ReportDeliveryDispatcher dispatcher;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    greenMail = new GreenMail(new ServerSetup(0, "127.0.0.1", ServerSetup.PROTOCOL_SMTP));
    greenMail.start();
    greenMail.getManagers().getUserManager().setAuthRequired(false);

    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.reports.delivery-enabled", () -> "true");
    registry.add("checks.reports.initial-delay-ms", () -> "300000");
    registry.add("spring.mail.host", () -> "127.0.0.1");
    registry.add("spring.mail.port", () -> greenMail.getSmtp().getPort());
    registry.add("spring.mail.username", () -> "");
    registry.add("spring.mail.password", () -> "");
  }

  @AfterAll
  static void cleanup() {
    wireMock.stop();
    if (greenMail != null) {
      greenMail.stop();
    }
  }

  private UUID reportId;

  @BeforeEach
  void setUp() throws Exception {
    wireMock.resetAll();
    // Purge messages without restarting the ephemeral listener captured by JavaMailSender.
    greenMail.purgeEmailFromAllMailboxes();
    jdbc.update("DELETE FROM report_executions");
    jdbc.update("DELETE FROM reports WHERE name LIKE 'Delivery IT%'");
    jdbc.update(
        "UPDATE shedlock SET lock_until = now() - interval '1 minute'"
            + " WHERE name = 'reportDeliveryDispatcher'");
    jdbc.update("DELETE FROM shedlock WHERE name = 'reportDeliveryDispatcher'");

    seedUser("delivery-owner@citi.com");
    seedCsi("80001", "Delivery CSI");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
                    {
                      "user_id": "delivery-user",
                      "email": "delivery-owner@citi.com",
                      "name": "Delivery Owner",
                      "roles": ["checks-admin"],
                      "csi_ownership": [{"csi_id": "80001", "role": "owner"}]
                    }
                    """)));
  }

  @Test
  @Order(1)
  void endToEndDelivery() throws Exception {
    Instant pastTime = Instant.now().minus(1, ChronoUnit.MINUTES);
    reportId = seedActiveReport("Delivery IT Report", pastTime, "test@citi.com");

    dispatcher.pollAndDeliver();

    List<Map<String, Object>> executions =
        jdbc.queryForList("SELECT * FROM report_executions WHERE report_id = ?", reportId);
    assertThat(executions).hasSize(1);
    assertThat(executions.get(0).get("status")).isEqualTo("SUCCESS");

    Instant nextDelivery =
        jdbc.queryForObject(
            "SELECT next_delivery_at FROM reports WHERE id = ?", Instant.class, reportId);
    assertThat(nextDelivery).isAfter(Instant.now());

    Instant lastSent =
        jdbc.queryForObject(
            "SELECT last_sent_at FROM reports WHERE id = ?", Instant.class, reportId);
    assertThat(lastSent).isNotNull();

    MimeMessage[] received = greenMail.getReceivedMessages();
    assertThat(received).hasSize(1);
    assertThat(received[0].getSubject()).startsWith("[PUT Checks] Delivery IT Report");
  }

  @Test
  @Order(2)
  void pausedReportNotDelivered() {
    reportId = seedPausedReport("Delivery IT Paused");

    dispatcher.pollAndDeliver();

    List<Map<String, Object>> executions =
        jdbc.queryForList("SELECT * FROM report_executions WHERE report_id = ?", reportId);
    assertThat(executions).isEmpty();
    assertThat(greenMail.getReceivedMessages()).isEmpty();
  }

  private UUID seedActiveReport(String name, Instant nextDeliveryAt, String... recipients) {
    UUID id = UUID.randomUUID();
    String scheduleJson = "{\"frequency\":\"daily\",\"time\":\"06:00\",\"timezone\":\"UTC\"}";
    String recipientsArray = "{" + String.join(",", recipients) + "}";
    jdbc.update(
        "INSERT INTO reports (id, name, description, template, status, sections, schedule,"
            + " recipients, created_by, created_at, updated_at, next_delivery_at)"
            + " VALUES (?, ?, 'Test', 'standard', 'ACTIVE', '[]'::jsonb, ?::jsonb,"
            + " ?::text[], 'delivery-owner@citi.com', ?, ?, ?)",
        id,
        name,
        scheduleJson,
        recipientsArray,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()),
        Timestamp.from(nextDeliveryAt));
    return id;
  }

  private UUID seedPausedReport(String name) {
    UUID id = UUID.randomUUID();
    String scheduleJson = "{\"frequency\":\"daily\",\"time\":\"06:00\",\"timezone\":\"UTC\"}";
    jdbc.update(
        "INSERT INTO reports (id, name, description, template, status, sections, schedule,"
            + " recipients, created_by, created_at, updated_at, next_delivery_at)"
            + " VALUES (?, ?, 'Test', 'standard', 'PAUSED', '[]'::jsonb, ?::jsonb,"
            + " '{paused@citi.com}'::text[], 'delivery-owner@citi.com', ?, ?, NULL)",
        id,
        name,
        scheduleJson,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'delivery-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
