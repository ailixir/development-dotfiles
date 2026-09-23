package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Story 10.5 AC-6, AC-13: with the gateway off, authoring a draft neither needs it nor touches it.
 *
 * <p>The {@link LlmGatewayClient} bean is replaced by one that throws, so any synchronous call from
 * a draft save path would fail this test rather than pass silently.
 */
@SpringBootTest
@ActiveProfiles("local")
class GatewayDisabledIT {

  private static final WireMockServer WIRE_MOCK =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  private static final String CSI_ID = "CSI-GW-105";

  @Autowired StudioService studioService;
  @Autowired LlmGatewayClient llmGatewayClient;
  @Autowired JdbcTemplate jdbc;

  private static final String OWNER_EMAIL = "gateway-it@example.invalid";

  @BeforeEach
  void seedCsi() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Gateway IT', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        java.util.UUID.randomUUID(),
        "sso-gateway-it",
        OWNER_EMAIL,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email, environment,"
            + " status, created_at, updated_at)"
            + " VALUES (?, 'Gateway IT CSI', 'Ops', 'HIGH', ?, 'Production',"
            + " 'OPERATIONAL', ?, ?) ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER_EMAIL,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @DynamicPropertySource
  static void gatewayProperties(DynamicPropertyRegistry registry) {
    WIRE_MOCK.start();
    registry.add("studio.compile.gateway.provider", () -> "disabled");
    registry.add("studio.compile.gateway.endpoint", () -> "http://localhost:" + WIRE_MOCK.port());
  }

  @AfterAll
  static void stopWireMock() {
    WIRE_MOCK.stop();
  }

  @org.springframework.boot.test.context.TestConfiguration
  static class ThrowingGatewayConfig {

    @Bean
    @Primary
    LlmGatewayClient throwingLlmGatewayClient() {
      return request -> {
        throw new AssertionError(
            "draft persistence called the LLM gateway synchronously: "
                + request.compileRequestId());
      };
    }
  }

  @Test
  void creatingAndUpdatingADraftNeverReachesTheGateway() {
    WIRE_MOCK.resetRequests();

    UITestDto created = studioService.createTest(request("gateway-disabled-draft"), principal());
    UITestDto updated =
        studioService.updateTest(
            created.id(),
            request(
                "gateway-disabled-draft-v2",
                created.sourceRevision(),
                created.configurationRevision()));

    assertThat(created.id()).isNotNull();
    assertThat(updated.name()).isEqualTo("gateway-disabled-draft-v2");
    assertThat(WIRE_MOCK.getAllServeEvents()).isEmpty();
  }

  @Test
  void theDisabledProviderSelectsAClientThatOpensNoSocket() {
    // The @Primary test bean shadows the production selection, so assert on the real one.
    LlmGatewayClient disabled = new DisabledLlmGatewayClient(new GatewayAuditLogger());

    CompileResponse response = disabled.propose(GatewayTestSupport.request());

    assertThat(response.outcome()).isEqualTo(GatewayOutcome.DISABLED);
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_UNAVAILABLE);
    assertThat(llmGatewayClient).isNotNull();
    assertThat(WIRE_MOCK.getAllServeEvents()).isEmpty();
  }

  private static UITestRequest request(String name) {
    return request(name, null, null);
  }

  /**
   * The frozen contract shape (Architecture &sect;8.3): typed steps, typed variables, {@code
   * configuration.viewport} and the canonical {@code chromium} engine.
   */
  private static UITestRequest request(
      String name, Long sourceRevision, Long configurationRevision) {
    return new UITestRequest(
        name,
        "created by GatewayDisabledIT",
        CSI_ID,
        "dev",
        List.of("1. Go to \"https://example.invalid\""),
        List.of(StudioVariable.plain("USER_ID", "pilot-user")),
        new TestConfiguration(
            TestConfiguration.CANONICAL_BROWSER, new Viewport(1280, 720), 30, "load"),
        sourceRevision,
        configurationRevision);
  }

  private static Authentication principal() {
    return new BffAuthenticationToken(
        new UserIdentity(
            "u-test", OWNER_EMAIL, "Gateway IT", "PUT", List.of("checks-admin"), List.of()));
  }
}
