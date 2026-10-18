package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.RunJob;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
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
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * studio-vault-secrets over real HTTP, through the whole filter chain and the context's own {@code
 * ObjectMapper}: the test-scoped save and list routes, their authorization order, their three
 * distinct provider answers, and the round trip from a saved secret to a dispatched job.
 *
 * <p>Identities come through the gateway header path, as in {@code StudioAuthorizationIT}. The
 * vault is a delegating double that switches between the fake and the shipped default-off provider,
 * so one context covers "connected", "not configured" and "down".
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class StudioSecretsControllerIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60471";
  private static final String OWNER = "vault-secrets-owner@citi.com";
  private static final String READER = "vault-secrets-reader@citi.com";
  private static final String STRANGER = "vault-secrets-stranger@citi.com";
  private static final String ENVIRONMENT = "Production";
  private static final String CANARY = "Http-Vault-Canary-3b8e51-never-stored";

  /** Delegates to the fake, or to the shipped default-off provider. */
  static final class SwitchableVault implements StudioVaultProvider {

    final FakeStudioVaultProvider fake = new FakeStudioVaultProvider(Map.of());
    private final DisabledStudioVaultProvider disabled = new DisabledStudioVaultProvider();
    private volatile boolean connected = true;

    private StudioVaultProvider delegate() {
      return connected ? fake : disabled;
    }

    @Override
    public String name() {
      return delegate().name();
    }

    @Override
    public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String referenceName) {
      return delegate().read(kind, scope, referenceName);
    }

    @Override
    public String create(VaultScope scope, String name, char[] value, List<String> origins) {
      return delegate().create(scope, name, value, origins);
    }

    @Override
    public List<String> listSecretNames(VaultScope scope) {
      return delegate().listSecretNames(scope);
    }

    void reset() {
      fake.clear();
      connected = true;
    }
  }

  @TestConfiguration
  static class Doubles {

    @Bean
    @Primary
    SwitchableVault switchableVault() {
      return new SwitchableVault();
    }

    @Bean
    @Primary
    StudioSecretFixtures.MutableSecretUseAuthorization mutableSecretUseAuthorization() {
      return new StudioSecretFixtures.MutableSecretUseAuthorization();
    }

    @Bean
    @Primary
    RecordingRunnerDispatchClient recordingRunnerDispatchClient() {
      return new RecordingRunnerDispatchClient();
    }
  }

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private SwitchableVault vault;
  @Autowired private StudioSecretFixtures.MutableSecretUseAuthorization entitlements;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;

  private StudioExecutionFixtures fixtures;
  private UUID testId;
  private UUID otherTestId;
  private ListAppender<ILoggingEvent> logs;
  private Level restoreLevel;

  @BeforeEach
  void setUp() {
    vault.reset();
    entitlements.clear();
    runner.reset();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedUser(STRANGER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    testId =
        fixtures
            .seedRunnableTest("Vault secrets draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    otherTestId =
        fixtures
            .seedRunnableTest("Other draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();

    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    logs = new ListAppender<>();
    logs.setContext(context);
    logs.start();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).addAppender(logs);
    restoreLevel = context.getLogger("com.citi.put.checks").getLevel();
    context.getLogger("com.citi.put.checks").setLevel(Level.TRACE);
  }

  @AfterEach
  void detachLogs() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).detachAppender(logs);
    context.getLogger("com.citi.put.checks").setLevel(restoreLevel);
    logs.stop();
  }

  // ── AC-V2-1, AC-V1-2: one write, from the row's scope, and the value goes nowhere else ────────

  @Test
  void anOwnerCreatesExactlyOneVaultWriteScopedByTheRowAndTheValueIsStoredNowhereElse()
      throws Exception {
    ResponseEntity<String> created = create(testId, body("LOGIN_PW"), owner());

    assertThat(created.getStatusCode().value()).isEqualTo(201);
    assertThat(created.getHeaders().getLocation()).isNull();
    JsonNode json = objectMapper.readTree(created.getBody());
    assertThat(json.path("name").asText()).isEqualTo("LOGIN_PW");
    assertThat(json.path("version").asText()).isEqualTo("1");
    assertThat(json.path("allowedOrigins").toString()).isEqualTo("[\"https://login.app.example\"]");
    assertThat(fieldNames(json)).containsExactlyInAnyOrder("name", "version", "allowedOrigins");
    assertThat(vault.fake.creates())
        .containsExactly(
            new FakeStudioVaultProvider.CreateCall(
                VaultScope.of(CSI_ID, ENVIRONMENT, testId), "LOGIN_PW"));

    // Proven present where it belongs, so the absences below are not true for the wrong reason.
    assertThat(
            new String(
                vault
                    .fake
                    .read(
                        StudioVaultProvider.ReferenceKind.SECRET,
                        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
                        "LOGIN_PW")
                    .orElseThrow()
                    .value()))
        .isEqualTo(CANARY);
    assertThat(created.getBody()).doesNotContain(CANARY);
    assertThat(capturedLogs()).contains("Studio secret created").doesNotContain(CANARY);
    assertThat(databaseColumnsContaining(CANARY)).isEmpty();
  }

  @Test
  void aBodyThatNamesTheScopeOrAnOldFieldIsRefusedAndNothingIsWritten() throws Exception {
    for (String extra :
        List.of("\"csiId\":\"60999\"", "\"environment\":\"dev\"", "\"label\":\"Login\"")) {
      ResponseEntity<String> refused =
          create(testId, body("LOGIN_PW").replace("{\"name\"", "{" + extra + ",\"name\""), owner());
      assertThat(refused.getStatusCode().value()).as(extra).isEqualTo(400);
      assertThat(objectMapper.readTree(refused.getBody()).path("error").asText())
          .isEqualTo("INVALID_SECRET_REQUEST");
      assertThat(refused.getBody()).doesNotContain(CANARY);
    }
    assertThat(vault.fake.creates()).isEmpty();
  }

  // ── NFR-3: authorization, and its order ──────────────────────────────────────────────────────

  @Test
  void aReaderMayListButNotCreate() {
    create(testId, body("LOGIN_PW"), owner());

    ResponseEntity<String> listed = list(testId, reader());
    assertThat(listed.getStatusCode().value()).isEqualTo(200);
    assertThat(listed.getBody()).isEqualTo("{\"data\":[{\"name\":\"LOGIN_PW\"}]}");
    assertThat(create(testId, body("OTHER"), reader()).getStatusCode().value()).isEqualTo(403);
  }

  @Test
  void aStrangerAndAnAbsentTestGetByteIdenticalRefusals() {
    UUID absent = UUID.randomUUID();
    ResponseEntity<String> strangerList = list(testId, stranger());
    ResponseEntity<String> absentList = list(absent, owner());
    ResponseEntity<String> strangerCreate = create(testId, body("X"), stranger());
    ResponseEntity<String> absentCreate = create(absent, body("X"), owner());
    // An unauthorized malformed body is still a 403: authorization is decided first.
    ResponseEntity<String> strangerMalformed = create(testId, "{not json", stranger());

    for (ResponseEntity<String> refused :
        List.of(strangerList, absentList, strangerCreate, absentCreate, strangerMalformed)) {
      assertThat(refused.getStatusCode().value()).isEqualTo(403);
      assertThat(refused.getBody()).isEqualTo(absentList.getBody());
    }
    assertThat(vault.fake.creates()).isEmpty();
  }

  @Test
  void aMalformedTestIdIsABadRequestForEveryCaller() {
    assertThat(
            restTemplate
                .exchange(
                    "/api/v1/studio/tests/not-a-uuid/secrets",
                    HttpMethod.GET,
                    new HttpEntity<>(owner()),
                    String.class)
                .getStatusCode()
                .value())
        .isEqualTo(400);
  }

  // ── NFR-5: three different answers ───────────────────────────────────────────────────────────

  @Test
  void aDuplicateNameIsAConflictAndTheStoredVersionIsUnchanged() throws Exception {
    create(testId, body("LOGIN_PW"), owner());
    String before = storedVersion(testId, "LOGIN_PW");

    ResponseEntity<String> duplicate = create(testId, body("LOGIN_PW"), owner());

    assertThat(duplicate.getStatusCode().value()).isEqualTo(409);
    assertThat(objectMapper.readTree(duplicate.getBody()).path("error").asText())
        .isEqualTo("SECRET_ALREADY_EXISTS");
    assertThat(storedVersion(testId, "LOGIN_PW")).isEqualTo(before);
  }

  @Test
  void withNoVaultConnectedBothRoutesAreNotConfigured() throws Exception {
    vault.connected = false;

    for (ResponseEntity<String> answer :
        List.of(list(testId, owner()), create(testId, body("LOGIN_PW"), owner()))) {
      assertThat(answer.getStatusCode().value()).isEqualTo(503);
      assertThat(objectMapper.readTree(answer.getBody()).path("error").asText())
          .isEqualTo("VAULT_NOT_CONFIGURED");
    }
  }

  @Test
  void aVaultOutageIsUnavailableNotNotConfigured() throws Exception {
    vault.fake.makeUnavailable();

    for (ResponseEntity<String> answer :
        List.of(list(testId, owner()), create(testId, body("LOGIN_PW"), owner()))) {
      assertThat(answer.getStatusCode().value()).isEqualTo(503);
      assertThat(objectMapper.readTree(answer.getBody()).path("error").asText())
          .isEqualTo("VAULT_UNAVAILABLE");
    }
  }

  // ── AC-V4-2, AC-V4-1: the list is per test, and a saved secret is the one its test resolves ──

  @Test
  void theListIsPerTestEvenWithTheSameCsiAndEnvironment() {
    create(testId, body("ONLY_A"), owner());
    create(otherTestId, body("ONLY_B"), owner());

    assertThat(list(testId, owner()).getBody()).isEqualTo("{\"data\":[{\"name\":\"ONLY_A\"}]}");
    assertThat(list(otherTestId, owner()).getBody())
        .isEqualTo("{\"data\":[{\"name\":\"ONLY_B\"}]}");
  }

  @Test
  void aSecretSavedForATestPassesItsAcceptanceAndReachesItsDispatchedJob() {
    UUID declaring =
        fixtures.seedTest("Declaring draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        declaring,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of("LOGIN_PW")));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, "LOGIN_PW");
    // Saved for another test with the same CSI and environment: must not satisfy this one.
    create(otherTestId, body("LOGIN_PW"), owner());
    ResponseEntity<String> refused = execute(declaring);
    assertThat(refused.getStatusCode().value()).isEqualTo(400);
    assertThat(refused.getBody()).contains("UNKNOWN_REFERENCE");

    assertThat(create(declaring, body("LOGIN_PW"), owner()).getStatusCode().value()).isEqualTo(201);
    UUID execution =
        studioService
            .executeTest(
                declaring,
                StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"),
                null,
                ObservedPublicationFixture.request(
                    StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner")))
            .executionId();
    var received = new java.util.concurrent.atomic.AtomicBoolean();
    runner.onSend(job -> received.set(job.resolvedSecrets().get("LOGIN_PW").matches(CANARY)));
    dispatcher.dispatch(execution);
    assertThat(received).isTrue();
    RunJob job =
        runner.sent().stream()
            .filter(sent -> execution.equals(sent.executionId()))
            .findFirst()
            .orElseThrow();
    assertThat(job.resolvedSecrets()).containsKey("LOGIN_PW");
    assertThat(job.resolvedSecrets().get("LOGIN_PW").matches(CANARY))
        .as("owned value erased after send")
        .isFalse();
    assertThat(databaseColumnsContaining(CANARY)).isEmpty();
  }

  // ── AC-V1-3, AC-V8-1: the plaintext routes are gone ──────────────────────────────────────────

  @Test
  void theRemovedPlaintextRoutesAreNotFoundForAnAuthenticatedCaller() {
    assertThat(
            restTemplate
                .exchange(
                    "/api/v1/secrets", HttpMethod.GET, new HttpEntity<>(admin()), String.class)
                .getStatusCode()
                .value())
        .isEqualTo(404);
    assertThat(
            restTemplate
                .exchange(
                    "/api/v1/secrets",
                    HttpMethod.POST,
                    new HttpEntity<>(body("LOGIN_PW"), admin()),
                    String.class)
                .getStatusCode()
                .value())
        .isEqualTo(404);
    ResponseEntity<String> stub =
        restTemplate.exchange(
            "/api/v1/internal/resolve-secret",
            HttpMethod.POST,
            new HttpEntity<>("{\"referenceId\":\"LOGIN_PW\"}", admin()),
            String.class);
    assertThat(stub.getStatusCode().value()).isEqualTo(404);
    assertThat(String.valueOf(stub.getBody())).doesNotContain("REDACTED");
  }

  // ── D13: an idempotent replay replays a body that has no value in it ─────────────────────────

  @Test
  void anIdempotencyReplayReturnsTheCachedCreatedBodyWhichCarriesNoValue() {
    HttpHeaders headers = owner();
    headers.set("Idempotency-Key", UUID.randomUUID().toString());

    ResponseEntity<String> first = create(testId, body("LOGIN_PW"), headers);
    ResponseEntity<String> replay = create(testId, body("LOGIN_PW"), headers);

    assertThat(first.getStatusCode().value()).isEqualTo(201);
    assertThat(replay.getStatusCode().value()).isEqualTo(201);
    assertThat(replay.getHeaders().getFirst("Idempotent-Replayed")).isEqualTo("true");
    assertThat(replay.getBody()).isEqualTo(first.getBody()).doesNotContain(CANARY);
    assertThat(vault.fake.creates()).hasSize(1);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────────

  private static String body(String name) {
    return "{\"name\":\""
        + name
        + "\",\"value\":\""
        + CANARY
        + "\",\"allowedOrigins\":[\"https://Login.App.Example\"]}";
  }

  private ResponseEntity<String> create(UUID test, String json, HttpHeaders headers) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + test + "/secrets",
        HttpMethod.POST,
        new HttpEntity<>(json, headers),
        String.class);
  }

  private ResponseEntity<String> list(UUID test, HttpHeaders headers) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + test + "/secrets",
        HttpMethod.GET,
        new HttpEntity<>(headers),
        String.class);
  }

  private ResponseEntity<String> execute(UUID test) {
    HttpHeaders headers = owner();
    // STUDIO-OBS-014 AC-9: the replay execute route requires an Idempotency-Key.
    headers.set("Idempotency-Key", UUID.randomUUID().toString());
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + test + "/execute",
        HttpMethod.POST,
        new HttpEntity<>("", headers),
        String.class);
  }

  private String storedVersion(UUID test, String name) {
    return vault
        .fake
        .read(
            StudioVaultProvider.ReferenceKind.SECRET,
            VaultScope.of(CSI_ID, ENVIRONMENT, test),
            name)
        .orElseThrow()
        .versionIdentifier();
  }

  private static List<String> fieldNames(JsonNode json) {
    List<String> names = new ArrayList<>();
    json.fieldNames().forEachRemaining(names::add);
    return names;
  }

  private String capturedLogs() {
    StringBuilder all = new StringBuilder();
    for (ILoggingEvent event : logs.list) {
      all.append(event.getFormattedMessage()).append('\n');
      if (event.getThrowableProxy() != null) {
        all.append(ThrowableProxyUtil.asString(event.getThrowableProxy())).append('\n');
      }
    }
    return all.toString();
  }

  /** Every text, json or binary column in schema {@code public} that holds the needle. */
  private List<String> databaseColumnsContaining(String needle) {
    List<Map<String, Object>> columns =
        jdbc.queryForList(
            "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c"
                + " JOIN information_schema.tables t ON t.table_schema = c.table_schema"
                + " AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'"
                + " WHERE c.table_schema = 'public' AND c.data_type IN"
                + " ('text','character varying','character','json','jsonb','bytea')");
    assertThat(columns).as("the scan must have columns to scan").isNotEmpty();
    List<String> hits = new ArrayList<>();
    for (Map<String, Object> column : columns) {
      String table = '"' + (String) column.get("table_name") + '"';
      String name = '"' + (String) column.get("column_name") + '"';
      String predicate =
          "bytea".equals(column.get("data_type"))
              ? "position(convert_to(?, 'UTF8') in " + name + ") > 0"
              : "strpos(" + name + "::text, ?) > 0";
      Integer count =
          jdbc.queryForObject(
              "SELECT count(*) FROM " + table + " WHERE " + predicate, Integer.class, needle);
      if (count != null && count > 0) {
        hits.add(table + "." + name);
      }
    }
    return hits;
  }

  private static HttpHeaders identity(String email, String roles, String ownership) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", roles);
    headers.set("X-User-Csi-Ownership", ownership);
    return ObservedPublicationFixture.withSession(headers);
  }

  private static HttpHeaders owner() {
    return identity(OWNER, "", CSI_ID + ":owner");
  }

  private static HttpHeaders reader() {
    return identity(READER, "", CSI_ID + ":viewer");
  }

  private static HttpHeaders stranger() {
    return identity(STRANGER, "", "");
  }

  private static HttpHeaders admin() {
    return identity(OWNER, "checks-admin", "");
  }
}
