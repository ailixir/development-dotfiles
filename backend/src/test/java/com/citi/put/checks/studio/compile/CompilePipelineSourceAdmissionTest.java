package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * VAL-021 / VAL-022 — a draft with nothing to compile is refused on the request thread with {@code
 * 400 INVALID_STEPS}, before {@code beginCompile} and before any gateway call.
 *
 * <p>Previously an empty draft was accepted with {@code 202} and settled {@code STALE} with {@code
 * COMPILE_INTERNAL_ERROR}, and a whitespace-only step spent a gateway call to settle {@code
 * GATEWAY_PARSE_FAILURE}. Both are authoring mistakes the author can fix, so they get the same
 * actionable answer the save routes give. Collaborators are mocks so this runs without a database;
 * the end-to-end bounds behaviour is covered by {@code CompilePipelineTest}.
 */
class CompilePipelineSourceAdmissionTest {

  private static final UUID TEST_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

  private final StudioRepository repository = mock(StudioRepository.class);
  private final CompileStateService state = mock(CompileStateService.class);
  private final CompileExecutor executor = mock(CompileExecutor.class);
  private final LlmGatewayClient gateway = mock(LlmGatewayClient.class);
  private final RunnerValidationClient runner = mock(RunnerValidationClient.class);

  private final StudioCompileProperties properties =
      new StudioCompileProperties(
          new StudioCompileProperties.Pipeline(2, Duration.ofMillis(250)),
          new StudioCompileProperties.Authoring(100, 1024, 65536),
          new StudioCompileProperties.Diagnostics(10, 400, 120, 4096),
          new StudioCompileProperties.Repair(2),
          new StudioCompileProperties.Abandonment(true, Duration.ofSeconds(600), 200, 60_000L));

  private final CompilePipeline pipeline =
      new CompilePipeline(
          repository,
          state,
          executor,
          mock(PromptAssembler.class),
          new AuthoringLimits(properties),
          new CredentialPatternScreen(),
          mock(DiagnosticsBounder.class),
          gateway,
          runner,
          mock(RuntimePinProperties.class),
          mock(RepairPromptAssembler.class),
          properties);

  @Test
  void anEmptyDraftIsRefusedWithInvalidStepsAndNoCompileBegins() {
    draftWithSteps("[]");

    assertThatThrownBy(() -> pipeline.compile(TEST_ID, "owner@citi.com"))
        .isInstanceOf(StudioValidationException.class)
        .hasMessage("This test has no steps. Add at least one step before compiling.")
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(AuthoringLimits.INVALID_STEPS);

    assertNothingStarted();
  }

  @Test
  void aWhitespaceOnlyStepIsRefusedBeforeTheGatewayIsPaidFor() {
    draftWithSteps("[\"Go to \\\"https://example.invalid\\\"\",\"   \"]");

    assertThatThrownBy(() -> pipeline.compile(TEST_ID, "owner@citi.com"))
        .isInstanceOf(StudioValidationException.class)
        .hasMessage("Step 2 is blank. Write what the step should do, or remove it.")
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(AuthoringLimits.INVALID_STEPS);

    assertNothingStarted();
  }

  private void draftWithSteps(String stepsJson) {
    UITest draft =
        new UITest(
            "Smoke",
            null,
            "60406",
            stepsJson,
            "[]",
            "chromium",
            1920,
            1080,
            "Development",
            "owner@citi.com");
    when(repository.findById(any())).thenReturn(Optional.of(draft));
  }

  private void assertNothingStarted() {
    verify(state).requireCompilable(TEST_ID);
    verify(state, never()).beginCompile(any());
    verifyNoInteractions(executor, gateway, runner);
  }
}
