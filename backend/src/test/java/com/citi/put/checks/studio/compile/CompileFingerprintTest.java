package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import org.junit.jupiter.api.Test;

/**
 * Story 10.45 Task 1.6 — every named fingerprint input changes the fingerprint on its own (AC 2, 6;
 * spec &sect;3.2.6 "Fingerprint").
 *
 * <p>Re-ported from {@code 51ade0f1f} and extended with {@code thinkingLevel}, {@code
 * PROMPT_VERSION}, the syntax-reference version, the intent derivation version and the reference
 * policy version.
 */
class CompileFingerprintTest {

  private static final String SETTINGS =
      "{\"model\":\"pinned\",\"maxOutputTokens\":32768,\"thinkingLevel\":\"MEDIUM\"}";
  private static final RuntimePinProperties PIN =
      new RuntimePinProperties(1, "2.0.0", "2.0.0", "2.0.0", "1.63.0");

  private static String fingerprint(String settings, RuntimePinProperties pin) {
    return CompilePipeline.compilationFingerprint(settings, pin);
  }

  private static String versions(String prompt, String syntax, String intent, int policy) {
    return CompilePipeline.compilationFingerprint(SETTINGS, PIN, prompt, syntax, intent, policy);
  }

  @Test
  void theFingerprintIsA64CharacterHexHashAndIgnoresSettingsKeyOrder() {
    String first = fingerprint(SETTINGS, PIN);

    assertThat(first).matches("^[0-9a-f]{64}$");
    assertThat(
            fingerprint(
                "{\"thinkingLevel\":\"MEDIUM\",\"maxOutputTokens\":32768,\"model\":\"pinned\"}",
                PIN))
        .isEqualTo(first);
  }

  /**
   * VAL-031: the executor 2.0.0 &rarr; 2.1.0 pin bump is a fingerprint change, which is why it
   * ships in the same release as the {@code thinking-level: LOW} default (one recompile, not two).
   */
  @Test
  void theExecutor210PinBumpChangesTheFingerprint() {
    assertThat(
            fingerprint(SETTINGS, new RuntimePinProperties(1, "2.0.0", "2.0.0", "2.1.0", "1.63.0")))
        .isNotEqualTo(fingerprint(SETTINGS, PIN));
  }

  @Test
  void theDefaultOverloadUsesTheCurrentCodePins() {
    assertThat(fingerprint(SETTINGS, PIN))
        .isEqualTo(
            versions(
                CompilePins.PROMPT_VERSION,
                CompilePins.SYNTAX_REFERENCE_VERSION,
                VersionedIntentDeriver.CURRENT_VERSION,
                StepReferencePolicyDeriver.POLICY_VERSION));
  }

  @Test
  void gatewaySettingsModelAndMaxOutputTokensAreInputs() {
    String first = fingerprint(SETTINGS, PIN);

    assertThat(
            fingerprint(
                "{\"model\":\"other\",\"maxOutputTokens\":32768,\"thinkingLevel\":\"MEDIUM\"}",
                PIN))
        .isNotEqualTo(first);
    assertThat(
            fingerprint(
                "{\"model\":\"pinned\",\"maxOutputTokens\":16384,\"thinkingLevel\":\"MEDIUM\"}",
                PIN))
        .isNotEqualTo(first);
  }

  @Test
  void theThinkingLevelIsAnInputIncludingTheProviderDefaultFallback() {
    String medium = fingerprint(SETTINGS, PIN);
    String low =
        fingerprint(
            "{\"model\":\"pinned\",\"maxOutputTokens\":32768,\"thinkingLevel\":\"LOW\"}", PIN);
    String providerDefault =
        fingerprint(
            "{\"model\":\"pinned\",\"maxOutputTokens\":32768,"
                + "\"thinkingLevel\":\"PROVIDER_DEFAULT\"}",
            PIN);

    assertThat(low).isNotEqualTo(medium);
    assertThat(providerDefault)
        .as("switching thinkingConfig off is a different generation setting (AC 7)")
        .isNotEqualTo(medium)
        .isNotEqualTo(low);
  }

  @Test
  void thePromptVersionIsAnInput() {
    String current =
        versions(
            CompilePins.PROMPT_VERSION,
            CompilePins.SYNTAX_REFERENCE_VERSION,
            VersionedIntentDeriver.CURRENT_VERSION,
            StepReferencePolicyDeriver.POLICY_VERSION);

    assertThat(
            versions(
                "2.1.0",
                CompilePins.SYNTAX_REFERENCE_VERSION,
                VersionedIntentDeriver.CURRENT_VERSION,
                StepReferencePolicyDeriver.POLICY_VERSION))
        .as("a baseline compiled under the pre-10.45 layout no longer matches")
        .isNotEqualTo(current);
  }

  @Test
  void thePromptVersionAdvancedPastThePre1045Layout() {
    // 2.3.0: VAL-019b's envelope-repair instruction (prompt text only).
    assertThat(CompilePins.PROMPT_VERSION).isEqualTo("2.3.0");
  }

  @Test
  void theSyntaxReferenceIntentAndReferencePolicyVersionsAreInputs() {
    String first = versions("2.2.0", "2.1.0", "2", 2);

    assertThat(versions("2.2.0", "2.2.0", "2", 2)).isNotEqualTo(first);
    assertThat(versions("2.2.0", "2.1.0", "3", 2)).isNotEqualTo(first);
    assertThat(versions("2.2.0", "2.1.0", "2", 3)).isNotEqualTo(first);
  }

  @Test
  void everyRuntimePinIsAnInput() {
    String first = fingerprint(SETTINGS, PIN);

    assertThat(
            fingerprint(SETTINGS, new RuntimePinProperties(2, "2.0.0", "2.0.0", "2.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            fingerprint(SETTINGS, new RuntimePinProperties(1, "3.0.0", "2.0.0", "2.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            fingerprint(SETTINGS, new RuntimePinProperties(1, "2.0.0", "3.0.0", "2.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            fingerprint(SETTINGS, new RuntimePinProperties(1, "2.0.0", "2.0.0", "3.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            fingerprint(SETTINGS, new RuntimePinProperties(1, "2.0.0", "2.0.0", "2.0.0", "1.64.0")))
        .isNotEqualTo(first);
  }
}
