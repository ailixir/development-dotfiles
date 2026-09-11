package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
      RuntimePinProperties runtimePin) {
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

    authoringLimits.requireWithinLimits(inputs.orderedSource());
    credentialScreen.requireNoInlineCredentials(inputs.orderedSource());

    CompileRequest request = compileStateService.beginCompile(testId);

    boolean started =
        executor.submit(
            settlement -> runAttempt(inputs, request, settlement),
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
      LOGGER.warn("studio.compile.enqueue_failed testId={} reason={}", testId, e.toString());
    }
  }

  // ── the attempt ────────────────────────────────────────────────────────────

  private void runAttempt(
      CompileInputs inputs, CompileRequest request, CompileExecutor.Settlement settlement) {
    try {
      com.citi.put.checks.studio.compile.gateway.CompileRequest prompt =
          promptAssembler.assemble(
              inputs.testId(),
              inputs.csiId(),
              inputs.principal(),
              request.requestId(),
              1,
              inputs.orderedSource());

      // Exactly one call per compile attempt. Repair attempts are 10.9's; this story issues none.
      CompileResponse response = gatewayClient.propose(prompt);
      if (!response.isOk()) {
        settleError(settlement, inputs.testId(), request, response.errorCode().name());
        return;
      }

      String artifactJson = response.artifactJson();
      if (!isSupportedArtifactVersion(artifactJson)) {
        // Schema validity is not executability. A schema-valid `version: 2` document is rejected
        // here, is never written as a candidate revision, and is never sent to /v1/validate.
        settleError(
            settlement, inputs.testId(), request, GatewayErrorCode.GATEWAY_PARSE_FAILURE.name());
        return;
      }

      ValidationOutcome validation =
          validationClient.validate(
              artifactJson, inputs.orderedSource(), inputs.variableNames(), inputs.secretNames());

      if (!validation.available()) {
        settleError(
            settlement, inputs.testId(), request, CompileErrorCode.VALIDATOR_UNAVAILABLE.name());
        return;
      }

      if (!validation.ok()) {
        // A verdict, not a transport failure: `ok: false` is still a 200. NEEDS_REVISION, no
        // compile_error and no retry.
        if (!settlement.claim()) {
          dropLateResult(inputs.testId(), request, "invalid");
          return;
        }
        compileStateService.publishInvalid(
            inputs.testId(),
            request,
            diagnosticsBounder.bound(validation, inputs.orderedSource().size()));
        return;
      }

      if (!settlement.claim()) {
        dropLateResult(inputs.testId(), request, "candidate");
        return;
      }
      compileStateService.publishCandidate(
          inputs.testId(),
          request,
          candidate(inputs, request, artifactJson, response.provenance(), validation));
    } catch (RuntimeException e) {
      LOGGER.warn(
          "studio.compile.internal_error testId={} reason={}", inputs.testId(), e.toString());
      settleError(
          settlement, inputs.testId(), request, CompileErrorCode.COMPILE_INTERNAL_ERROR.name());
    }
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
        provenance(gatewayProvenance, validation),
        inputs.principal());
  }

  private String provenance(GatewayProvenance gateway, ValidationOutcome validation) {
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
