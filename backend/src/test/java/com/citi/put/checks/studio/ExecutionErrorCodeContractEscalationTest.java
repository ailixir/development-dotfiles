package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * <b>DELIBERATELY RED — a contract divergence escalated rather than fixed (ADR-002 §12).</b>
 *
 * <p>Story 10.7 AC-13a required "a terminal {@code ERROR} with an explicit code" for a revoked
 * permission and a vanished reference at dispatch. §5.1.3 names neither, so a name had to be chosen
 * rather than inferred, and @po ratified {@code AUTHORIZATION_REVOKED} and {@code
 * REFERENCE_UNAVAILABLE} on 2026-09-11. Both are now on {@link ExecutionErrorCode} and both are
 * persisted to {@code ui_test_executions.error_code}, which the public {@code ExecutionSnapshot}
 * exposes as {@code errorCode}.
 *
 * <p>The frozen contract's {@code components.schemas.ExecutionErrorCode} still enumerates only the
 * original six. Widening it is <b>not this story's call</b>: ADR-002 §12 puts "anything on the
 * public surface" in Class C — architect, always — and states separately that "loosening is never a
 * story's call… widening an enum… is Class B even when it looks like Class A". So the edit is not
 * made here, and §12's other rule applies instead: <b>leave it red and escalate</b>. Story 10.6 did
 * exactly this and it is why four divergences were ruled on instead of buried.
 *
 * <p><b>What an architect is being asked for:</b> add {@code AUTHORIZATION_REVOKED} and {@code
 * REFERENCE_UNAVAILABLE} to {@code components.schemas.ExecutionErrorCode}, and record the amendment
 * in ADR-002 §13. Both are API-assigned, both are disjoint from every value a runner may emit, and
 * both keep 10.12's {@code {TIMEOUT}}-only intersection intact. When that lands, this test goes
 * green with no change to it.
 *
 * <p>It is a test rather than a comment because a comment is deleted by whoever finds it
 * inconvenient, and because the whole point of the mechanism §6.2 installed is that a divergence
 * has to fail something.
 */
class ExecutionErrorCodeContractEscalationTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");

  private static Map<String, Object> contract;

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContract() throws IOException {
    contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
  }

  @Test
  void everyCodeTheApiCanPersistIsDeclaredInTheFrozenContract() {
    Set<String> declared = new TreeSet<>(contractEnum());
    Set<String> assigned = new TreeSet<>(ExecutionErrorCode.values());

    assertThat(declared)
        .as(
            "ESCALATION, not a build break: story 10.7 AC-13a persists two codes @po ratified on "
                + "2026-09-11, and widening the public ExecutionErrorCode enum is ADR-002 §12 "
                + "Class C — an architect must rule first, and a story may not land it. This test "
                + "is left failing on purpose so the divergence cannot be buried. Missing from "
                + "openapi.yaml: %s",
            difference(assigned, declared))
        .containsAll(assigned);
  }

  @Test
  void theTwoRatifiedCodesAreOnTheApiSideOfTheVocabularyAndCannotComeFromARunner() {
    // This half is decidable inside the story and is green: the escalation above is only about
    // where the enumeration is *declared*, not about who assigns its values.
    assertThat(ExecutionErrorCode.values())
        .contains(
            ExecutionErrorCode.AUTHORIZATION_REVOKED, ExecutionErrorCode.REFERENCE_UNAVAILABLE);
    assertThat(ExecutionErrorCode.reaperAssigned())
        .doesNotContain(
            ExecutionErrorCode.AUTHORIZATION_REVOKED, ExecutionErrorCode.REFERENCE_UNAVAILABLE);
  }

  @SuppressWarnings("unchecked")
  private static List<String> contractEnum() {
    Map<String, Object> components = (Map<String, Object>) contract.get("components");
    Map<String, Object> schemas = (Map<String, Object>) components.get("schemas");
    Map<String, Object> schema = (Map<String, Object>) schemas.get("ExecutionErrorCode");
    List<Object> values = (List<Object>) schema.get("enum");
    List<String> declared = new ArrayList<>();
    values.stream()
        .filter(java.util.Objects::nonNull)
        .forEach(value -> declared.add(String.valueOf(value)));
    return declared;
  }

  private static Set<String> difference(Set<String> assigned, Set<String> declared) {
    Set<String> missing = new TreeSet<>(assigned);
    missing.removeAll(declared);
    return missing;
  }
}
