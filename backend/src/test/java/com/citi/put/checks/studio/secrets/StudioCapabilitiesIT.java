package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * STUDIO-OBS-008 P1 and P6 over real HTTP, through the whole filter chain: {@code GET
 * /tests/{id}/capabilities}.
 *
 * <p>The vault is a counting double whose provider name can be switched. Every call that would
 * reach a Vault ({@code read}, {@code create}, {@code listSecretNames}) is counted and fails as an
 * unreachable Vault would, so "configuration is not health" and "no outbound Vault call" are
 * asserted on the double, not on source text.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class StudioCapabilitiesIT {

  private static final String ENVIRONMENT = "Production";

  @DynamicPropertySource
  static void configuration(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ONE = "60481";
  private static final String OWNER = "capabilities-owner@citi.com";
  private static final String READER = "capabilities-reader@citi.com";
  private static final String STRANGER = "capabilities-stranger@citi.com";

  /** Counts every call that would leave the process; each fails like an unreachable Vault. */
  static final class CountingVault implements StudioVaultProvider {
    final AtomicInteger calls = new AtomicInteger();
    volatile String name = DisabledStudioVaultProvider.NAME;

    @Override
    public String name() {
      return name;
    }

    @Override
    public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String referenceName) {
      calls.incrementAndGet();
      throw new VaultProviderUnavailableException("capability probe must never call Vault");
    }

    @Override
    public String create(VaultScope scope, String name, char[] value, List<String> origins) {
      calls.incrementAndGet();
      throw new VaultProviderUnavailableException("capability probe must never call Vault");
    }

    @Override
    public List<String> listSecretNames(VaultScope scope) {
      calls.incrementAndGet();
      throw new VaultProviderUnavailableException("capability probe must never call Vault");
    }
  }

  @TestConfiguration
  static class Doubles {
    @Bean
    @Primary
    CountingVault countingVault() {
      return new CountingVault();
    }
  }

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private CountingVault vault;

  private StudioExecutionFixtures fixtures;
  private UUID testOne;

  @BeforeEach
  void setUp() {
    vault.calls.set(0);
    vault.name = DisabledStudioVaultProvider.NAME;
    fixtures = new StudioExecutionFixtures(jdbc);
    for (String user : List.of(OWNER, READER, STRANGER)) {
      fixtures.seedUser(user);
    }
    for (String csi : List.of(CSI_ONE)) {
      fixtures.seedCsi(csi, OWNER);
    }
    testOne = fixtures.seedTest("Capabilities draft", CSI_ONE, OWNER, List.of("Open page"));
    new ObservedPublicationFixture(jdbc).seedCanonicalAuthoring(testOne);
  }

  // ── P1: authorization first ──────────────────────────────────────────────

  @Test
  void authorizesBeforeProviderAndAnyLookup() throws Exception {
    UUID absent = UUID.randomUUID();

    ResponseEntity<String> stranger = get(testOne, stranger());
    ResponseEntity<String> missing = get(absent, owner(CSI_ONE));
    ResponseEntity<String> unauthenticated = get(testOne, new HttpHeaders());

    assertThat(stranger.getStatusCode().value()).isEqualTo(403);
    assertThat(missing.getStatusCode().value()).isEqualTo(403);
    assertThat(stranger.getBody())
        .as("an absent test and a denied CSI are indistinguishable")
        .isEqualTo(missing.getBody());
    assertThat(unauthenticated.getStatusCode().value()).isEqualTo(401);
    assertThat(vault.calls.get()).isZero();

    ResponseEntity<String> ok = get(testOne, owner(CSI_ONE));
    assertThat(ok.getStatusCode().value()).isEqualTo(200);
    assertThat(ok.getHeaders().getFirst("Cache-Control")).contains("no-store");
    JsonNode body = objectMapper.readTree(ok.getBody());
    assertThat(fieldNames(body)).containsExactlyInAnyOrder("vaultSecrets", "guidedStart");
    assertThat(vault.calls.get()).as("a capability read never calls the provider").isZero();
  }

  @Test
  void capabilityTrueNeverGrantsWriteOrSecretUse() throws Exception {
    vault.name = "hashicorp";

    JsonNode reader = objectMapper.readTree(get(testOne, reader(CSI_ONE)).getBody());
    ResponseEntity<String> create =
        restTemplate.exchange(
            "/api/v1/studio/tests/" + testOne + "/secrets",
            HttpMethod.POST,
            new HttpEntity<>(
                "{\"name\":\"PW\",\"value\":\"x\",\"allowedOrigins\":[]}", reader(CSI_ONE)),
            String.class);

    assertThat(reader.path("vaultSecrets").asBoolean()).isTrue();
    assertThat(create.getStatusCode().value())
        .as("create still needs canWrite, whatever the capability says")
        .isEqualTo(403);
  }

  // ── P1: configuration is not provider health ─────────────────────────────

  @Test
  void configurationIsNotProviderHealth() throws Exception {
    vault.name = DisabledStudioVaultProvider.NAME;
    assertThat(objectMapper.readTree(get(testOne, owner(CSI_ONE)).getBody()).path("vaultSecrets"))
        .isEqualTo(objectMapper.getNodeFactory().booleanNode(false));

    vault.name = "hashicorp";
    JsonNode configured = objectMapper.readTree(get(testOne, owner(CSI_ONE)).getBody());

    assertThat(configured.path("vaultSecrets").asBoolean())
        .as("a configured but unreachable Vault still reports true")
        .isTrue();
    assertThat(configured.toString())
        .doesNotContain("hashicorp")
        .doesNotContain("none")
        .doesNotContain("token")
        .doesNotContain("address");
    assertThat(vault.calls.get()).as("lookup, list and read are never called").isZero();
  }

  // ── P6: the start context ────────────────────────────────────────────────

  @Test
  void startContextUsesExactPersistedScope() throws Exception {
    int sessionsBefore = rows("studio_guided_sessions");
    int guardsBefore = rows("studio_guided_csi_guards") + rows("studio_guided_csi_token_days");

    JsonNode start =
        objectMapper.readTree(get(testOne, owner(CSI_ONE)).getBody()).path("guidedStart");

    assertThat(start.path("available").asBoolean()).isTrue();
    JsonNode context = start.path("context");
    assertThat(fieldNames(context))
        .containsExactlyInAnyOrder(
            "schemaVersion",
            "testId",
            "sourceRevision",
            "configurationRevision",
            "environmentId",
            "versions");
    assertThat(context.path("schemaVersion").asInt()).isEqualTo(3);
    assertThat(context.path("testId").asText()).isEqualTo(testOne.toString());
    assertThat(context.path("environmentId").asText()).isEqualTo(ENVIRONMENT);
    assertThat(context.has("applicationId")).isFalse();
    assertThat(context.path("sourceRevision").asText())
        .isEqualTo(
            jdbc.queryForObject(
                "SELECT source_revision::text FROM ui_tests WHERE id=?", String.class, testOne));
    assertThat(context.path("configurationRevision").asText())
        .isEqualTo(
            jdbc.queryForObject(
                "SELECT configuration_revision::text FROM ui_tests WHERE id=?",
                String.class,
                testOne));
    assertThat(context.path("versions").toString()).isEqualTo("{\"contract\":3}");
    assertThat(rows("studio_guided_sessions"))
        .as("no session is created")
        .isEqualTo(sessionsBefore);
    assertThat(rows("studio_guided_csi_guards") + rows("studio_guided_csi_token_days"))
        .as("no budget row")
        .isEqualTo(guardsBefore);
  }

  @Test
  void aTestWithoutAStepIsRuntimeIncompatible() throws Exception {
    jdbc.update(
        "UPDATE ui_tests SET authoring=CAST('{\"authoringSchemaVersion\":2,\"steps\":[]}' AS jsonb)"
            + " WHERE id=?",
        testOne);
    JsonNode none =
        objectMapper.readTree(get(testOne, owner(CSI_ONE)).getBody()).path("guidedStart");
    assertThat(none.toString())
        .as("guided start needs a step")
        .isEqualTo("{\"available\":false,\"code\":\"RUNTIME_INCOMPATIBLE\"}");
  }

  /** STUDIO-GOV-001.3: the governed policy has no route, for anyone. */
  @Test
  void theRetiredGuidedPolicyRoutesAnswerNotFound() {
    String base = "/api/v1/studio/guided-policies";
    String id = UUID.randomUUID().toString();
    for (String route :
        List.of(
            base + "?csiId=" + CSI_ONE + "&environmentId=Production",
            base + "/" + id,
            base + "/" + id + "/versions/1/approval")) {
      for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.POST)) {
        HttpHeaders headers = owner(CSI_ONE);
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Idempotency-Key", UUID.randomUUID().toString());
        String body = method == HttpMethod.GET ? null : "{}";
        assertThat(
                restTemplate
                    .exchange(route, method, new HttpEntity<>(body, headers), String.class)
                    .getStatusCode()
                    .value())
            .as("%s %s", method, route)
            .isEqualTo(404);
      }
    }
  }

  @Test
  void aReaderWithoutExecuteGetsForbiddenScopeWhileVaultStillReportsConfiguration()
      throws Exception {
    vault.name = "hashicorp";

    JsonNode body = objectMapper.readTree(get(testOne, reader(CSI_ONE)).getBody());

    assertThat(body.path("vaultSecrets").asBoolean()).isTrue();
    assertThat(body.path("guidedStart").toString())
        .isEqualTo("{\"available\":false,\"code\":\"FORBIDDEN_SCOPE\"}");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private int rows(String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  private ResponseEntity<String> get(UUID test, HttpHeaders headers) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + test + "/capabilities",
        HttpMethod.GET,
        new HttpEntity<>(headers),
        String.class);
  }

  private static List<String> fieldNames(JsonNode json) {
    List<String> names = new ArrayList<>();
    json.fieldNames().forEachRemaining(names::add);
    return names;
  }

  private static HttpHeaders identity(String email, String ownership) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", ownership);
    return ObservedPublicationFixture.withSession(headers);
  }

  private static HttpHeaders owner(String csi) {
    return identity(OWNER, csi + ":owner");
  }

  private static HttpHeaders reader(String csi) {
    return identity(READER, csi + ":viewer");
  }

  private static HttpHeaders stranger() {
    return identity(STRANGER, "");
  }
}
