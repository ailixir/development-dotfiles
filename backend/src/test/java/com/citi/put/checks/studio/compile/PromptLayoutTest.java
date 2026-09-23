package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.incremental.CompilationPlanner;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.ContextText;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Story 10.45 Task 1.4 — static-first prompt layout (AC 1, 3, 9; FR-11, FR-12, NFR-7, FR-5 AC-5.2).
 *
 * <p>The assertions are made on the bytes the transport actually builds: the static prefix and the
 * per-request contents come from the gateway's own {@code GatewayPayloadSerializer}, reached
 * reflectively because it is package-private to the transport. A copy of its concatenation here
 * would keep passing if the serializer changed.
 */
class PromptLayoutTest {

  private static final String GLOBAL_MARKER = "global-context-marker-7c1e";

  private final PromptAssembler assembler = new PromptAssembler();

  // ── AC 1 / FR-11: the static block is identical and carries nothing per test ──────────────

  @Test
  void twoDifferentTestsShareByteIdenticalSystemInstructionWithNoIdsReferencesOrMode()
      throws Exception {
    UUID firstRequest = UUID.randomUUID();
    UUID secondRequest = UUID.randomUUID();
    CompileRequest legacy =
        assembler.assemble(
            UUID.randomUUID(),
            "60401",
            "author@citi.com",
            firstRequest,
            1,
            List.of("Go to \"https://example.com\""));
    CompileRequest v2 =
        assembler.assemble(
            UUID.randomUUID(),
            "60402",
            "other@citi.com",
            secondRequest,
            1,
            List.of("Click \"Sign in\"", "Type \"<secret LAYOUT_SECRET_91B>\" in \"Password\""),
            ContextPromptSection.from(authoring(GLOBAL_MARKER, 2)));
    CompileRequest captured = assembler.assembleCaptured(capture(), 1, null);

    String prefix = staticPrefix(legacy);
    assertThat(staticPrefix(v2).getBytes(StandardCharsets.UTF_8))
        .isEqualTo(prefix.getBytes(StandardCharsets.UTF_8));
    assertThat(staticPrefix(captured).getBytes(StandardCharsets.UTF_8))
        .as("the captured path no longer appends the reference list to the contract")
        .isEqualTo(prefix.getBytes(StandardCharsets.UTF_8));
    assertThat(prefix)
        .as("the static block is the two pinned bodies and nothing else")
        .isEqualTo(assembler.outputContract() + "\n\n" + assembler.syntaxReference());

    for (CompileRequest request : List.of(legacy, v2, captured)) {
      assertThat(prefix)
          .doesNotContain(request.testId().toString())
          .doesNotContain(request.compileRequestId())
          .doesNotContain("Required envelope kind")
          .doesNotContain("Writable step IDs")
          .doesNotContain("Declared opaque references")
          .doesNotContain("LAYOUT_SECRET_91B")
          .doesNotContain(GLOBAL_MARKER);
      for (UUID writable : request.writableStepIds()) {
        assertThat(prefix).doesNotContain(writable.toString());
      }
    }
  }

  // ── AC 3 / FR-12 / NFR-7: global context exactly once ────────────────────────────────────

  @Test
  void theGlobalContextAppearsExactlyOnceAndLeadsTheSteps() throws Exception {
    int steps = 6;
    List<String> source = new ArrayList<>();
    for (int index = 0; index < steps; index++) {
      source.add("step source " + index);
    }
    CompileRequest request =
        assembler.assemble(
            UUID.randomUUID(),
            "60401",
            "author@citi.com",
            UUID.randomUUID(),
            1,
            source,
            ContextPromptSection.from(authoring(GLOBAL_MARKER, steps)));

    String contents = requestContents(request);
    assertThat(occurrences(contents, GLOBAL_MARKER))
        .as("the prompt is linear in steps, not steps x global context")
        .isEqualTo(1);
    assertThat(contents.indexOf(GLOBAL_MARKER))
        .as("the global context precedes every step")
        .isLessThan(contents.indexOf("step source 0"));
    assertThat(request.fencedSourceLines())
        .as("still one fenced line per step, so the writable IDs are one per step")
        .hasSize(steps);
    assertThat(request.writableStepIds()).hasSize(steps);
    assertThat(occurrences(contents, "untrustedContext"))
        .as("each step still carries its own step context")
        .isEqualTo(steps);
  }

  // ── reference names and writable IDs follow the static block ─────────────────────────────

  @Test
  void referenceNamesAndTheFrozenWritableIdsTravelInTheContentsAfterTheStaticBlock()
      throws Exception {
    CompileStateService.Capture capture = capture();
    CompileRequest request = assembler.assembleCaptured(capture, 1, null);

    String contents = requestContents(request);
    assertThat(contents).contains("references: ").contains("LAYOUT_SECRET_91B");
    assertThat(request.writableStepIds()).isEqualTo(capture.plan().writableIds());
    for (UUID writable : capture.plan().writableIds()) {
      assertThat(contents).contains(writable.toString());
    }
    assertThat(contents.indexOf("references: "))
        .as("reference names lead the per-request contents, before the steps")
        .isLessThan(contents.indexOf("open the login page"));
  }

  // ── AC 9 / FR-5 AC-5.2 / EC-15: size cap measured after dedup ────────────────────────────

  @Test
  void theSizeCapIsMeasuredAfterDeduplication() {
    // 12 KiB of global context on 5 steps: 60 KiB if copied per step, ~12 KiB deduplicated.
    String global = "g".repeat(12 * 1024);
    ContextPromptSection section = ContextPromptSection.from(authoring(global, 5));

    assertThat(section.encodedBytes())
        .as("the global context is counted once")
        .isLessThan(ContextPromptSection.MAX_BYTES)
        .isGreaterThan(12 * 1024);
    assertThat(section.encodedBytes()).isLessThan(2 * 12 * 1024);
  }

  @Test
  void anOversizedCompleteContextIsRefusedAndAnAcceptedOneIsNeverTruncated() throws Exception {
    assertThatThrownBy(
            () ->
                ContextPromptSection.from(authoring("x".repeat(ContextPromptSection.MAX_BYTES), 1)))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo("CONTEXT_TOO_LARGE");

    String nearCap = GLOBAL_MARKER + "y".repeat(30 * 1024) + "-end-of-global";
    CompileRequest request =
        assembler.assemble(
            UUID.randomUUID(),
            "60401",
            "author@citi.com",
            UUID.randomUUID(),
            1,
            List.of("one", "two", "three"),
            ContextPromptSection.from(authoring(nearCap, 3)));
    assertThat(requestContents(request)).as("the accepted context is sent whole").contains(nearCap);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static AuthoringV2Request authoring(String globalText, int steps) {
    List<AuthoringStep> authored = new ArrayList<>();
    for (int index = 0; index < steps; index++) {
      authored.add(new AuthoringStep(UUID.randomUUID(), "source", StepAuthoringContext.empty()));
    }
    return new AuthoringV2Request(
        2, new GlobalAuthoringContext(List.of(new ContextText(globalText)), List.of()), authored);
  }

  private static CompileStateService.Capture capture() {
    UUID first = UUID.randomUUID();
    UUID second = UUID.randomUUID();
    CompileInputs inputs =
        new CompileInputs(
            UUID.randomUUID(),
            "60403",
            "author@citi.com",
            List.of("open the login page", "Type \"<secret LAYOUT_SECRET_91B>\""),
            List.of("USERNAME"),
            List.of("LAYOUT_SECRET_91B"),
            "{}");
    return new CompileStateService.Capture(
        new com.citi.put.checks.studio.compile.CompileRequest(UUID.randomUUID(), 1, 1),
        inputs,
        List.of(
            new CompilationPlanner.Step(first, "open the login page"),
            new CompilationPlanner.Step(second, "Type \"<secret LAYOUT_SECRET_91B>\"")),
        new CompilationPlanner.Plan(
            CompilationPlanner.Mode.FULL, "FULL_REQUESTED", List.of(first, second), 0),
        null,
        "authoring-hash",
        "fingerprint",
        null);
  }

  private static String staticPrefix(CompileRequest request) throws Exception {
    return (String) serializer("staticPrefix").invoke(null, request);
  }

  private static String requestContents(CompileRequest request) throws Exception {
    return (String) serializer("requestContents").invoke(null, request);
  }

  private static Method serializer(String name) throws Exception {
    Method method =
        Class.forName("com.citi.put.checks.studio.compile.gateway.GatewayPayloadSerializer")
            .getDeclaredMethod(name, CompileRequest.class);
    method.setAccessible(true);
    return method;
  }

  private static int occurrences(String haystack, String needle) {
    Matcher matcher = Pattern.compile(Pattern.quote(needle)).matcher(haystack);
    int count = 0;
    while (matcher.find()) {
      count++;
    }
    return count;
  }
}
