package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Story 10.17 AC-4, AC-5a, AC-6 and AC-17 — secret use is its own decision, and every decision here
 * is made against an identity this test supplied.
 *
 * <h2>Why this file is a unit test and not an integration test</h2>
 *
 * <p>This is AC-17's whole point. {@code BffSessionAuthenticationFilter.isCoreServiceBypassed()}
 * returns a hardcoded {@code true} on this branch, so every HTTP request arrives as {@code
 * CORE_SERVICE_BYPASS_IDENTITY} carrying {@code checks-admin} and {@code platform-admin}, and
 * {@code CsiOwnershipEvaluator.isAdmin} short-circuits {@code canRead}, {@code canWrite} and {@code
 * canExecute} to {@code true} for every CSI. An authorization test driven through the ordinary
 * request path is therefore green <b>because authentication is disabled</b> — in both directions:
 * the refusal case never refuses and the permit case permits regardless of what this story
 * implements. For a secrets story that is the worst available outcome.
 *
 * <p>So the principal is supplied directly, as a plain string the seam actually reads, and the
 * decision is exercised where it is made. This story adds no bypass and removes none; removing it
 * is 10.18 and `ED-02`.
 *
 * <h2>Every refusal has a permit companion</h2>
 *
 * <p>A refusal test passes when everything refuses, so "deny all secrets" would satisfy a file of
 * refusals. Each decision below is therefore asserted twice, in both directions, against the same
 * policy — and there is a test asserting that the bypass roles are not what makes any permit pass.
 */
class SecretUseAuthorizationTest {

  private static final String CSI = "60406";
  private static final String OTHER_CSI = "60999";
  private static final String ENVIRONMENT = "Production";
  private static final String OTHER_ENVIRONMENT = "dev";
  private static final String OWNER = "owner@citi.com";
  private static final String STRANGER = "stranger@citi.com";
  private static final UUID TEST_ID = UUID.fromString("7d0c5e2a-3b1f-4c8e-9a6d-2f4b8e1c0a11");
  private static final UUID OTHER_TEST_ID = UUID.fromString("0a9e4b61-5c2d-4e7f-8b3a-6d1c9f2e4b22");

  /** A distinctive value, so every "does not contain" below has something to not contain. */
  private static final String CANARY = "VaUlT-Canary-8f3a1c-do-not-persist";

  private FakeStudioVaultProvider vault;
  private ConfiguredSecretUseAuthorization entitlements;
  private VaultStudioReferenceResolver resolver;

  @BeforeEach
  void setUp() {
    vault = new FakeStudioVaultProvider(Map.of());
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, ENVIRONMENT, TEST_ID),
        "LOGIN_PW",
        CANARY);
    vault.rotate(
        StudioVaultProvider.ReferenceKind.VARIABLE,
        VaultScope.of(CSI, ENVIRONMENT, TEST_ID),
        "REGION",
        "emea");
    // Entitled in `dev` only, to make AC-5a's environment half decidable.
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, OTHER_ENVIRONMENT, TEST_ID),
        "DEV_ONLY",
        "dev-value");

    entitlements =
        new ConfiguredSecretUseAuthorization(
            Map.of(
                ConfiguredSecretUseAuthorization.key(OWNER, CSI, ENVIRONMENT),
                Set.of("LOGIN_PW"),
                ConfiguredSecretUseAuthorization.key(OWNER, CSI, OTHER_ENVIRONMENT),
                Set.of("DEV_ONLY")));
    resolver = new VaultStudioReferenceResolver(vault, entitlements);
  }

  private static ReferenceDeclarations secretsOnly(String... ids) {
    return new ReferenceDeclarations(List.of(), List.of(ids));
  }

  // ── AC-4: secret use is not execute permission reused ────────────────────────────────────────

  /**
   * The mutation that matters (AC-4).
   *
   * <p>{@code STRANGER} and {@code OWNER} may both start ordinary executions and are handed the
   * identical declaration for the identical CSI and environment. Only the secret entitlement
   * differs. A seam returning {@code true} for every executing user would turn this pair red.
   */
  @Test
  void refusesAPrincipalWhoMayExecuteTheCsiButIsNotEntitledToTheSecret() {
    assertThatThrownBy(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, STRANGER, secretsOnly("LOGIN_PW")))
        .isInstanceOf(StudioReferenceResolver.SecretUseNotAuthorizedException.class)
        .hasMessageContaining("LOGIN_PW");
  }

  @Test
  void permitsTheEntitledPrincipalForTheSameSecretOnTheSameCsi() {
    assertThatCode(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
  }

  /**
   * AC-17's bypass-roles-stripped re-run.
   *
   * <p>The permit above is the test most likely to ride the bypass, because it passes either way
   * and nobody looks at a passing test. This asserts what actually decides it: the seam's answer is
   * a function of the principal string and the entitlement map, and the two admin role names that
   * short-circuit {@code CsiOwnershipEvaluator} appear nowhere in that function. A principal
   * carrying both of them and no entitlement is refused exactly as a stranger is.
   */
  @Test
  void theBypassRolesAreNotWhatMakesAnyPermitPass() {
    for (String role : List.of("checks-admin", "platform-admin", "platform-bypass")) {
      assertThat(entitlements.mayUse(role, CSI, ENVIRONMENT, "LOGIN_PW"))
          .as("the role name '%s' must not be an entitlement", role)
          .isFalse();
      assertThatThrownBy(
              () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, role, secretsOnly("LOGIN_PW")))
          .as("a principal named after an admin role must still be refused", role)
          .isInstanceOf(StudioReferenceResolver.SecretUseNotAuthorizedException.class);
    }
    // …and the entitled principal, who holds none of those roles, still succeeds.
    assertThatCode(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
  }

  // ── AC-5a: the CSI half and the environment half ─────────────────────────────────────────────

  @Test
  void refusesTheSameSecretForADifferentCsiAndPermitsItForItsOwn() {
    assertThatThrownBy(
            () ->
                resolver.preflight(OTHER_CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .isInstanceOf(StudioReferenceResolver.SecretUseNotAuthorizedException.class);
    assertThatCode(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
  }

  @Test
  void refusesAReferenceEntitledOnlyInAnotherEnvironmentAndPermitsItInItsOwn() {
    assertThatThrownBy(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("DEV_ONLY")))
        .isInstanceOf(StudioReferenceResolver.SecretUseNotAuthorizedException.class);
    assertThatCode(
            () ->
                resolver.preflight(CSI, OTHER_ENVIRONMENT, TEST_ID, OWNER, secretsOnly("DEV_ONLY")))
        .doesNotThrowAnyException();
  }

  @Test
  void refusesAnUnknownReferenceAndPermitsAKnownOne() {
    assertThatThrownBy(
            () ->
                resolver.preflight(
                    CSI,
                    ENVIRONMENT,
                    TEST_ID,
                    OWNER,
                    new ReferenceDeclarations(List.of("NOT_A_REFERENCE"), List.of())))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class);
    assertThatCode(
            () ->
                resolver.preflight(
                    CSI,
                    ENVIRONMENT,
                    TEST_ID,
                    OWNER,
                    new ReferenceDeclarations(List.of("REGION"), List.of())))
        .doesNotThrowAnyException();
  }

  @Test
  void refusesACrossedNameAndPermitsTheSameTwoNamesWhenTheyAreDistinct() {
    assertThatThrownBy(
            () ->
                resolver.preflight(
                    CSI,
                    ENVIRONMENT,
                    TEST_ID,
                    OWNER,
                    new ReferenceDeclarations(List.of("LOGIN_PW"), List.of("LOGIN_PW"))))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class);
    assertThatCode(
            () ->
                resolver.preflight(
                    CSI,
                    ENVIRONMENT,
                    TEST_ID,
                    OWNER,
                    new ReferenceDeclarations(List.of("REGION"), List.of("LOGIN_PW"))))
        .doesNotThrowAnyException();
  }

  // ── AC-6: a refusal names the reference and never the value ──────────────────────────────────

  /**
   * AC-6, with @po's amendment: the canary is chosen so its negatives can actually fail.
   *
   * <p>A {@code doesNotContain} over a four-character {@code lastFour} is nearly always true by
   * accident against ordinary English text. So a <b>control</b> is captured from the same seam with
   * the canary <em>in play and permitted</em>, and the five things a refusal must never carry are
   * first shown to be things a message could carry at all — then shown absent from every refusal.
   */
  @Test
  void noRefusalCarriesTheValueItsLengthItsLastFourItsPrefixOrAHashOfIt() {
    // The control: the value is real, it is in the vault, and it is resolvable. Without this the
    // absences below could all be true because nothing was ever there.
    try (StudioReferenceResolver.Resolved resolved =
        resolver.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(new String(resolved.secrets().get("LOGIN_PW")))
          .as("the canary must be resolvable, or the negatives below prove nothing")
          .isEqualTo(CANARY);
    }

    String lastFour = CANARY.substring(CANARY.length() - 4);
    String firstFour = CANARY.substring(0, 4);
    String length = String.valueOf(CANARY.length());
    String sha = Integer.toHexString(CANARY.hashCode());

    // The five refusals AC-6 enumerates, each paired with the reference it must name.
    Map<String, String> messages =
        new java.util.LinkedHashMap<>(
            Map.of(
                "unentitled reference",
                    messageOf(
                            () ->
                                resolver.preflight(
                                    CSI, ENVIRONMENT, TEST_ID, STRANGER, secretsOnly("LOGIN_PW")))
                        + "::LOGIN_PW",
                "unknown reference",
                    messageOf(
                            () ->
                                resolver.preflight(
                                    CSI,
                                    ENVIRONMENT,
                                    TEST_ID,
                                    OWNER,
                                    new ReferenceDeclarations(
                                        List.of("NOT_A_REFERENCE"), List.of())))
                        + "::NOT_A_REFERENCE",
                "crossed type",
                    messageOf(
                            () ->
                                resolver.preflight(
                                    CSI,
                                    ENVIRONMENT,
                                    TEST_ID,
                                    OWNER,
                                    new ReferenceDeclarations(
                                        List.of("LOGIN_PW"), List.of("LOGIN_PW"))))
                        + "::LOGIN_PW",
                "undeclared extra",
                    messageOf(
                            () ->
                                resolver.preflight(
                                    CSI,
                                    ENVIRONMENT,
                                    TEST_ID,
                                    OWNER,
                                    new ReferenceDeclarations(List.of(), List.of("SMUGGLED"))))
                        + "::SMUGGLED",
                "vanished reference",
                    messageOf(
                            () -> {
                              vault.delete(
                                  StudioVaultProvider.ReferenceKind.SECRET,
                                  VaultScope.of(CSI, ENVIRONMENT, TEST_ID),
                                  "LOGIN_PW");
                              resolver.resolve(
                                  CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"));
                            })
                        + "::LOGIN_PW"));

    messages.forEach(
        (label, combined) -> {
          String[] parts = combined.split("::", 2);
          assertThat(parts[0])
              .as("the %s refusal must name its reference", label)
              .contains(parts[1]);
        });
    String all = String.join("\n", messages.values());
    assertThat(all).as("the value").doesNotContain(CANARY);
    assertThat(all).as("the value's last four").doesNotContain(lastFour);
    assertThat(all).as("the value's first four").doesNotContain(firstFour);
    assertThat(all).as("the value's length").doesNotContain(length);
    assertThat(all).as("a hash of the value").doesNotContain(sha);
  }

  /**
   * The canary's own discriminating property, asserted rather than assumed (@po's AC-6 amendment).
   *
   * <p>A control capture from the same seam, with the canary <b>not</b> in play. If {@code
   * lastFour}, the decimal length or the first four characters appeared in ordinary refusal text
   * anyway, the five negatives above would be measuring the corpus rather than the control — true
   * whatever the implementation did.
   */
  @Test
  void theCanaryIsChosenSoItsAbsenceIsAFactAboutTheControlRatherThanAboutTheText() {
    FakeStudioVaultProvider empty = new FakeStudioVaultProvider(Map.of());
    VaultStudioReferenceResolver withoutCanary =
        new VaultStudioReferenceResolver(empty, entitlements);
    String control =
        messageOf(
            () ->
                withoutCanary.preflight(
                    CSI,
                    ENVIRONMENT,
                    TEST_ID,
                    OWNER,
                    new ReferenceDeclarations(List.of("REGION"), List.of())));

    assertThat(control).isNotBlank();
    assertThat(control)
        .as("lastFour by accident")
        .doesNotContain(CANARY.substring(CANARY.length() - 4));
    assertThat(control).as("first four by accident").doesNotContain(CANARY.substring(0, 4));
    assertThat(control)
        .as("the length by accident")
        .doesNotContain(String.valueOf(CANARY.length()));
  }

  private static String messageOf(Runnable action) {
    try {
      action.run();
    } catch (RuntimeException e) {
      return e.getMessage()
          + " | "
          + e.getClass().getSimpleName().toUpperCase(java.util.Locale.ROOT);
    }
    throw new AssertionError("the action was expected to be refused and was not");
  }

  // ── Secret origin binding: the vault entry's allowedOrigins reaches the job, per secret ─────

  @Test
  void carriesEachSecretsNormalizedOriginsFromItsVaultEntry() {
    vault.bindOrigins(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, ENVIRONMENT, TEST_ID),
        "LOGIN_PW",
        "HTTPS://Login.App.Example:443, https://sso.app.example:8443");

    try (StudioReferenceResolver.Resolved resolved =
        resolver.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(resolved.secretOrigins())
          .containsExactly(
              Map.entry(
                  "LOGIN_PW",
                  List.of("https://login.app.example", "https://sso.app.example:8443")));
    }
  }

  @Test
  void aSecretWhoseEntryDeclaresNoOriginsIsCarriedBoundToNone() {
    try (StudioReferenceResolver.Resolved resolved =
        resolver.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(resolved.secretOrigins()).containsExactly(Map.entry("LOGIN_PW", List.of()));
    }
  }

  @Test
  void aMalformedOriginListBindsTheSecretToNone() {
    vault.bindOrigins(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, ENVIRONMENT, TEST_ID),
        "LOGIN_PW",
        "https://login.app.example,javascript:alert(1)");

    try (StudioReferenceResolver.Resolved resolved =
        resolver.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(resolved.secretOrigins()).containsExactly(Map.entry("LOGIN_PW", List.of()));
    }
  }

  // ── Test scope (V3, V4): a secret belongs to the test it was saved for ─────────────────────────

  /**
   * AC-V3-3 / AC-V4-2, resolver side: the same name under the same CSI and environment, stored for
   * test A, is unknown to test B at acceptance and unavailable to it at dispatch — and still
   * resolves for test A.
   */
  @Test
  void aSecretStoredForOneTestIsAbsentForAnotherTestWithTheSameCsiAndEnvironment() {
    assertThatThrownBy(
            () ->
                resolver.preflight(CSI, ENVIRONMENT, OTHER_TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class)
        .hasMessageContaining("LOGIN_PW");
    assertThatThrownBy(
            () -> resolver.resolve(CSI, ENVIRONMENT, OTHER_TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .isInstanceOf(StudioReferenceResolver.ReferenceUnavailableException.class);

    assertThatCode(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
    try (StudioReferenceResolver.Resolved resolved =
        resolver.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(new String(resolved.secrets().get("LOGIN_PW"))).isEqualTo(CANARY);
    }
  }

  /**
   * D9: a declared id that is not a valid secret name — a legacy {@code vault://…} id — is refused
   * as a reference fault before the provider is called, even for a principal entitled to it. Were
   * the provider called, its path-safety check would report a Vault outage instead.
   */
  @Test
  void aDeclaredIdThatIsNotASecretNameIsRefusedBeforeTheProviderIsCalled() {
    String legacy = "vault://studio/pilot-pw";
    AtomicInteger reads = new AtomicInteger();
    StudioVaultProvider counting =
        new StudioVaultProvider() {
          @Override
          public String name() {
            return "counting";
          }

          @Override
          public java.util.Optional<VaultEntry> read(
              ReferenceKind kind, VaultScope scope, String referenceName) {
            reads.incrementAndGet();
            return vault.read(kind, scope, referenceName);
          }

          @Override
          public String create(VaultScope scope, String name, char[] value, List<String> origins) {
            throw new AssertionError("not used");
          }

          @Override
          public List<String> listSecretNames(VaultScope scope) {
            throw new AssertionError("not used");
          }
        };
    VaultStudioReferenceResolver guarded =
        new VaultStudioReferenceResolver(
            counting,
            new ConfiguredSecretUseAuthorization(
                Map.of(
                    ConfiguredSecretUseAuthorization.key(OWNER, CSI, ENVIRONMENT),
                    Set.of(legacy, "LOGIN_PW"))));

    assertThatThrownBy(
            () -> guarded.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly(legacy)))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class)
        .hasMessageContaining(legacy);
    assertThatThrownBy(() -> guarded.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly(legacy)))
        .isInstanceOf(StudioReferenceResolver.ReferenceUnavailableException.class)
        .hasMessageContaining(legacy);
    assertThat(reads).as("the provider must never be asked for an invalid name").hasValue(0);

    // The permit companion: a valid name through the same guarded resolver does reach the provider.
    assertThatCode(
            () -> guarded.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
    assertThat(reads).hasValue(1);
  }
}
