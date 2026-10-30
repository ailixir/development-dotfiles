package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The vault-backed resolver: a secret belongs to the test it was saved for (GOV-001.1), and a
 * refusal names the reference and never the value (story 10.17 AC-6).
 *
 * <p>There is no per-principal entitlement. Whoever may run a test may use that test's secrets, and
 * the only thing keeping a secret to its own test (and CSI and environment) is the {@link
 * VaultScope} every read goes through. So the tests here prove the scope: a name that exists only
 * under another test, CSI or environment is unknown at acceptance and unavailable at dispatch, and
 * two tests holding the same name each resolve only their own value.
 */
class VaultStudioReferenceResolverTest {

  private static final String CSI = "60406";
  private static final String OTHER_CSI = "60999";
  private static final String ENVIRONMENT = "Production";
  private static final String OTHER_ENVIRONMENT = "dev";
  private static final String OWNER = "owner@citi.com";
  private static final UUID TEST_ID = UUID.fromString("7d0c5e2a-3b1f-4c8e-9a6d-2f4b8e1c0a11");
  private static final UUID OTHER_TEST_ID = UUID.fromString("0a9e4b61-5c2d-4e7f-8b3a-6d1c9f2e4b22");

  /** A distinctive value, so every "does not contain" below has something to not contain. */
  private static final String CANARY = "VaUlT-Canary-8f3a1c-do-not-persist";

  private FakeStudioVaultProvider vault;
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
    // Saved in `dev` only, to make the environment half of the scope decidable.
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, OTHER_ENVIRONMENT, TEST_ID),
        "DEV_ONLY",
        "dev-value");

    resolver = new VaultStudioReferenceResolver(vault);
  }

  private static ReferenceDeclarations secretsOnly(String... ids) {
    return new ReferenceDeclarations(List.of(), List.of(ids));
  }

  // ── Scope: CSI, environment and test ─────────────────────────────────────────────────────────

  @Test
  void aSecretSavedForOneCsiIsUnknownToAnotherCsiAndResolvesForItsOwn() {
    assertThatThrownBy(
            () ->
                resolver.preflight(OTHER_CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class);
    assertThatCode(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
  }

  @Test
  void aSecretSavedForOneEnvironmentIsUnknownToAnotherAndResolvesForItsOwn() {
    assertThatThrownBy(
            () -> resolver.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("DEV_ONLY")))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class);
    assertThatCode(
            () ->
                resolver.preflight(CSI, OTHER_ENVIRONMENT, TEST_ID, OWNER, secretsOnly("DEV_ONLY")))
        .doesNotThrowAnyException();
  }

  /**
   * GOV-001.1 AC-2: tests A and B in the same CSI and environment each hold {@code LOGIN_PW} with a
   * different value. Each resolves only its own; B naming a secret that exists only on A resolves
   * nothing.
   */
  @Test
  void twoTestsHoldingTheSameSecretNameEachResolveOnlyTheirOwnValue() {
    String otherValue = "other-test-value-3b9d";
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, ENVIRONMENT, OTHER_TEST_ID),
        "LOGIN_PW",
        otherValue);
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI, ENVIRONMENT, TEST_ID),
        "ONLY_ON_A",
        "a-only-value");

    try (StudioReferenceResolver.Resolved a =
        resolver.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(new String(a.secrets().get("LOGIN_PW"))).isEqualTo(CANARY);
    }
    try (StudioReferenceResolver.Resolved b =
        resolver.resolve(CSI, ENVIRONMENT, OTHER_TEST_ID, OWNER, secretsOnly("LOGIN_PW"))) {
      assertThat(new String(b.secrets().get("LOGIN_PW"))).isEqualTo(otherValue);
    }

    assertThatThrownBy(
            () ->
                resolver.preflight(
                    CSI, ENVIRONMENT, OTHER_TEST_ID, OWNER, secretsOnly("ONLY_ON_A")))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class);
    assertThatThrownBy(
            () ->
                resolver.resolve(CSI, ENVIRONMENT, OTHER_TEST_ID, OWNER, secretsOnly("ONLY_ON_A")))
        .isInstanceOf(StudioReferenceResolver.ReferenceUnavailableException.class);
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
                "another test's reference",
                    messageOf(
                            () ->
                                resolver.preflight(
                                    CSI,
                                    ENVIRONMENT,
                                    OTHER_TEST_ID,
                                    OWNER,
                                    secretsOnly("LOGIN_PW")))
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
    VaultStudioReferenceResolver withoutCanary = new VaultStudioReferenceResolver(empty);
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
   * as a reference fault before the provider is called, whoever asks. Were the provider called, its
   * path-safety check would report a Vault outage instead.
   *
   * <p>Ported 2026-10-13 (STUDIO-OBS-012A AC-7) to STUDIO-OBS-007 AC-6 / secret-login-design §4.4:
   * preflight checks existence by <b>name only</b>, with zero value reads. The provider is
   * therefore reached through {@code listSecretNames}, not {@code read}; both are counted, and the
   * invalid name must reach neither.
   */
  @Test
  void aDeclaredIdThatIsNotASecretNameIsRefusedBeforeTheProviderIsCalled() {
    String legacy = "vault://studio/pilot-pw";
    AtomicInteger reads = new AtomicInteger();
    AtomicInteger listings = new AtomicInteger();
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
            listings.incrementAndGet();
            return vault.listSecretNames(scope);
          }
        };
    VaultStudioReferenceResolver guarded = new VaultStudioReferenceResolver(counting);

    assertThatThrownBy(
            () -> guarded.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly(legacy)))
        .isInstanceOf(StudioReferenceResolver.UnknownReferenceException.class)
        .hasMessageContaining(legacy);
    assertThatThrownBy(() -> guarded.resolve(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly(legacy)))
        .isInstanceOf(StudioReferenceResolver.ReferenceUnavailableException.class)
        .hasMessageContaining(legacy);
    assertThat(reads).as("the provider must never be asked for an invalid name").hasValue(0);
    assertThat(listings).as("the provider must never be asked for an invalid name").hasValue(0);

    // The permit companion: a valid name through the same guarded resolver does reach the
    // provider, by name only (OBS-007 AC-6: preflight performs zero value reads).
    assertThatCode(
            () -> guarded.preflight(CSI, ENVIRONMENT, TEST_ID, OWNER, secretsOnly("LOGIN_PW")))
        .doesNotThrowAnyException();
    assertThat(listings).hasValue(1);
    assertThat(reads).as("preflight never reads a secret value").hasValue(0);
  }
}
