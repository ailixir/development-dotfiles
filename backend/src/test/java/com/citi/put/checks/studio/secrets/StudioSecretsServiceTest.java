package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * studio-vault-secrets FR-3, FR-7, NFR-1, NFR-2, NFR-3, D11 — the save and list decisions, made
 * where they are made.
 *
 * <p>The mapper is Spring's own builder output, which leaves {@code FAIL_ON_UNKNOWN_PROPERTIES}
 * disabled exactly as the platform mapper does, so the strict-parse assertions are about the copy
 * this service makes and not about a mapper built strict by the test. Bodies are sent as raw bytes,
 * as the controller hands them over.
 */
class StudioSecretsServiceTest {

  private static final String CSI_ID = "60406";
  private static final String OWNER = "secrets-owner@citi.com";
  private static final String CANARY = "Svc-Canary-91e7d2-never-echoed";

  private StudioRepository repository;
  private FakeStudioVaultProvider vault;
  private StudioSecretsService service;
  private UITest test;
  private UUID testId;

  private final Authentication owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  private final Authentication reader = StudioExecutionFixtures.identity(OWNER, CSI_ID, "viewer");
  private final Authentication stranger = StudioExecutionFixtures.identity(OWNER, "60999", "owner");

  @BeforeEach
  void setUp() {
    repository = mock(StudioRepository.class);
    vault = new FakeStudioVaultProvider(Map.of());
    testId = UUID.randomUUID();
    test =
        new UITest(
            "Secrets draft",
            null,
            CSI_ID,
            "[\"Go home\"]",
            "[]",
            "chromium",
            1920,
            1080,
            "Production",
            OWNER);
    ReflectionTestUtils.setField(test, "id", testId);
    when(repository.findById(any(UUID.class)))
        .thenAnswer(
            invocation ->
                testId.equals(invocation.getArgument(0)) ? Optional.of(test) : Optional.empty());
    service = service(vault);
  }

  private StudioSecretsService service(StudioVaultProvider provider) {
    return new StudioSecretsService(
        repository, new CsiOwnershipEvaluator(), provider, platformMapper());
  }

  private static ObjectMapper platformMapper() {
    return Jackson2ObjectMapperBuilder.json().build();
  }

  private static byte[] body(String json) {
    return json.getBytes(StandardCharsets.UTF_8);
  }

  private static String valid(String name) {
    return "{\"name\":\""
        + name
        + "\",\"value\":\""
        + CANARY
        + "\",\"allowedOrigins\":[\"https://Login.App.Example:443\"]}";
  }

  // ── create: the happy path and the scope ─────────────────────────────────────────────────────

  @Test
  void anOwnerCreatesUnderTheRowsCsiEnvironmentAndTestIdAndGetsNoValueBack() {
    StudioSecretDto created = service.create(testId, body(valid("LOGIN_PW")), owner);

    assertThat(created.name()).isEqualTo("LOGIN_PW");
    assertThat(created.version()).isEqualTo("1");
    assertThat(created.allowedOrigins()).containsExactly("https://login.app.example");
    assertThat(created.toString()).doesNotContain(CANARY);
    assertThat(vault.creates())
        .containsExactly(
            new FakeStudioVaultProvider.CreateCall(
                VaultScope.of(CSI_ID, "Production", testId), "LOGIN_PW"));
    assertThat(
            new String(
                vault
                    .read(
                        StudioVaultProvider.ReferenceKind.SECRET,
                        VaultScope.of(CSI_ID, "Production", testId),
                        "LOGIN_PW")
                    .orElseThrow()
                    .value()))
        .isEqualTo(CANARY);
  }

  @Test
  void aBodyNamingACsiEnvironmentOrAnOldFieldIsRefusedAndNothingIsWritten() {
    for (String extra :
        List.of(
            "\"csiId\":\"60999\"",
            "\"environment\":\"dev\"",
            "\"label\":\"Login\"",
            "\"scope\":\"project\"")) {
      String json = valid("LOGIN_PW").replace("{\"name\"", "{" + extra + ",\"name\"");
      assertThatThrownBy(() -> service.create(testId, body(json), owner))
          .as("body with %s", extra)
          .isInstanceOfSatisfying(
              StudioValidationException.class,
              e -> assertThat(e.getCode()).isEqualTo("INVALID_SECRET_REQUEST"));
    }
    assertThat(vault.creates()).isEmpty();
  }

  // ── authorization first ──────────────────────────────────────────────────────────────────────

  @Test
  void aReaderMayListButNotCreate() {
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, "Production", testId),
        "LOGIN_PW",
        CANARY);

    assertThat(service.list(testId, reader).data())
        .containsExactly(new StudioSecretNameDto("LOGIN_PW"));
    assertThatThrownBy(() -> service.create(testId, body(valid("OTHER")), reader))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThat(vault.creates()).isEmpty();
  }

  @Test
  void aStrangerAndAnAbsentTestGetTheSameRefusalOnBothOperations() {
    UUID absent = UUID.randomUUID();
    assertThatThrownBy(() -> service.list(testId, stranger))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThatThrownBy(() -> service.list(absent, owner))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThatThrownBy(() -> service.create(testId, body(valid("X")), stranger))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThatThrownBy(() -> service.create(absent, body(valid("X")), owner))
        .isInstanceOf(StudioAccessDeniedException.class);
  }

  /** §3.3's order: an unauthorized caller's malformed body is a 403, and is never parsed. */
  @Test
  void anUnauthorizedMalformedBodyIsRefusedAsForbiddenWithoutBeingParsed() throws Exception {
    ObjectMapper platform = spy(platformMapper());
    ObjectMapper strict = spy(StudioSecretsService.strictCopyOf(platformMapper()));
    doReturn(strict).when(platform).copy();
    StudioSecretsService watched =
        new StudioSecretsService(repository, new CsiOwnershipEvaluator(), vault, platform);
    byte[] malformed = body("{not json " + CANARY);

    assertThatThrownBy(() -> watched.create(testId, malformed, stranger))
        .isInstanceOf(StudioAccessDeniedException.class);
    verify(strict, never()).readValue(any(byte[].class), eq(CreateStudioSecretRequest.class));
    assertThat(malformed).containsOnly((byte) 0);

    // The companion: the same body from the owner does reach this parser, and is a 400.
    assertThatThrownBy(() -> watched.create(testId, body("{not json " + CANARY), owner))
        .isInstanceOfSatisfying(
            StudioValidationException.class,
            e -> assertThat(e.getCode()).isEqualTo("INVALID_SECRET_REQUEST"));
    verify(strict).readValue(any(byte[].class), eq(CreateStudioSecretRequest.class));
  }

  // ── validation codes ─────────────────────────────────────────────────────────────────────────

  @Test
  void eachRuleHasItsOwnCodeAndNoMessageCarriesTheValueOrAParserFragment() {
    Map<String, String> cases = new java.util.LinkedHashMap<>();
    cases.put("", "INVALID_SECRET_REQUEST");
    cases.put("null", "INVALID_SECRET_REQUEST");
    cases.put("{\"name\":\"A\",\"value\":\"" + CANARY, "INVALID_SECRET_REQUEST");
    cases.put(valid("A") + " {}", "INVALID_SECRET_REQUEST");
    cases.put(
        "{\"name\":\"A\",\"value\":12345,\"allowedOrigins\":[\"https://a.example\"]}",
        "INVALID_SECRET_REQUEST");
    cases.put(
        "{\"name\":\"A\",\"value\":\"" + CANARY + "\",\"allowedOrigins\":\"https://a.example\"}",
        "INVALID_SECRET_REQUEST");
    cases.put(
        "{\"name\":\"A\",\"value\":\""
            + CANARY
            + "\",\"value\":\""
            + CANARY
            + "\",\"allowedOrigins\":[\"https://a.example\"]}",
        "INVALID_SECRET_REQUEST");
    cases.put(valid("has space"), "INVALID_SECRET_NAME");
    cases.put(valid(".."), "INVALID_SECRET_NAME");
    cases.put(valid("vault:__studio"), "INVALID_SECRET_NAME");
    cases.put(valid("N".repeat(65)), "INVALID_SECRET_NAME");
    cases.put(
        "{\"value\":\"" + CANARY + "\",\"allowedOrigins\":[\"https://a.example\"]}",
        "INVALID_SECRET_NAME");
    cases.put(
        "{\"name\":\"A\",\"value\":\"\",\"allowedOrigins\":[\"https://a.example\"]}",
        "INVALID_SECRET_VALUE");
    cases.put(
        "{\"name\":\"A\",\"allowedOrigins\":[\"https://a.example\"]}", "INVALID_SECRET_VALUE");
    cases.put(
        "{\"name\":\"A\",\"value\":\""
            + "v".repeat(StudioSecretsService.MAX_VALUE_LENGTH + 1)
            + "\",\"allowedOrigins\":[\"https://a.example\"]}",
        "INVALID_SECRET_VALUE");
    cases.put(
        "{\"name\":\"A\",\"value\":\"" + CANARY + "\",\"allowedOrigins\":[]}",
        "INVALID_SECRET_ORIGINS");
    cases.put("{\"name\":\"A\",\"value\":\"" + CANARY + "\"}", "INVALID_SECRET_ORIGINS");
    cases.put(
        "{\"name\":\"A\",\"value\":\""
            + CANARY
            + "\",\"allowedOrigins\":[\"https://a.example/x\"]}",
        "INVALID_SECRET_ORIGINS");
    cases.put(
        "{\"name\":\"A\",\"value\":\""
            + CANARY
            + "\",\"allowedOrigins\":[\"https://a.example,https://b.example\"]}",
        "INVALID_SECRET_ORIGINS");
    cases.put(
        "{\"name\":\"A\",\"value\":\""
            + CANARY
            + "\",\"allowedOrigins\":[\"https://a.example\",\"https://A.example\"]}",
        "INVALID_SECRET_ORIGINS");
    cases.put(
        "{\"name\":\"A\",\"value\":\""
            + CANARY
            + "\",\"allowedOrigins\":["
            + String.join(",", java.util.Collections.nCopies(17, "\"https://a.example\""))
            + "]}",
        "INVALID_SECRET_ORIGINS");

    cases.forEach(
        (json, code) ->
            assertThatThrownBy(() -> service.create(testId, body(json), owner))
                .as("body %s", json.length() > 80 ? json.substring(0, 80) + "…" : json)
                .isInstanceOfSatisfying(
                    StudioValidationException.class,
                    e -> {
                      assertThat(e.getCode()).isEqualTo(code);
                      assertThat(e.getMessage())
                          .doesNotContain(CANARY)
                          .doesNotContain("Unexpected character")
                          .doesNotContain("Unrecognized field")
                          .doesNotContain("line:");
                    }));
    assertThat(vault.creates()).isEmpty();
  }

  @Test
  void anOversizedBodyIsARequestErrorAfterAuthorization() {
    byte[] huge = new byte[StudioSecretsService.MAX_BODY_BYTES + 1];
    Arrays.fill(huge, (byte) 'x');
    assertThatThrownBy(() -> service.create(testId, huge, owner))
        .isInstanceOfSatisfying(
            StudioValidationException.class,
            e -> assertThat(e.getCode()).isEqualTo("INVALID_SECRET_REQUEST"));
    assertThatThrownBy(() -> service.create(testId, null, owner))
        .isInstanceOfSatisfying(
            StudioValidationException.class,
            e -> assertThat(e.getCode()).isEqualTo("INVALID_SECRET_REQUEST"));
  }

  // ── provider answers ─────────────────────────────────────────────────────────────────────────

  @Test
  void theDefaultOffProviderIsNotConfiguredOnBothOperations() {
    StudioSecretsService off = service(new DisabledStudioVaultProvider());
    assertThatThrownBy(() -> off.list(testId, owner))
        .isInstanceOf(VaultNotConfiguredException.class);
    assertThatThrownBy(() -> off.create(testId, body(valid("LOGIN_PW")), owner))
        .isInstanceOf(VaultNotConfiguredException.class);
  }

  @Test
  void aDuplicateIsAlreadyExistsAndTheStoredEntryIsUnchanged() {
    service.create(testId, body(valid("LOGIN_PW")), owner);
    String before =
        vault
            .read(
                StudioVaultProvider.ReferenceKind.SECRET,
                VaultScope.of(CSI_ID, "Production", testId),
                "LOGIN_PW")
            .orElseThrow()
            .versionIdentifier();

    assertThatThrownBy(
            () ->
                service.create(testId, body(valid("LOGIN_PW").replace(CANARY, "different")), owner))
        .isInstanceOf(SecretAlreadyExistsException.class)
        .hasMessageNotContaining(CANARY);
    StudioVaultProvider.VaultEntry after =
        vault
            .read(
                StudioVaultProvider.ReferenceKind.SECRET,
                VaultScope.of(CSI_ID, "Production", testId),
                "LOGIN_PW")
            .orElseThrow();
    assertThat(after.versionIdentifier()).isEqualTo(before);
    assertThat(new String(after.value())).isEqualTo(CANARY);
  }

  // ── NFR-2: the body bytes and the value chars are zero on every exit path ───────────────────

  @Test
  void theBodyAndTheValueAreErasedAfterSuccessValidationFailureAndProviderFailure() {
    List<char[]> seenValues = new ArrayList<>();
    StudioVaultProvider capturing = capturingProvider(seenValues::add, null);
    StudioVaultProvider failing =
        capturingProvider(
            seenValues::add, new VaultProviderUnavailableException("The test vault is down"));

    byte[] success = body(valid("LOGIN_PW"));
    service(capturing).create(testId, success, owner);
    assertThat(success).containsOnly((byte) 0);

    byte[] invalid = body(valid("has space"));
    assertThatThrownBy(() -> service(capturing).create(testId, invalid, owner))
        .isInstanceOf(StudioValidationException.class);
    assertThat(invalid).containsOnly((byte) 0);

    byte[] outage = body(valid("LOGIN_PW"));
    assertThatThrownBy(() -> service(failing).create(testId, outage, owner))
        .isInstanceOf(VaultProviderUnavailableException.class);
    assertThat(outage).containsOnly((byte) 0);

    assertThat(seenValues).hasSize(2);
    assertThat(seenValues).allSatisfy(value -> assertThat(value).containsOnly('\0'));
  }

  @Test
  void theRequestRecordNeverRendersOrComparesTheValue() {
    CreateStudioSecretRequest one =
        new CreateStudioSecretRequest("A", CANARY.toCharArray(), List.of("https://a.example"));
    CreateStudioSecretRequest two =
        new CreateStudioSecretRequest("A", "other".toCharArray(), List.of("https://a.example"));
    assertThat(one.toString()).doesNotContain(CANARY).contains("<omitted>");
    assertThat(one).isEqualTo(two).hasSameHashCodeAs(two);
  }

  /** A provider that hands over the value array it was given, so the test can inspect it later. */
  private static StudioVaultProvider capturingProvider(
      Consumer<char[]> sink, RuntimeException failure) {
    StudioVaultProvider provider = mock(StudioVaultProvider.class);
    doAnswer(
            invocation -> {
              sink.accept(invocation.getArgument(2));
              if (failure != null) {
                throw failure;
              }
              return "1";
            })
        .when(provider)
        .create(any(), any(), any(), any());
    return provider;
  }
}
