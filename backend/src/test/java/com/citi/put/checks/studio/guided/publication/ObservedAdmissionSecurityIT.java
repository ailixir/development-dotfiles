package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.config.ChecksExceptionHandler;
import com.citi.put.checks.config.StudioInternalSecurityConfig;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.DispatchAuthorization;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.ExecutionControlService;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.StrictInternalBodyReader;
import com.citi.put.checks.studio.internal.StudioInternalController;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * C7/C12 over real HTTP and the unchanged ordinary service-token filter chain. The JDBC double
 * supplies only a read-only closed binding fixture; it never manufactures admission/readiness. Real
 * schema, policy, expiry and tuple guards execute. The otherwise-valid tuple reaches the real
 * locked admission transaction, which finds no ledger row behind the double and refuses before any
 * CAS. Successful PostgreSQL CAS/receipt/browser proof belongs to GuidedPublicationReplayIT, not
 * this refusal slice. No test authentication provider is installed.
 *
 * <p>2026-10-13 (STUDIO-OBS-012A AC-7): STUDIO-OBS-007 dropped the account provider (EXT-001; login
 * is author-written {@code <secret ID>} steps) and with it the v3 {@code accountGrantId} admission
 * field, the account port and {@code AUTH_CONNECTION_REQUIRED}. The account cases are ported by
 * name: {@code accountGrantId} is no longer a closed identity or stored-tuple field, it is a
 * removed field the closed schema refuses ({@link
 * #extraIdentityOrPrivateMetadataCannotBeSmuggledIntoObservedBody}); the account-boundary case
 * becomes {@link
 * #otherwiseValidTupleReachesTheLockedAdmissionTransactionButNeverCasOrSecretResolution}.
 */
@SpringBootTest(
    classes = ObservedAdmissionSecurityIT.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "studio.execution.callback.service-token=synthetic-ordinary-service-token-only")
@ActiveProfiles("test")
class ObservedAdmissionSecurityIT {
  private static final String TOKEN = "synthetic-ordinary-service-token-only";
  private static final String COOKIE = "synthetic-bff-cookie-canary";
  private static final String GUIDED_TOKEN = "synthetic-guided-only-credential-canary";
  private static final String METADATA = "synthetic-private-metadata-canary";
  private static final Instant NOW = Instant.parse("2026-10-09T00:00:10.000Z");
  private static final GuidedContracts CONTRACTS = new GuidedContracts();
  private static final ObjectNode FIXTURE = fixture();
  private static final UUID EXECUTION =
      UUID.fromString(FIXTURE.path("admissionRequest").path("executionId").asText());
  private static final List<String> REQUEST_FIELDS =
      List.of(
          "schemaVersion",
          "kind",
          "executionId",
          "startedAt",
          "attemptId",
          "runnerInstanceId",
          "admissionId",
          "revisionId",
          "revisionDigest",
          "artifactHash",
          "configurationHash",
          "learnedPlanHash",
          "referencePolicyHash",
          "publicationEvidenceHash",
          "scopeHash",
          "currentPolicyHash",
          "grantId",
          "profile",
          "build");

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration(
      exclude = {
        DataSourceAutoConfiguration.class,
        HibernateJpaAutoConfiguration.class,
        FlywayAutoConfiguration.class
      })
  @EnableConfigurationProperties(StudioExecutionProperties.class)
  @Import({
    StudioInternalSecurityConfig.class,
    StudioInternalController.class,
    ChecksExceptionHandler.class
  })
  static class Application {
    @Bean
    GuidedContracts contracts() {
      return CONTRACTS;
    }

    @Bean
    BindingReads reads() {
      return new BindingReads();
    }

    @Bean
    JdbcTemplate jdbc(BindingReads reads) {
      JdbcTemplate jdbc = mock(JdbcTemplate.class);
      when(jdbc.queryForList(anyString(), eq(String.class), any(UUID.class)))
          .thenAnswer(
              call -> {
                assertThat(call.<String>getArgument(0)).contains("observed_revision_binding");
                UUID id = call.getArgument(2);
                return id.equals(EXECUTION) && reads.binding.get() != null
                    ? List.of(reads.binding.get().toString())
                    : List.of();
              });
      when(jdbc.queryForObject(anyString(), eq(Integer.class), any(UUID.class)))
          .thenAnswer(
              call -> {
                assertThat(call.<String>getArgument(0)).contains("cancel_requested_at");
                return reads.cancelled.get();
              });
      return jdbc;
    }

    @Bean
    com.citi.put.checks.studio.dispatch.StudioReferenceResolver references() {
      return mock(com.citi.put.checks.studio.dispatch.StudioReferenceResolver.class);
    }

    @Bean
    ObservedRevisionVerifier verifier() {
      return mock(ObservedRevisionVerifier.class);
    }

    @Bean
    DispatchAuthorization authority() {
      return mock(DispatchAuthorization.class);
    }

    @Bean
    ObservedReplayProperties replayProperties() {
      var catalog = CONTRACTS.object();
      catalog.set("profile", FIXTURE.path("admissionRequest").path("profile"));
      catalog.set("build", FIXTURE.path("admissionRequest").path("build"));
      return new ObservedReplayProperties(
          true,
          30000,
          1048576,
          4194304,
          2097152,
          "[" + catalog + "]",
          "[" + FIXTURE.path("trustedPolicy") + "]",
          1280,
          720);
    }

    @Bean
    ObservedReplayPins pins(ObservedReplayProperties properties) {
      return new ObservedReplayPins(CONTRACTS, properties);
    }

    @Bean
    ObservedReplayAuthorization observed(
        JdbcTemplate jdbc,
        ObservedRevisionVerifier verifier,
        ObservedReplayPins pins,
        DispatchAuthorization authority,
        com.citi.put.checks.studio.dispatch.StudioReferenceResolver references,
        ObservedReplayProperties properties,
        StudioExecutionProperties execution) {
      return spy(
          new ObservedReplayAuthorization(
              jdbc,
              CONTRACTS,
              verifier,
              pins,
              references,
              properties,
              execution,
              Clock.fixed(NOW, ZoneOffset.UTC)));
    }

    @Bean
    AdmissionCasService admission(
        StudioDispatchLedgerStatements statements, StudioExecutionProperties properties) {
      return spy(new AdmissionCasService(statements, properties));
    }

    @Bean
    StrictInternalBodyReader reader(ObjectMapper mapper) {
      return spy(new StrictInternalBodyReader(mapper));
    }
  }

  static final class BindingReads {
    final AtomicReference<ObjectNode> binding = new AtomicReference<>();
    final AtomicInteger cancelled = new AtomicInteger();
  }

  @LocalServerPort private int port;
  @Autowired private BindingReads reads;
  @Autowired private JdbcTemplate jdbc;
  @MockBean private StudioDispatchLedgerStatements statements;
  @Autowired private ObservedReplayAuthorization observed;
  @Autowired private AdmissionCasService admission;
  @Autowired private StrictInternalBodyReader reader;
  @Autowired private com.citi.put.checks.studio.dispatch.StudioReferenceResolver references;
  @Autowired private ObservedRevisionVerifier verifier;
  @Autowired private DispatchAuthorization authority;
  @MockBean private ProgressReportService progress;
  @MockBean private ExecutionControlService control;
  private final HttpClient http =
      HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

  @BeforeEach
  void reset() {
    reads.binding.set((ObjectNode) FIXTURE.path("job").path("binding").deepCopy());
    reads.cancelled.set(0);
    clearInvocations(
        jdbc,
        statements,
        observed,
        admission,
        reader,
        references,
        verifier,
        authority,
        progress,
        control);
  }

  static Stream<Arguments> credentials() {
    return Stream.of(
        Arguments.of(null, 401, "SERVICE_IDENTITY_REQUIRED"),
        Arguments.of("", 401, "SERVICE_IDENTITY_REQUIRED"),
        Arguments.of("Bearer", 401, "SERVICE_IDENTITY_REQUIRED"),
        Arguments.of("Bearer ", 401, "SERVICE_IDENTITY_REQUIRED"),
        Arguments.of("Bearer " + METADATA, 403, "SERVICE_IDENTITY_REJECTED"),
        Arguments.of("Basic " + TOKEN, 401, "SERVICE_IDENTITY_REQUIRED"),
        Arguments.of("Bearer " + GUIDED_TOKEN, 403, "SERVICE_IDENTITY_REJECTED"));
  }

  @ParameterizedTest
  @MethodSource("credentials")
  void ordinaryIdentityIsRequiredBeforeParsingOrAnyAdmissionWork(
      String credential, int status, String code) throws Exception {
    var response = post("observed-admission", EXECUTION, credential, Map.of(), "{" + METADATA);
    fixedIdentity(response, status, code);
    verifyNoInteractions(
        observed,
        admission,
        reader,
        jdbc,
        statements,
        references,
        verifier,
        authority,
        progress,
        control);
  }

  @Test
  void bffCookieAndForgedCertificateOrForwardedIdentityGrantNothing() throws Exception {
    var headers =
        Map.of(
            "Cookie",
            "put_session=" + COOKIE,
            "X-Forwarded-Client-Cert",
            "By=trusted;Subject=runner;URI=" + METADATA,
            "X-SSL-Client-Verify",
            "SUCCESS",
            "X-Client-Cert",
            METADATA,
            "X-User-Id",
            "new-principal",
            "X-User-Roles",
            "ROLE_STUDIO_RUNNER_CALLBACK",
            "X-Forwarded-Proto",
            "https",
            "X-Forwarded-User",
            "runner");
    fixedIdentity(
        post("observed-admission", EXECUTION, null, headers, request().toString()),
        401,
        "SERVICE_IDENTITY_REQUIRED");
    fixedIdentity(
        post(
            "observed-admission",
            EXECUTION,
            "Bearer " + GUIDED_TOKEN,
            headers,
            request().toString()),
        403,
        "SERVICE_IDENTITY_REJECTED");
    verifyNoInteractions(
        observed, admission, reader, jdbc, statements, references, verifier, authority);
  }

  @Test
  void queryCredentialIsNotAnOrdinaryServiceCredential() throws Exception {
    var response =
        post(
            "observed-admission?access_token=" + TOKEN,
            EXECUTION,
            null,
            Map.of(),
            request().toString());
    fixedIdentity(response, 401, "SERVICE_IDENTITY_REQUIRED");
    verifyNoInteractions(observed, admission, jdbc, references, statements);
  }

  static Stream<Arguments> malformedIdentity() {
    return REQUEST_FIELDS.stream()
        .flatMap(
            field ->
                Stream.of("missing", "null", "wrong-type")
                    .map(mutation -> Arguments.of(field, mutation)));
  }

  @ParameterizedTest
  @MethodSource("malformedIdentity")
  void validTokenCannotSkipAnyClosedObservedIdentityField(String field, String mutation)
      throws Exception {
    ObjectNode invalid = request();
    switch (mutation) {
      case "missing" -> invalid.remove(field);
      case "null" -> invalid.putNull(field);
      case "wrong-type" -> invalid.putArray(field).add(METADATA);
      default -> throw new AssertionError("Unknown fixture mutation");
    }
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid.toString()),
        422,
        "INVALID_CONTRACT");
    verifyNoInteractions(jdbc, statements, references, verifier, authority);
    noAdmission();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "principalId",
        "account",
        "credential",
        "resolvedValues",
        "certificateIdentity",
        "accountGrantId"
      })
  void extraIdentityOrPrivateMetadataCannotBeSmuggledIntoObservedBody(String field)
      throws Exception {
    var invalid = request().put(field, METADATA);
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid.toString()),
        422,
        "INVALID_CONTRACT");
    verifyNoInteractions(jdbc, statements, references);
    noAdmission();
  }

  @ParameterizedTest
  @ValueSource(strings = {"null", "[]", "true", "{", "{\"schemaVersion\":2,\"schemaVersion\":2}"})
  void rawMalformedAndDuplicateJsonRefuseBeforeStoredAuthority(String invalid) throws Exception {
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid),
        422,
        "INVALID_CONTRACT");
    verifyNoInteractions(jdbc, statements, references);
    noAdmission();
  }

  @Test
  void malformedUtf8CannotTurnIntoReplacementCharacterAuthority() throws Exception {
    byte[] prefix = "{\"private\":\"".getBytes(StandardCharsets.UTF_8);
    byte[] invalid = java.util.Arrays.copyOf(prefix, prefix.length + 4);
    invalid[prefix.length] = (byte) 0xc3;
    invalid[prefix.length + 1] = 0x28;
    invalid[prefix.length + 2] = '"';
    invalid[prefix.length + 3] = '}';
    fixedObserved(
        send("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid),
        422,
        "INVALID_CONTRACT");
    verifyNoInteractions(jdbc, statements, references);
    noAdmission();
  }

  @Test
  void crossExecutionRequestRefusesBeforeDatabaseLookup() throws Exception {
    fixedObserved(
        post(
            "observed-admission",
            UUID.randomUUID(),
            "Bearer " + TOKEN,
            Map.of(),
            request().toString()),
        403,
        "FORBIDDEN_SCOPE");
    verifyNoInteractions(jdbc, statements, references);
    noAdmission();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "attemptId",
        "revisionId",
        "revisionDigest",
        "artifactHash",
        "configurationHash",
        "learnedPlanHash",
        "referencePolicyHash",
        "publicationEvidenceHash",
        "scopeHash",
        "currentPolicyHash",
        "grantId",
        "startedAt"
      })
  void authenticatedCallerCannotChangeStoredExecutionTuple(String field) throws Exception {
    var invalid = request();
    if (field.endsWith("Id")) {
      invalid.put(field, UUID.randomUUID().toString());
    } else if (field.equals("startedAt")) {
      invalid.put(field, "2026-10-09T00:00:01.000Z");
    } else {
      invalid.put(field, "f".repeat(64));
    }
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid.toString()),
        403,
        "FORBIDDEN_SCOPE");
    verify(observed).prepareAdmission(eq(EXECUTION), any(JsonNode.class));
    verify(jdbc).queryForList(anyString(), eq(String.class), eq(EXECUTION));
    verifyNoInteractions(statements, references, verifier, authority);
    noAdmission();
  }

  @ParameterizedTest
  @ValueSource(strings = {"profile", "build"})
  void authenticatedCallerCannotReplacePinnedRuntime(String field) throws Exception {
    var invalid = request();
    ObjectNode pin = (ObjectNode) invalid.path(field);
    if (field.equals("profile")) {
      pin.put("executor", "different-executor");
    } else {
      pin.put("chromiumBuild", "different-build");
    }
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid.toString()),
        field.equals("profile") ? 422 : 403,
        field.equals("profile") ? "INVALID_CONTRACT" : "FORBIDDEN_SCOPE");
    verifyNoInteractions(statements, references);
    noAdmission();
  }

  /**
   * Ported by name from {@code otherwiseValidTupleReachesRealUnavailableAccountBoundaryButNeverCas}
   * (STUDIO-OBS-012A AC-7). STUDIO-OBS-007 removed the account boundary that used to refuse here
   * with {@code AUTH_CONNECTION_REQUIRED}; secrets resolve at dispatch, never at admission
   * (secret-login-design §4.4). The otherwise-valid tuple therefore passes every pre-transaction
   * guard and enters the real locked admission transaction. The double holds no ledger row, so the
   * row lock finds nothing and the transaction refuses with its own fixed 409: forged headers grant
   * nothing, and no CAS statement, secret resolution, verifier or publication authority is reached.
   */
  @Test
  void otherwiseValidTupleReachesTheLockedAdmissionTransactionButNeverCasOrSecretResolution()
      throws Exception {
    var response =
        post(
            "observed-admission",
            EXECUTION,
            "Bearer " + TOKEN,
            Map.of("X-Forwarded-Client-Cert", METADATA, "X-User-Id", METADATA),
            request().toString());
    assertThat(response.statusCode()).isEqualTo(409);
    assertThat(CONTRACTS.parse(response.body()))
        .isEqualTo(
            CONTRACTS
                .object()
                .put("error", "EXECUTION_UNKNOWN")
                .put("message", "Execution unavailable"));
    privateFree(response.body());
    verify(observed).prepareAdmission(eq(EXECUTION), any(JsonNode.class));
    verify(admission)
        .claimObserved(eq(EXECUTION), any(ObservedReplayAuthorization.AdmissionPermit.class));
    verify(jdbc).queryForList(contains("FOR UPDATE OF l,e"), eq(EXECUTION));
    verifyNoInteractions(references);
    verifyNoInteractions(statements, verifier, authority);
    verifyNoInteractions(progress, control);
  }

  @Test
  void storedActorGrantMismatchIsNotOverriddenByRequestHeaders() throws Exception {
    ((ObjectNode) reads.binding.get().path("replayGrant")).put("principalId", METADATA);
    fixedObserved(
        post(
            "observed-admission",
            EXECUTION,
            "Bearer " + TOKEN,
            Map.of("X-User-Id", METADATA),
            request().toString()),
        403,
        "FORBIDDEN_SCOPE");
    verifyNoInteractions(statements, references);
    noAdmission();
  }

  @Test
  void expiredGrantAndCancelledExecutionStopBeforeAccountOrCas() throws Exception {
    ((ObjectNode) reads.binding.get().path("replayGrant"))
        .put("expiresAt", "2026-10-09T00:00:05.000Z");
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), request().toString()),
        409,
        "AUTHORIZATION_EXPIRED");
    reads.binding.set((ObjectNode) FIXTURE.path("job").path("binding").deepCopy());
    reads.cancelled.set(1);
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), request().toString()),
        409,
        "CANCELLED");
    verifyNoInteractions(statements, references);
    noAdmission();
  }

  @Test
  void unknownBindingDoesNotReturnExecutionOrAccountMetadata() throws Exception {
    reads.binding.set(null);
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), request().toString()),
        403,
        "FORBIDDEN_SCOPE");
    verifyNoInteractions(statements, references);
    noAdmission();
  }

  @Test
  void observedByteBoundDoesNotExposeTheBodyAndUnauthenticatedCallerStillGetsIdentityRefusal()
      throws Exception {
    String oversize = "{\"extra\":\"" + METADATA.repeat(1000) + "\"}";
    fixedIdentity(
        post("observed-admission", EXECUTION, null, Map.of(), oversize),
        401,
        "SERVICE_IDENTITY_REQUIRED");
    fixedObserved(
        post("observed-admission", EXECUTION, "Bearer " + TOKEN, Map.of(), oversize),
        413,
        "INVALID_CONTRACT");
    verifyNoInteractions(jdbc, statements, references);
    noAdmission();
  }

  /**
   * STUDIO-OBS-014 P1: renamed from {@code
   * ordinaryLegacyAdmissionRetainsRealTokenAndStrictReaderBoundary} and re-pointed from the deleted
   * legacy {@code /admission} route to {@code /progress}, the surviving consumer of the strict
   * internal body reader. The property is unchanged: the real ordinary service token is required
   * before the reader runs, and a valid token reaches the reader and the handler through the same
   * boundary.
   */
  @Test
  void ordinaryProgressCallbackRetainsRealTokenAndStrictReaderBoundary() throws Exception {
    fixedIdentity(
        post("progress", EXECUTION, null, Map.of(), "{}"), 401, "SERVICE_IDENTITY_REQUIRED");
    verifyNoInteractions(reader, progress, statements);
    var response = post("progress", EXECUTION, "Bearer " + TOKEN, Map.of(), "{}");
    assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    privateFree(response.body());
    verify(reader)
        .read(any(byte[].class), eq(com.citi.put.checks.studio.internal.dto.RunnerReport.class));
    verify(progress)
        .apply(eq(EXECUTION), any(com.citi.put.checks.studio.internal.dto.RunnerReport.class));
    verifyNoInteractions(admission, statements, observed, references);
  }

  /**
   * STUDIO-OBS-014 P1: renamed from {@code
   * legacyStrictParserMustNotQuotePrivateMalformedIdentityValues} and re-pointed from the deleted
   * legacy {@code /admission} route to {@code /progress}, which parses through the same strict
   * reader. A malformed identity value is refused {@code 400 INVALID_REPORT} without quoting it,
   * and the handler is never reached.
   */
  @Test
  void strictParserMustNotQuotePrivateMalformedIdentityValues() throws Exception {
    String invalid = "{\"attemptId\":\"" + METADATA + "\",\"runnerInstanceId\":\"" + COOKIE + "\"}";
    var response = post("progress", EXECUTION, "Bearer " + TOKEN, Map.of(), invalid);
    assertThat(response.statusCode()).isEqualTo(400);
    assertThat(CONTRACTS.parse(response.body()).path("error").asText()).isEqualTo("INVALID_REPORT");
    privateFree(response.body());
    verifyNoInteractions(admission, statements, observed, references);
    verify(progress, never())
        .apply(any(UUID.class), any(com.citi.put.checks.studio.internal.dto.RunnerReport.class));
  }

  private void noAdmission() {
    verify(admission, never())
        .claimObserved(any(UUID.class), any(ObservedReplayAuthorization.AdmissionPermit.class));
    verifyNoInteractions(progress, control);
  }

  private HttpResponse<String> post(
      String suffix, UUID execution, String auth, Map<String, String> headers, String body)
      throws Exception {
    return send(suffix, execution, auth, headers, body.getBytes(StandardCharsets.UTF_8));
  }

  private HttpResponse<String> send(
      String suffix, UUID execution, String auth, Map<String, String> headers, byte[] body)
      throws Exception {
    var request =
        HttpRequest.newBuilder(
                URI.create(
                    "http://127.0.0.1:"
                        + port
                        + "/internal/studio/executions/"
                        + execution
                        + "/"
                        + suffix))
            .timeout(Duration.ofSeconds(5))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofByteArray(body));
    if (auth != null) {
      request.header("Authorization", auth);
    }
    headers.forEach(request::header);
    return http.send(request.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
  }

  private void fixedIdentity(HttpResponse<String> response, int status, String code) {
    assertThat(response.statusCode()).isEqualTo(status);
    assertThat(CONTRACTS.parse(response.body()))
        .isEqualTo(
            CONTRACTS
                .object()
                .put("error", code)
                .put("message", "A valid service identity is required"));
    privateFree(response.body());
  }

  private void fixedObserved(HttpResponse<String> response, int status, String code) {
    assertThat(response.statusCode()).isEqualTo(status);
    assertThat(CONTRACTS.parse(response.body())).isEqualTo(CONTRACTS.object().put("code", code));
    privateFree(response.body());
  }

  private static void privateFree(String value) {
    assertThat(value)
        .doesNotContain(
            TOKEN,
            COOKIE,
            GUIDED_TOKEN,
            METADATA,
            EXECUTION.toString(),
            "account-1",
            "new-principal",
            FIXTURE.path("admissionRequest").path("revisionDigest").asText());
  }

  private static ObjectNode request() {
    return (ObjectNode) FIXTURE.path("admissionRequest").deepCopy();
  }

  private static ObjectNode fixture() {
    try {
      return (ObjectNode)
          CONTRACTS.parse(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    } catch (java.io.IOException failure) {
      throw new IllegalStateException("Synthetic publication fixture unavailable", failure);
    }
  }
}
