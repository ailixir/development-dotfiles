package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.citi.put.checks.studio.entity.UITest;
import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * Story 10.9 AC-7 — <b>the §4.2 execution-affecting fields, and the one that is not reachable.</b>
 *
 * <p>§4.2 lists environment, variable values/references, viewport, timeout, browser, wait strategy
 * and target policy selection. Six of the seven are driven below, each by its own perturbation.
 * Browser is driven as the refusal it now is: since story 10.1 the only engine this product
 * executes is {@code chromium}, so the request never reaches the classifier.
 *
 * <p><b>Target policy selection is NOT reachable in this story, and is recorded as such — never as
 * passing.</b> @po ruled it on 2026-09-11 and it is verified here rather than restated: {@code
 * ConfigurationChangeClassifier.classify} compares seven values and there is no target-policy field
 * on {@code UITestRequest} or {@code TestConfiguration} to perturb. A test cannot drive a case the
 * contract has no field for, and adding the field here would be Article IV invention — and would
 * put the destination-policy contract in a story about confirmation.
 *
 * <p>Owner: <b>story 10.18</b> ({@code ED-04}, ADR-002 O-6, {@code SPK-05}), the story that
 * introduces destination policy.
 */
class TargetPolicyGapTest {

  private static final Path CLASSIFIER =
      Path.of(
          "src",
          "main",
          "java",
          "com",
          "citi",
          "put",
          "checks",
          "studio",
          "compile",
          "ConfigurationChangeClassifier.java");

  private final ConfigurationChangeClassifier classifier = new ConfigurationChangeClassifier();

  // ── the gap, held open ───────────────────────────────────────────────────

  /**
   * The target-policy perturbation, which cannot be written.
   *
   * <p>Disabled, and disabled for a reason that is checked by a live sibling rather than asserted
   * here: there is no field to change. When story 10.18 introduces destination policy it adds the
   * field, adds the comparison to {@code classify}, deletes the javadoc paragraph that records the
   * gap — at which point {@link #theClassifierStillRecordsTheTargetPolicyGap()} goes red — and
   * enables this.
   */
  @Test
  @Disabled(
      "NOT REACHABLE, not passing: no target-policy field exists on UITestRequest or"
          + " TestConfiguration to perturb. Owner: story 10.18 / ED-04 / ADR-002 O-6 / SPK-05.")
  void achangedTargetPolicyAdvancesTheConfigurationRevision() {
    throw new AssertionError(
        "story 10.18 introduces the destination policy field; until then there is nothing to"
            + " perturb and inventing one would be Article IV invention");
  }

  /**
   * The live half: the gap is real, and the classifier still records it.
   *
   * <p>Three independent checks, so the gap cannot be closed silently or forgotten quietly. If
   * 10.18 adds the field without updating {@code classify}, the second fails. If it updates {@code
   * classify} and leaves the javadoc, the third fails and the disabled test above must be enabled.
   */
  @Test
  void theClassifierStillRecordsTheTargetPolicyGap() throws IOException {
    assertThat(fieldNames(UITestRequest.class))
        .as(
            "if UITestRequest ever gains a target-policy field, story 10.18 has landed and the"
                + " disabled perturbation above must be enabled")
        .doesNotContain("targetPolicy", "target", "destination", "destinationPolicy");
    assertThat(fieldNames(TestConfiguration.class))
        .as("and the same for the nested execution-affecting configuration")
        .doesNotContain("targetPolicy", "target", "destination", "destinationPolicy");

    String source = Files.readString(CLASSIFIER, StandardCharsets.UTF_8);
    assertThat(source.toLowerCase(Locale.ROOT))
        .as("classify() must not silently start comparing a field that does not exist")
        .doesNotContain("gettargetpolicy")
        .doesNotContain("targetpolicy()");
    // Javadoc wraps, so the comparison is on the unwrapped text rather than on one line of it.
    String unwrapped = source.replaceAll("(?m)^\\s*\\*\\s?", " ").replaceAll("\\s+", " ");
    assertThat(unwrapped)
        .as(
            "the classifier's own javadoc is where this gap is recorded; deleting it without"
                + " landing the field would remove the only durable note that it exists")
        .contains(
            "Target policy selection is also an execution-affecting change per \u00a74.2, but no"
                + " such field exists on the test contract yet");
  }

  // ── the six that are reachable ───────────────────────────────────────────

  /**
   * Each reachable §4.2 field, perturbed alone, advances the configuration revision — and nothing
   * else does.
   *
   * <p>"Variable values/references" is split into two perturbations because §4.2 names them as two
   * facts: changing what a variable resolves to and changing which reference a step uses are
   * different edits and both must invalidate a confirmation.
   */
  @Test
  void everyReachableExecutionAffectingFieldAdvancesTheConfigurationRevision() {
    Map<String, UnaryOperator<UITestRequest>> perturbations = new LinkedHashMap<>();
    perturbations.put(
        "environment", r -> with(r, r.steps(), r.variables(), r.configuration(), "Staging"));
    perturbations.put(
        "viewport",
        r ->
            with(
                r,
                r.steps(),
                r.variables(),
                new TestConfiguration(
                    r.configuration().browser(),
                    new Viewport(1280, 720),
                    r.configuration().timeoutSeconds(),
                    r.configuration().waitStrategy()),
                r.environment()));
    perturbations.put(
        "timeout",
        r ->
            with(
                r,
                r.steps(),
                r.variables(),
                new TestConfiguration(
                    r.configuration().browser(),
                    r.configuration().viewport(),
                    45,
                    r.configuration().waitStrategy()),
                r.environment()));
    perturbations.put(
        "wait strategy",
        r ->
            with(
                r,
                r.steps(),
                r.variables(),
                new TestConfiguration(
                    r.configuration().browser(),
                    r.configuration().viewport(),
                    r.configuration().timeoutSeconds(),
                    "load"),
                r.environment()));
    perturbations.put(
        "variable value",
        r ->
            with(
                r,
                r.steps(),
                List.of(new StudioVariable("USER", "plain", "changed", null)),
                r.configuration(),
                r.environment()));
    perturbations.put(
        "variable reference",
        r ->
            with(
                r,
                r.steps(),
                List.of(new StudioVariable("USER", "secretRef", null, "OTHER_SECRET")),
                r.configuration(),
                r.environment()));

    perturbations.forEach(
        (name, mutation) -> {
          UITest stored = draft();
          ConfigurationChangeClassifier.Classification change =
              classifier.classify(stored, mutation.apply(baseline()));

          assertThat(change.configurationChanged())
              .as("%s is an execution-affecting change (§4.2)", name)
              .isTrue();
          assertThat(change.sourceChanged()).as("%s changes no step text", name).isFalse();
        });
  }

  /**
   * Browser: the seventh §4.2 field, and the reason it has no perturbation of its own.
   *
   * <p>Since story 10.1 the only engine this product executes is {@code chromium}: the column
   * carries a CHECK constraint and the controller boundary rejects anything else, so there is no
   * legal browser change left to advance a revision. What used to be a configuration change is now
   * a rejected request, and that is stated here rather than left as a missing case.
   */
  @Test
  void theOnlyLegalBrowserIsTheCanonicalOneSoABrowserChangeIsARefusalRatherThanARevision() {
    assertThat(TestConfiguration.CANONICAL_BROWSER).isEqualTo("chromium");

    UITest stored = draft();
    ConfigurationChangeClassifier.Classification unchanged =
        classifier.classify(stored, baseline());

    assertThat(unchanged.configurationChanged())
        .as("resubmitting the canonical engine advances nothing")
        .isFalse();
  }

  /** The negative case §4.2 names: name and description advance neither revision. */
  @Test
  void aNameOrDescriptionChangeAdvancesNeitherRevision() {
    UITest stored = draft();
    UITestRequest renamed =
        new UITestRequest(
            "A completely different name",
            "and a different description",
            "60417",
            baseline().environment(),
            baseline().steps(),
            baseline().variables(),
            baseline().configuration(),
            1L,
            1L);

    ConfigurationChangeClassifier.Classification change = classifier.classify(stored, renamed);

    assertThat(change.configurationChanged()).isFalse();
    assertThat(change.sourceChanged()).isFalse();
    assertThat(change.anyChanged()).isFalse();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static List<String> fieldNames(Class<?> recordType) {
    return Arrays.stream(recordType.getRecordComponents()).map(RecordComponent::getName).toList();
  }

  private static UITestRequest baseline() {
    return new UITestRequest(
        "Gap draft",
        null,
        "60417",
        "Production",
        List.of("Go home"),
        List.of(new StudioVariable("USER", "plain", "original", null)),
        new TestConfiguration("chromium", new Viewport(1920, 1080), 30, "networkidle"),
        1L,
        1L);
  }

  private static UITestRequest with(
      UITestRequest base,
      List<String> steps,
      List<StudioVariable> variables,
      TestConfiguration configuration,
      String environment) {
    return new UITestRequest(
        base.name(),
        base.description(),
        base.csiId(),
        environment,
        steps,
        variables,
        configuration,
        base.sourceRevision(),
        base.configurationRevision());
  }

  /** The stored draft the baseline request describes exactly — so only the perturbation differs. */
  private static UITest draft() {
    UITest test =
        new UITest(
            "Gap draft",
            null,
            "60417",
            "[\"Go home\"]",
            "[{\"name\":\"USER\",\"kind\":\"plain\",\"value\":\"original\"}]",
            "chromium",
            1920,
            1080,
            "Production",
            "gap@citi.com");
    test.setTimeoutSeconds(30);
    test.setWaitStrategy("networkidle");
    return test;
  }
}
