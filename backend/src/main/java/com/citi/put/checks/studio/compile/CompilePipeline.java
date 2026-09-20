package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Asynchronous compile orchestration: begin, prompt, gateway, parse, validate, publish (Story 10.8,
 * AC-2 to AC-20).
 *
 * <h2>The draft is committed before any compile work begins</h2>
 *
 * <p>{@link #compile} is called from the request thread <em>after</em> the draft transaction has
 * committed — from the compile route directly, or through {@link #enqueueAfterCommit} on save. No
 * gateway call, no runner call and no outbound HTTP of any kind happens inside the request thread
 * or inside a database transaction. That is &sect;8.3's "persist draft and enqueue compile without
 * waiting for gateway", and it is what makes a gateway outage a compile failure rather than a lost
 * draft.
 *
 * <h2>Every transition goes through {@link CompileStateService}</h2>
 *
 * <p>This class writes none of {@code compile_status}, {@code compile_request_id}, {@code
 * compile_error}, {@code compile_diagnostics}, {@code current_candidate_revision_id} or {@code
 * confirmed_revision_id} by any other path — no repository setter, no JPA dirty write, no ad-hoc
 * SQL. {@code CompileStateSurfaceTest} scans this package and fails on any statement that does.
 *
 * <p>The {@link CompileRequest} value returned by {@code beginCompile} is carried through the whole
 * attempt and passed back verbatim; it is never reconstructed. A reconstructed request would
 * compare against the revisions as they are <em>now</em> rather than the ones the compile was
 * started for, which is precisely the comparison that discards an out-of-order result — including
 * two compiles of the same unedited source, where nothing but the request identity distinguishes
 * the older attempt from the newer one.
 *
 * <h2>The repair loop is bounded, and every attempt goes through the same gate</h2>
 *
 * <p>Architecture &sect;4.3 allows "a maximum of two repair attempts", so one compile request makes
 * at most three {@code propose} calls and at most three {@code /v1/validate} calls, numbered 1, 2,
 * 3 and never repeated. Every attempt — including a repair — passes the {@code
 * SUPPORTED_ARTIFACT_VERSION} pin and {@code /v1/validate} before any publication, and a successful
 * repair is published through {@code publishCandidate} to {@code AWAITING_CONFIRMATION}. There is
 * no path from this loop to {@code CompileStateService.confirm}: a repaired draft is refused {@code
 * 409 COMPILE_REQUIRED} by the readiness gate until a principal calls {@code confirm-compile}.
 *
 * <p>The settlement is re-checked between <em>every</em> pair of calls in the loop, not only once
 * per request: the budget now covers the whole request including its repairs, so an expiry can land
 * between attempt 2's validator call and attempt 3's gateway call, and a late result from an
 * abandoned repair is dropped in process without calling any publish method.
 *
 * <p>A gateway or validator failure on a repair call ends the loop with that code and does not
 * silently consume a further attempt. Only an {@code ok: false} verdict — a 200 with a verdict, not
 * a transport failure — spends one.
 *
 * <h2>No cache</h2>
 *
 * <p>The compile cache stays disabled in V1 (&sect;8.5). There is no cache, no memoization and no
 * keyed reuse of a gateway response here: two compiles of byte-identical source issue two {@code
 * propose} calls. 10.4's {@code insertOrReuseRevision} is not a counter-example — it resolves an
 * identical artifact to the existing revision row <em>after</em> the gateway has answered. That is
 * artifact identity; a cache would have avoided the call.
 */
@Service
public class CompilePipeline {

  private static final Logger LOGGER = LoggerFactory.getLogger(CompilePipeline.class);
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final StudioRepository studioRepository;
  private final CompileStateService compileStateService;
  private final CompileExecutor executor;
  private final PromptAssembler promptAssembler;
  private final AuthoringLimits authoringLimits;
  private final CredentialPatternScreen credentialScreen;
  private final DiagnosticsBounder diagnosticsBounder;
  private final LlmGatewayClient gatewayClient;
  private final RunnerValidationClient validationClient;
  private final RuntimePinProperties runtimePin;
  private final RepairPromptAssembler repairPromptAssembler;
  private final StudioCompileProperties properties;

  @SuppressWarnings("checkstyle:ParameterNumber")
  public CompilePipeline(
      StudioRepository studioRepository,
      CompileStateService compileStateService,
      CompileExecutor executor,
      PromptAssembler promptAssembler,
      AuthoringLimits authoringLimits,
      CredentialPatternScreen credentialScreen,
      DiagnosticsBounder diagnosticsBounder,
      LlmGatewayClient gatewayClient,
      RunnerValidationClient validationClient,
      RuntimePinProperties runtimePin,
      RepairPromptAssembler repairPromptAssembler,
      StudioCompileProperties properties) {
    this.studioRepository = studioRepository;
    this.compileStateService = compileStateService;
    this.executor = executor;
    this.promptAssembler = promptAssembler;
    this.authoringLimits = authoringLimits;
    this.credentialScreen = credentialScreen;
    this.diagnosticsBounder = diagnosticsBounder;
    this.gatewayClient = gatewayClient;
    this.validationClient = validationClient;
    this.runtimePin = runtimePin;
    this.repairPromptAssembler = repairPromptAssembler;
    this.properties = properties;
  }

  /**
   * Accepts a compile request and starts the bounded attempt.
   *
   * <p>Order is part of the contract. The lifecycle guard runs first, so a deleted or quarantined
   * draft is refused by 10.4's own codes rather than by a limit. Authoring limits and the
   * credential screen run next, on the request thread, and reject with a {@code 400}
   * <em>before</em> {@code beginCompile}: a draft that cannot be compiled must not first be moved
   * to {@code COMPILING} and then failed. Only then is the request identity persisted and the
   * attempt submitted.
   *
   * @param testId the draft to compile
   * @param principal the authenticated user
   * @return the persisted compile request identity and the revisions it was started for
   * @throws com.citi.put.checks.studio.StudioValidationException over a bound, or an inline
   *     credential — {@code 400}, and no compile state changed
   * @throws com.citi.put.checks.studio.StudioConflictException the draft is deleted or quarantined
   */
  public CompileRequest compile(UUID testId, String principal) {
    compileStateService.requireCompilable(testId);

    UITest draft =
        studioRepository
            .findById(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    CompileInputs inputs = CompileInputs.from(draft, principal);
    ContextCompileInputs contextInputs;
    try {
      contextInputs = ContextCompileInputs.from(draft);
    } catch (IllegalArgumentException exception) {
      throw new StudioValidationException(
          "UNRESOLVED_TYPED_INTENT", "Saved v2 authoring cannot produce closed expected intent");
    }

    if (contextInputs != null && contextInputs.blocked()) {
      throw new StudioValidationException(
          "UNRESOLVED_TYPED_INTENT",
          "Saved v2 authoring has blocking deterministic intent diagnostics: "
              + contextInputs.blockingDiagnostics().stream()
                  .map(diagnostic -> diagnostic.category().name())
                  .distinct()
                  .toList());
    }

    authoringLimits.requireWithinLimits(inputs.orderedSource());
    credentialScreen.requireNoInlineCredentials(inputs.orderedSource());

    CompileRequest request = compileStateService.beginCompile(testId);
    if (contextInputs != null && !contextInputs.matches(request)) {
      publishError(testId, request, CompileErrorCode.COMPILE_INTERNAL_ERROR);
      return request;
    }

    boolean started =
        executor.submit(
            settlement -> runAttempt(inputs, contextInputs, request, settlement),
            () -> publishError(inputs.testId(), request, CompileErrorCode.COMPILE_BUDGET_EXCEEDED));
    if (!started) {
      // Saturation is refusal, not queueing. The 202 still holds: acceptance and execution are
      // separate events, and the refusal surfaces asynchronously as a retryable STALE.
      publishError(testId, request, CompileErrorCode.COMPILE_POOL_SATURATED);
    }
    return request;
  }

  /**
   * Enqueues a compile once the current transaction has committed, or immediately when there is
   * none.
   *
   * <p>The commit boundary is the point: {@code POST /tests} and {@code PUT /tests/{id}} must
   * return without waiting for the gateway, and the row must be readable from another connection
   * before the compile reads it. Registering the enqueue as an after-commit synchronisation is what
   * makes both true without the caller having to remember either.
   *
   * @param testId the draft to compile
   * @param principal the authenticated user
   */
  public void enqueueAfterCommit(UUID testId, String principal) {
    if (!TransactionSynchronizationManager.isSynchronizationActive()) {
      enqueueQuietly(testId, principal);
      return;
    }
    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
          @Override
          public void afterCommit() {
            enqueueQuietly(testId, principal);
          }
        });
  }

  private void enqueueQuietly(UUID testId, String principal) {
    try {
      compile(testId, principal);
    } catch (RuntimeException e) {
      // A save must never fail because its optional compile could not start.
      // The exception type, not its message: a parse failure's message can quote the very source
      // or artifact text this path must never log (AC-29).
      LOGGER.warn(
          "studio.compile.enqueue_failed testId={} type={}", testId, e.getClass().getName());
    }
  }

  // ── the attempt ────────────────────────────────────────────────────────────

  private void runAttempt(
      CompileInputs inputs,
      ContextCompileInputs contextInputs,
      CompileRequest request,
      CompileExecutor.Settlement settlement) {
    try {
      AggregateUsage aggregate = new AggregateUsage(properties.aggregate());
      int maxAttempts = 1 + repairAttempts();
      int stepCount = inputs.orderedSource().size();
      String lastDiagnostics = null;

      for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        if (settlement.isSettled()) {
          // The budget expired between attempts. Stop before spending a gateway call on a result
          // that can no longer be published.
          dropLateResult(inputs.testId(), request, "repair");
          return;
        }

        com.citi.put.checks.studio.compile.gateway.CompileRequest prompt =
            assemblePrompt(inputs, contextInputs, request.requestId(), attempt, lastDiagnostics);

        if (!aggregate.canStart()) {
          settleError(
              settlement,
              inputs.testId(),
              request,
              CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
          return;
        }

        CompileResponse response = gatewayClient.propose(prompt);
        if (!aggregate.charge(response)) {
          settleError(
              settlement,
              inputs.testId(),
              request,
              CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
          return;
        }
        if (!response.isOk()) {
          // A gateway refusal ends the whole request — on a repair exactly as on the first
          // attempt. It does not silently consume a further attempt and then try again: the
          // condition is a bound firing (GATEWAY_BUSY, a timeout, a transport failure), and
          // spending the remaining repair budget on it would turn one refusal into three.
          settleError(settlement, inputs.testId(), request, response.errorCode().name());
          return;
        }

        String artifactJson = response.artifactJson();
        if (!isSupportedArtifactVersion(artifactJson)) {
          // Schema validity is not executability, and a repair goes back through this gate rather
          // than around it: a schema-valid `version: 2` document returned by attempt 3 is rejected
          // exactly as it is on attempt 1, is never written as a candidate revision, and is never
          // sent to /v1/validate.
          settleError(
              settlement, inputs.testId(), request, GatewayErrorCode.GATEWAY_PARSE_FAILURE.name());
          return;
        }

        if (settlement.isSettled()) {
          // The budget expired while the gateway held this attempt. Stop here rather than spending
          // a validator call on a result that can no longer be published.
          dropLateResult(inputs.testId(), request, "gateway");
          return;
        }

        ValidationOutcome validation =
            validationClient.validate(
                artifactJson,
                inputs.orderedSource(),
                inputs.variableNames(),
                inputs.secretNames(),
                contextInputs == null ? null : contextInputs.expectedIntent());

        if (!validation.available()) {
          settleError(
              settlement, inputs.testId(), request, CompileErrorCode.VALIDATOR_UNAVAILABLE.name());
          return;
        }

        if (validation.ok()) {
          if (!settlement.claim()) {
            dropLateResult(inputs.testId(), request, "candidate");
            return;
          }
          // A repaired candidate is published exactly as a first-attempt one: through
          // publishCandidate, to AWAITING_CONFIRMATION, never to READY. Nothing in this loop can
          // reach CompileStateService.confirm.
          compileStateService.publishCandidate(
              inputs.testId(),
              request,
              candidate(
                  inputs, contextInputs, request, artifactJson, response.provenance(), validation));
          return;
        }

        // A verdict, not a transport failure: `ok: false` is still a 200. Bound the diagnostics
        // now, because they are both what a repair is given to work from and what is persisted if
        // this turns out to be the last attempt — one bounding path, so the byte cap stays true.
        lastDiagnostics =
            diagnosticsBounder.bound(validation, stepCount, attempt, attempt >= maxAttempts);
      }

      // Exhausted repair yields NEEDS_REVISION (§4.7), carrying the FINAL attempt's diagnostics
      // only. Earlier attempts describe artifacts the author never saw; `attempts` preserves the
      // fact that repair happened, and `exhausted` that it stopped at the bound.
      if (!settlement.claim()) {
        dropLateResult(inputs.testId(), request, "invalid");
        return;
      }
      compileStateService.publishInvalid(inputs.testId(), request, lastDiagnostics);
    } catch (RuntimeException e) {
      LOGGER.warn(
          "studio.compile.internal_error testId={} type={}",
          inputs.testId(),
          e.getClass().getName());
      settleError(
          settlement, inputs.testId(), request, CompileErrorCode.COMPILE_INTERNAL_ERROR.name());
    }
  }

  static final class AggregateUsage {

    private final long maxCalls;
    private final long maxBytes;
    private long calls;
    private long bytes;

    AggregateUsage(StudioCompileProperties.Aggregate bound) {
      if (bound == null || bound.maxCalls() <= 0 || bound.maxBytes() <= 0) {
        throw new IllegalArgumentException("aggregate compile bounds must be positive");
      }
      this.maxCalls = bound.maxCalls();
      this.maxBytes = bound.maxBytes();
    }

    boolean canStart() {
      return calls < maxCalls && bytes < maxBytes;
    }

    boolean charge(CompileResponse response) {
      long transportCalls = 1L + Math.max(0, response.retries());
      long repeatedInput;
      try {
        repeatedInput = Math.multiplyExact(transportCalls, Math.max(0, response.inputBytes()));
        calls = Math.addExact(calls, transportCalls);
        bytes =
            Math.addExact(bytes, Math.addExact(repeatedInput, Math.max(0, response.outputBytes())));
      } catch (ArithmeticException overflow) {
        calls = Long.MAX_VALUE;
        bytes = Long.MAX_VALUE;
      }
      return calls <= maxCalls && bytes <= maxBytes;
    }

    long calls() {
      return calls;
    }

    long bytes() {
      return bytes;
    }
  }

  private com.citi.put.checks.studio.compile.gateway.CompileRequest assemblePrompt(
      CompileInputs inputs,
      ContextCompileInputs contextInputs,
      UUID requestId,
      int attempt,
      String diagnostics) {
    if (contextInputs == null) {
      return attempt == 1
          ? promptAssembler.assemble(
              inputs.testId(),
              inputs.csiId(),
              inputs.principal(),
              requestId,
              attempt,
              inputs.orderedSource())
          : repairPromptAssembler.assemble(inputs, requestId, attempt, diagnostics);
    }
    com.citi.put.checks.studio.compile.gateway.CompileRequest prompt =
        promptAssembler.assemble(
            inputs.testId(),
            inputs.csiId(),
            inputs.principal(),
            requestId,
            attempt,
            inputs.orderedSource(),
            contextInputs.promptSection());
    if (attempt == 1) {
      return prompt;
    }
    if (diagnostics == null || diagnostics.isBlank()) {
      throw new IllegalArgumentException("repair requires bounded diagnostics");
    }
    return new com.citi.put.checks.studio.compile.gateway.CompileRequest(
        prompt.testId(),
        prompt.csiId(),
        prompt.principal(),
        prompt.compileRequestId(),
        prompt.attempt(),
        prompt.fencedSourceLines(),
        prompt.syntaxReference(),
        prompt.syntaxReferenceVersion(),
        prompt.outputContract(),
        prompt.promptVersion(),
        diagnostics);
  }

  private static String correspondenceDiagnostics(
      List<AuthoringDiagnostic> diagnostics, int attempt, boolean exhausted) {
    ObjectNode root = MAPPER.createObjectNode();
    root.put("attempts", attempt);
    root.put("exhausted", exhausted);
    root.set("steps", MAPPER.valueToTree(diagnostics));
    String json = root.toString();
    if (json.length() > ContextPromptSection.MAX_BYTES) {
      throw new IllegalArgumentException("typed-intent diagnostics exceed the bounded prompt size");
    }
    return json;
  }

  /**
   * The configured repair bound, defensively floored at zero.
   *
   * <p>Architecture &sect;4.3 fixes it at two, so the deployed value is two and the startup
   * validation in {@link StudioCompileProperties#validate} checks the budget against it. A negative
   * value would mean "fewer than one attempt", which is not a compile.
   */
  private int repairAttempts() {
    return Math.max(0, properties.repair().maxAttempts());
  }

  /**
   * Builds the immutable candidate revision, including the &sect;8.1 provenance.
   *
   * <p>{@code artifactSchemaVersion} is the pin this backend re-asserted, not whatever the document
   * claimed — the two are equal by construction here, and recording the pin is what lets the
   * readiness gate re-assert it later against a configured value rather than against the artifact's
   * own self-description.
   */
  private CandidateRevision candidate(
      CompileInputs inputs,
      ContextCompileInputs contextInputsForCandidate,
      CompileRequest request,
      String artifactJson,
      GatewayProvenance gatewayProvenance,
      ValidationOutcome validation) {
    String canonicalArtifact = ArtifactCanonicalizer.canonicalize(artifactJson);
    String canonicalSource = ArtifactCanonicalizer.canonicalSource(inputs.orderedSource());
    return new CandidateRevision(
        request.configurationRevision(),
        canonicalSource,
        ArtifactCanonicalizer.hash(canonicalSource),
        canonicalArtifact,
        ArtifactCanonicalizer.hash(canonicalArtifact),
        CompilePins.SUPPORTED_ARTIFACT_VERSION,
        inputs.configurationJson(),
        inputs.referencesJson(),
        provenance(gatewayProvenance, validation, contextInputsForCandidate != null),
        inputs.principal(),
        contextInputsForCandidate == null ? null : contextInputsForCandidate.expectedIntent(),
        contextInputsForCandidate == null ? null : VersionedIntentDeriver.CURRENT_VERSION);
  }

  private String provenance(
      GatewayProvenance gateway, ValidationOutcome validation, boolean versionedIntent) {
    ObjectNode provenance = MAPPER.createObjectNode();
    provenance.put("model", gateway == null ? null : gateway.model());
    provenance.put("modelVersion", gateway == null ? null : gateway.modelVersion());
    provenance.put("sdkVersion", gateway == null ? null : gateway.sdkVersion());
    provenance.put("promptVersion", CompilePins.PROMPT_VERSION);
    provenance.put("syntaxReferenceVersion", CompilePins.SYNTAX_REFERENCE_VERSION);
    provenance.put("artifactSchemaVersion", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    // The validator reports the version it actually ran, not the version we hoped it would run.
    String validatorSchemaVersion =
        validation.validatorSchemaVersion() == null
            ? runtimePin.validatorSchemaVersion()
            : validation.validatorSchemaVersion();
    provenance.put("validatorSchemaVersion", validatorSchemaVersion);
    // The accepted-language policy *is* the validator schema + parser pair (studio-runner
    // versions.ts): one value, recorded under both names rather than invented twice.
    provenance.put("languagePolicyVersion", validatorSchemaVersion);
    // Recorded for the runner's own ranged revalidation; never compared by this backend (AC-25).
    provenance.put("executorVersion", runtimePin.executorVersion());
    provenance.put("playwrightVersion", runtimePin.playwrightVersion());
    if (versionedIntent) {
      provenance.put("intentDerivationVersion", VersionedIntentDeriver.CURRENT_VERSION);
    }
    return provenance.toString();
  }

  private static boolean isSupportedArtifactVersion(String artifactJson) {
    try {
      JsonNode node = MAPPER.readTree(artifactJson);
      return node.path("version").isIntegralNumber()
          && node.path("version").intValue() == CompilePins.SUPPORTED_ARTIFACT_VERSION;
    } catch (JsonProcessingException e) {
      return false;
    }
  }

  private void settleError(
      CompileExecutor.Settlement settlement, UUID testId, CompileRequest request, String code) {
    if (!settlement.claim()) {
      dropLateResult(testId, request, code);
      return;
    }
    publishError(testId, request, code);
  }

  private void publishError(UUID testId, CompileRequest request, CompileErrorCode code) {
    publishError(testId, request, code.name());
  }

  private void publishError(UUID testId, CompileRequest request, String code) {
    ObjectNode error = MAPPER.createObjectNode();
    // The bounded, scrubbed code and nothing else: no prompt, no response body, no source text.
    error.put("code", code);
    compileStateService.publishError(testId, request, error.toString());
  }

  /**
   * An abandoned attempt finished anyway. Nothing is published — not even a conditional publish
   * that would have matched its own guard.
   */
  private static void dropLateResult(UUID testId, CompileRequest request, String stage) {
    LOGGER.info(
        "studio.compile.late_result_dropped testId={} compileRequestId={} stage={}",
        testId,
        request.requestId(),
        stage);
  }
}
