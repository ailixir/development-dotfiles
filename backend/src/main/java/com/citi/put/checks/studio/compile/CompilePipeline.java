package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.GatewayResponseParser.ProposalRejection;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.compile.incremental.CompilationPlanner;
import com.citi.put.checks.studio.compile.incremental.IncrementalAssembler;
import com.citi.put.checks.studio.compile.validator.RunnerDiagnostic;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Asynchronous compile orchestration: begin, prompt, gateway, parse, assemble, validate, publish
 * (Story 10.8, AC-2 to AC-20).
 *
 * <p>When the gateway client {@linkplain LlmGatewayClient#returnsProposalEnvelope() declares} a
 * proposal envelope, the executable artifact is assembled here from the ordered source and the
 * model's per-step {@code code} before the version gate and {@code /v1/validate} (VAL-006). An
 * {@code UNSUPPORTED} or {@code CLARIFICATION} entry ends the request as {@code NEEDS_REVISION}
 * with the model's reasons, without a validator call or a repair.
 *
 * <h2>The draft is committed before any compile work begins</h2>
 *
 * <p>{@link #compile} is called from the request thread <em>after</em> the draft transaction has
 * committed, and only from the compile route. Saving a draft no longer starts a compile: the Run
 * action compiles the saved revision and then executes it, so the expensive work is asked for
 * explicitly and its progress is visible to the author who asked. No gateway call, no runner call
 * and no outbound HTTP of any kind happens inside the request thread or inside a database
 * transaction, which is what makes a gateway outage a compile failure rather than a lost draft.
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
 * repair is published through the same state-machine gate as a first-attempt candidate. An explicit
 * v1 compile is the Run action's preparation (ADR-002 §35): {@code beginCompile} stores its compile
 * request with the server-stamped {@code trigger = RUN}, and {@code publishAcceptedCandidate}
 * accepts the validated revision for the requesting principal and publishes {@code READY} with
 * {@code confirmation_source = RUN}, in one transaction. A compile whose request is not {@code RUN}
 * for that principal publishes {@code AWAITING_CONFIRMATION}. Invalid or failed attempts never take
 * either path.
 *
 * <p>The settlement is re-checked between <em>every</em> pair of calls in the loop, not only once
 * per request: the budget now covers the whole request including its repairs, so an expiry can land
 * between attempt 2's validator call and attempt 3's gateway call, and a late result from an
 * abandoned repair is dropped in process without calling any publish method.
 *
 * <p>A gateway or validator failure on a repair call ends the loop with that code and does not
 * silently consume a further attempt. Only an {@code ok: false} verdict — a 200 with a verdict, not
 * a transport failure — or an envelope the strict parser rejected (VAL-019b) spends one. A parser
 * rejection that exhausts the bound ends {@code STALE GATEWAY_PARSE_FAILURE}.
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
   * <p>The route is the trigger (ADR-002 §35.3): the compile request is stored with {@code trigger
   * = RUN}, the FULL plan, the compilation fingerprint and a {@code deadline_at} from the
   * request-owned budget. A candidate that passes validation is then accepted for the requesting
   * principal and published {@code READY} in one transaction, recorded as a Run confirmation
   * without prior review ({@code confirmation_source = RUN}). The author asked for this revision to
   * be prepared by pressing Run, so a second confirmation step would ask the same question twice.
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
    ContextCompileInputs contextInputs = ContextCompileInputs.from(draft);

    authoringLimits.requireWithinLimits(inputs.orderedSource());
    credentialScreen.requireNoInlineCredentials(inputs.orderedSource());

    // Story 10.49: the request row (trigger = RUN, FULL plan, fingerprint, deadline_at from the
    // request-owned budget) is written in beginCompile's transaction. No prompt byte depends on it.
    CompileRequest request =
        compileStateService.beginCompile(
            testId,
            inputs,
            compilationFingerprint(gatewayClient.compilationSettings(), runtimePin),
            properties.pipeline().attemptBudget());
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
      String lastRejectedProposal = null;
      // Set when the previous attempt's envelope was rejected by the strict parser (VAL-019b): the
      // next repair carries only the fixed instruction and this closed code, never model text.
      ProposalRejection lastEnvelopeRejection = null;
      Integer lastEnvelopeRejectStep = null;
      com.citi.put.checks.studio.compile.gateway.CompileRequest firstPrompt = null;

      for (int attempt = 1; attempt <= maxAttempts; attempt++) {
        if (settlement.isSettled()) {
          // The budget expired between attempts. Stop before spending a gateway call on a result
          // that can no longer be published.
          dropLateResult(inputs.testId(), request, "repair");
          return;
        }

        // A repair is built from the first attempt's request, so its kind and writable step IDs
        // are frozen: it carries the rejected proposal and the diagnostics, never a wider write
        // set (Story 10.45, FR-10, spec §3.2.6 "Repair").
        com.citi.put.checks.studio.compile.gateway.CompileRequest prompt;
        if (attempt == 1) {
          prompt = assemblePrompt(inputs, contextInputs, request.requestId());
        } else if (lastEnvelopeRejection != null) {
          prompt =
              repairPromptAssembler.assembleAfterRejectedEnvelope(
                  firstPrompt, attempt, lastEnvelopeRejection, lastEnvelopeRejectStep);
        } else {
          prompt =
              repairPromptAssembler.assemble(
                  firstPrompt, attempt, lastDiagnostics, lastRejectedProposal);
        }
        if (attempt == 1) {
          firstPrompt = prompt;
        }

        if (!aggregate.canStart()) {
          settleError(
              settlement,
              inputs.testId(),
              request,
              CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
          return;
        }

        // The request-owned budget, not a fresh per-call one (VAL-007 / C0 §5): each call is capped
        // at min(request-timeout, remaining), and the executor's deadline timer cancels the live
        // transport through this same object, so an expired call releases its gateway permit.
        CompileResponse response;
        try {
          response = gatewayClient.propose(prompt, settlement.budget());
        } catch (CancellationException expired) {
          // The budget expired before the call started. The deadline timer settles the request.
          dropLateResult(inputs.testId(), request, "gateway");
          return;
        }
        if (!aggregate.charge(response)) {
          settleError(
              settlement,
              inputs.testId(),
              request,
              CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
          return;
        }
        if (!response.isOk()) {
          if (response.rejection() != null) {
            logRejectedAttempt(request, attempt, response.rejection(), response.rejectStepIndex());
          }
          if (response.isRepairableRejection() && attempt < maxAttempts) {
            // VAL-019b (C0 §4): an envelope the strict parser rejected is model variance, so it
            // consumes one repair from the same shared bound. Exhaustion falls through below to
            // STALE GATEWAY_PARSE_FAILURE (user decision D1, 2026-10-04), not NEEDS_REVISION.
            lastEnvelopeRejection = response.rejection();
            lastEnvelopeRejectStep = response.rejectStepIndex();
            lastDiagnostics = null;
            lastRejectedProposal = null;
            continue;
          }
          // Every other refusal ends the whole request — on a repair exactly as on the first
          // attempt. It does not silently consume a further attempt and then try again: the
          // condition is a bound firing (GATEWAY_BUSY, a timeout, a transport failure) or a
          // terminal model answer (an unusable finish reason), and spending the remaining repair
          // budget on it would turn one refusal into three.
          settleError(settlement, inputs.testId(), request, response.errorCode().name());
          return;
        }
        lastEnvelopeRejection = null;
        lastEnvelopeRejectStep = null;

        // A client that declares a proposal envelope returns {stepId,status,code} per writable
        // step, never an artifact. The server assembles the artifact from the ordered source
        // (VAL-006): the model supplies only `code`, so `stepIndex` and `originalText` cannot
        // drift. Always against the first attempt's IDs — a repair's write set is frozen.
        String proposalJson = response.artifactJson();
        String artifactJson = proposalJson;
        if (gatewayClient.returnsProposalEnvelope()) {
          IncrementalAssembler.Result assembled;
          List<CompilationPlanner.Step> steps =
              proposalSteps(firstPrompt.writableStepIds(), inputs.orderedSource());
          CompilationPlanner.Plan plan =
              CompilationPlanner.plan(steps, true, false, false, false, null, null);
          try {
            assembled = IncrementalAssembler.assemble(steps, plan, null, proposalJson);
          } catch (IllegalArgumentException malformed) {
            // Terminal, unlike a parser rejection: ends the request, spends no repair.
            logRejectedAttempt(request, attempt, ProposalRejection.ASSEMBLY_FAILED, null);
            settleError(
                settlement,
                inputs.testId(),
                request,
                GatewayErrorCode.GATEWAY_PARSE_FAILURE.name());
            return;
          }
          if (!assembled.executable()) {
            // Output contract rule 5: one UNSUPPORTED or CLARIFICATION entry blocks publication.
            // The model has said it cannot express the step, so neither the validator nor a
            // repair can change the answer — terminal NEEDS_REVISION with its own reasons.
            if (!settlement.claim()) {
              dropLateResult(inputs.testId(), request, "invalid");
              return;
            }
            compileStateService.publishInvalid(
                inputs.testId(),
                request,
                diagnosticsBounder.bound(
                    rejectionOutcome(steps, assembled.rejections()), stepCount, attempt, false));
            return;
          }
          artifactJson = assembled.artifactJson();
        }
        if (!isSupportedArtifactVersion(artifactJson)) {
          // Schema validity is not executability, and a repair goes back through this gate rather
          // than around it: a schema-valid `version: 2` document returned by attempt 3 is rejected
          // exactly as it is on attempt 1, is never written as a candidate revision, and is never
          // sent to /v1/validate.
          logRejectedAttempt(request, attempt, ProposalRejection.ARTIFACT_VERSION, null);
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
                contextInputs == null ? null : contextInputs.referencePolicy());

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
          CandidateRevision candidate =
              candidate(
                  inputs, contextInputs, request, artifactJson, response.provenance(), validation);
          compileStateService.publishAcceptedCandidate(inputs.testId(), request, candidate);
          return;
        }

        // A verdict, not a transport failure: `ok: false` is still a 200. Bound the diagnostics
        // now, because they are both what a repair is given to work from and what is persisted if
        // this turns out to be the last attempt — one bounding path, so the byte cap stays true.
        lastDiagnostics =
            diagnosticsBounder.bound(validation, stepCount, attempt, attempt >= maxAttempts);
        // The repair asks for a corrected proposal of the same kind, so it carries what the
        // model returned (the envelope, when the client declares one), not the assembled artifact.
        lastRejectedProposal = proposalJson;
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

  /**
   * The compilation fingerprint: one canonical hash over everything that changes what a compile
   * would generate (Story 10.45, AC 2 and 6; spec &sect;3.2.6 "Fingerprint", C0 &sect;6).
   *
   * <p>Inputs: the gateway's nonsecret settings (model, {@code maxOutputTokens} and the effective
   * {@code thinkingLevel}, which is {@code PROVIDER_DEFAULT} when {@code thinkingConfig} is
   * switched off), {@code PROMPT_VERSION}, the syntax-reference version, the validator/runtime
   * pins, {@code VersionedIntentDeriver.CURRENT_VERSION} and {@code
   * StepReferencePolicyDeriver.POLICY_VERSION}. The gateway settings are canonicalized, so their
   * key order does not matter.
   *
   * <p>Deliberately <b>not</b> an input:
   *
   * <ul>
   *   <li>The {@code provider-features.system-instruction} fallback. Spec &sect;3.2.6 lists the
   *       inputs and does not name it, and its "Degradation" clause gives only the thinking
   *       fallback a fingerprint record. The fallback moves the identical static bytes, in the same
   *       static-first order, from {@code systemInstruction} to the head of {@code contents[0]}.
   *   <li>The writable-anchor switch. The spec names it, but it only exists once INCREMENTAL does
   *       (Story B2), which adds it here.
   * </ul>
   *
   * @param gatewaySettings {@link LlmGatewayClient#compilationSettings()}
   * @param pin the configured runtime pin
   * @return 64 lowercase hex characters
   */
  static String compilationFingerprint(String gatewaySettings, RuntimePinProperties pin) {
    return compilationFingerprint(
        gatewaySettings,
        pin,
        CompilePins.PROMPT_VERSION,
        CompilePins.SYNTAX_REFERENCE_VERSION,
        VersionedIntentDeriver.CURRENT_VERSION,
        StepReferencePolicyDeriver.POLICY_VERSION);
  }

  /**
   * The fingerprint with the code-pinned versions passed explicitly, so each named input can be
   * shown to change the result on its own ({@code CompileFingerprintTest}).
   */
  static String compilationFingerprint(
      String gatewaySettings,
      RuntimePinProperties pin,
      String promptVersion,
      String syntaxReferenceVersion,
      String intentDerivationVersion,
      int referencePolicyVersion) {
    ObjectNode identity = MAPPER.createObjectNode();
    try {
      identity.set(
          "gateway",
          gatewaySettings == null ? MAPPER.createObjectNode() : MAPPER.readTree(gatewaySettings));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("Invalid gateway compilation settings", e);
    }
    identity.put("promptVersion", promptVersion);
    identity.put("syntaxReferenceVersion", syntaxReferenceVersion);
    identity.put("artifactSchemaVersion", pin.artifactSchemaVersion());
    identity.put("configuredSyntaxReferenceVersion", pin.syntaxReferenceVersion());
    identity.put("validatorSchemaVersion", pin.validatorSchemaVersion());
    identity.put("executorVersion", pin.executorVersion());
    identity.put("playwrightVersion", pin.playwrightVersion());
    identity.put("intentDerivationVersion", intentDerivationVersion);
    identity.put("referencePolicyVersion", referencePolicyVersion);
    return ArtifactCanonicalizer.hash(identity.toString());
  }

  private com.citi.put.checks.studio.compile.gateway.CompileRequest assemblePrompt(
      CompileInputs inputs, ContextCompileInputs contextInputs, UUID requestId) {
    if (contextInputs == null) {
      return promptAssembler.assemble(
          inputs.testId(),
          inputs.csiId(),
          inputs.principal(),
          requestId,
          1,
          inputs.orderedSource());
    }
    return promptAssembler.assemble(
        inputs.testId(),
        inputs.csiId(),
        inputs.principal(),
        requestId,
        1,
        inputs.orderedSource(),
        contextInputs.promptSection());
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
        contextInputsForCandidate == null ? null : contextInputsForCandidate.referencePolicy(),
        contextInputsForCandidate == null ? null : VersionedIntentDeriver.CURRENT_VERSION);
  }

  private String provenance(
      GatewayProvenance gateway, ValidationOutcome validation, boolean versionedReferencePolicy) {
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
    if (versionedReferencePolicy) {
      provenance.put("intentDerivationVersion", VersionedIntentDeriver.CURRENT_VERSION);
    }
    putGenerationUsage(provenance, gateway);
    return provenance.toString();
  }

  /**
   * Records the accepted proposal's actual generation settings and vendor usage (Story 10.45, AC 4;
   * spec &sect;3.2.6 "Usage").
   *
   * <p>Every count is copied as reported. A count the vendor did not report is stored as JSON
   * {@code null}, never {@code 0}, and {@code usageAvailable} is {@code false} whenever the core
   * counts are missing. {@code cachedContentTokenCount} is recorded for observation only and is not
   * evidence of a caching saving (NFR-2). Every proposal, including a rejected one, is also on the
   * gateway audit line; the revision carries the proposal that produced it.
   */
  static void putGenerationUsage(ObjectNode provenance, GatewayProvenance gateway) {
    provenance.put("maxOutputTokens", gateway == null ? null : gateway.maxOutputTokens());
    provenance.put("thinkingLevel", gateway == null ? null : gateway.thinkingLevel());
    ObjectNode usage = provenance.putObject("usage");
    usage.put("promptTokenCount", gateway == null ? null : gateway.inputTokens());
    usage.put("candidatesTokenCount", gateway == null ? null : gateway.outputTokens());
    usage.put("thoughtsTokenCount", gateway == null ? null : gateway.thoughtsTokens());
    usage.put("cachedContentTokenCount", gateway == null ? null : gateway.cachedContentTokens());
    usage.put("totalTokenCount", gateway == null ? null : gateway.totalTokens());
    usage.put("finishReason", gateway == null ? null : gateway.finishReason());
    usage.put("usageAvailable", gateway != null && gateway.usageAvailable());
  }

  /** Pairs each writable step ID with its source line, in order (FULL mode: one per line). */
  private static List<CompilationPlanner.Step> proposalSteps(
      List<UUID> writableStepIds, List<String> orderedSource) {
    List<CompilationPlanner.Step> steps = new ArrayList<>(writableStepIds.size());
    for (int index = 0; index < writableStepIds.size(); index++) {
      String text = index < orderedSource.size() ? orderedSource.get(index) : null;
      steps.add(new CompilationPlanner.Step(writableStepIds.get(index), text == null ? "" : text));
    }
    return steps;
  }

  /** The model's per-step UNSUPPORTED/CLARIFICATION reasons, as a rejected verdict. */
  private ValidationOutcome rejectionOutcome(
      List<CompilationPlanner.Step> steps, List<IncrementalAssembler.Rejection> rejections) {
    List<UUID> ids = steps.stream().map(CompilationPlanner.Step::id).toList();
    List<ValidationOutcome.StepVerdict> verdicts = new ArrayList<>(rejections.size());
    for (IncrementalAssembler.Rejection rejection : rejections) {
      int stepIndex = ids.indexOf(rejection.stepId());
      verdicts.add(
          new ValidationOutcome.StepVerdict(
              stepIndex,
              false,
              List.of(
                  new RunnerDiagnostic(
                      rejection.reason(), stepIndex, rejection.message(), null, null))));
    }
    return ValidationOutcome.verdict(
        false, runtimePin.validatorSchemaVersion(), List.of(), verdicts);
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
   * One WARN line per rejected attempt (VAL-019a): the closed reason and 0-based step position
   * only. The response's reason string can quote the model's output, so it is never logged.
   */
  private static void logRejectedAttempt(
      CompileRequest request, int attempt, ProposalRejection reason, Integer stepIndex) {
    LOGGER.warn(
        "studio.compile.attempt_rejected compileRequestId={} attempt={} reason={} stepIndex={}",
        request.requestId(),
        attempt,
        reason,
        stepIndex);
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
