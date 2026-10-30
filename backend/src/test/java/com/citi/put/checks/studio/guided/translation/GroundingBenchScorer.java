package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;
import java.util.regex.Pattern;

/**
 * SPK-07 grounding benchmark scorer (workstream D). Replays one model reply through the production
 * admission rules of {@link GuidedTranslationService} without a database, a runner or a session
 * store. No production class is changed and none is re-implemented: the validators are called as
 * the service calls them, in the service's order. Whatever the service takes from session state is
 * rebuilt from the context object that was sent to the model; each rebuilt piece is listed below.
 *
 * <p><b>SOURCE_PLAN</b> (service: {@code learnPlan}/{@code learnSuffix} apply callbacks): the reply
 * schema and size ({@link GuidedResponseParser} rules), {@link GuidedProposalValidator#admitPlan},
 * {@link GuidedSourceInputResolver#validate}, {@link GuidedDependencyPlanner#validate}, {@link
 * GuidedProposalValidator#sourceSelections}, then the two checks {@code
 * GuidedTranslationStore.acceptPlan} runs on every plan ({@code
 * GuidedAcceptedPlan.validateBeforeAllocation} and the private {@code sourceCoordinates}, called by
 * reflection).
 *
 * <p><b>NEXT_ACTION</b> is not scored here any more (ADR-SC-007): this scorer replayed the replies
 * of the old arms through the equality target-intent gate and the locator join, both deleted. The
 * grounding gates of the snapshot-ref design have their own verdict vectors
 * (GuidedGateVectorsTest).
 *
 * <p>Output {@code stage} is the stage that refused; for an ADMITTED line it is the last stage
 * passed ({@code admitPlan}, or {@code parse} for CLARIFICATION and UNSUPPORTED replies). Refusal
 * stages: {@code parse} and {@code admitPlan}. {@code detail} names the exact call.
 *
 * <p><b>Rebuilt from the context</b>: session ({@code sessionId}, {@code scopeHash}, {@code
 * sourceSteps}, scope revisions; capabilities and {@code maxStatementsPerStep=8} are the production
 * values of {@code GuidedProductionSessionAccess} and {@code GuidedSessionProperties}); manifest
 * ({@code sourceSteps} with the classifier's approved regions, {@code configurationReferences});
 * progress ({@code observation}, {@code executionEvidence}, document and generation from the
 * evidence, step index from {@code coordinate}); plan ({@code obligations}, {@code needs}); the
 * runner context ({@code authoredInputs}, {@code contextRevision}, {@code authoredInputsHash}).
 * Authority fields (plan revision, fence, evidence hash, expected context revision) are set equal
 * on both sides, so those authority checks pass by construction.
 *
 * <p><b>Not reconstructible, therefore not scored</b> (documented in the report): configuration
 * values (a placeholder is used unless the input line carries {@code configurationValues}), secret
 * tokens (the prompt blanks them), accepted observed clarifications, the question objects of
 * CLARIFICATION replies, {@code mergeSuffix} and plan-history audit.
 */
final class GroundingBenchScorer {
  /** Production scope capabilities, copied from {@code GuidedProductionSessionAccess.resolve}. */
  static final List<String> CAPABILITIES =
      List.of(
          "observe",
          "navigate",
          "click",
          "fill",
          "press",
          "check",
          "uncheck",
          "hover",
          "selectOption",
          "read",
          "assert");

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Pattern TOKEN = Pattern.compile("<(var|secret)\\s+([A-Za-z0-9_.-]{1,64})>");
  private static final String PLACEHOLDER_URL = "https://spk07-placeholder.example/";
  private static final String PLACEHOLDER_TEXT = "spk07-placeholder";

  private final GuidedContracts contracts = new GuidedContracts();
  private final GuidedProposalValidator validator = new GuidedProposalValidator(contracts);
  // Production default is allow-all (application.yml); the domain list is deployment configuration.
  private final GuidedSourceInputResolver inputs =
      new GuidedSourceInputResolver(contracts, new AllowedDomains(List.of(), true));
  private final GuidedDependencyPlanner dependencies = new GuidedDependencyPlanner(null);

  /** Marks a scorer defect (bad input shape); never confused with a model refusal. */
  static final class ScorerError extends RuntimeException {
    ScorerError(String message, Throwable cause) {
      super(message, cause);
    }
  }

  private static final class Progress {
    String stage = "parse";
    String detail;
    String note;
  }

  ObjectNode score(JsonNode line) {
    ObjectNode out = contracts.object();
    out.put("key", line.path("key").asText());
    Progress progress = new Progress();
    try {
      String kind = line.path("kind").asText();
      JsonNode context = line.path("context"), reply = line.path("reply");
      String code;
      if (kind.equals("SOURCE_PLAN")) {
        code = sourcePlan(context, reply, line.path("configurationValues"), progress);
      } else {
        throw new ScorerError("unknown kind " + kind, null);
      }
      out.put("verdict", "ADMITTED");
      if (code == null) {
        out.putNull("code");
      } else {
        out.put("code", code);
      }
      out.put("stage", progress.stage);
    } catch (GuidedSessionException refusal) {
      boolean policy = refusal.getMessage().equals("POLICY_DENIED");
      GuidedPolicyReason reason = policy ? GuidedPolicyReason.of(refusal.messageCode()) : null;
      out.put("verdict", "REFUSED");
      out.put("code", reason != null ? reason.name() : refusal.getMessage());
      out.put("stage", progress.stage);
      if (!progress.stage.equals("modelUnsupported")) {
        // The throwing validation and its caller (class, method, line only); WI-1 cause analysis.
        out.put("check", GuidedRejectionDiagnostics.check(refusal));
      }
      if (reason != null) {
        progress.detail = (progress.detail == null ? "" : progress.detail + " ") + "POLICY_DENIED";
      }
    } catch (Exception defect) {
      out.put("verdict", "REFUSED");
      out.put("code", "SCORER_ERROR");
      out.put("stage", progress.stage);
      Throwable cause =
          defect instanceof ScorerError && defect.getCause() != null ? defect.getCause() : defect;
      progress.detail =
          defect.getMessage() == null
              ? cause.getClass().getSimpleName()
              : defect.getMessage() + " (" + cause.getClass().getSimpleName() + ")";
    }
    if (progress.detail != null) {
      out.put("detail", progress.detail);
    }
    if (progress.note != null) {
      out.put("note", progress.note);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // SOURCE_PLAN
  // ---------------------------------------------------------------------------------------------

  private String sourcePlan(
      JsonNode context, JsonNode reply, JsonNode configurationValues, Progress progress)
      throws Exception {
    progress.stage = "parse";
    JsonNode response = parse(reply, "SOURCE_PLAN");
    ObjectNode session = session(context);
    ObjectNode manifest = manifest(context, configurationValues, true);
    JsonNode window = context.hasNonNull("learningWindow") ? context.path("learningWindow") : null;
    if (response.has("question")) {
      // The service builds a clarification here; the question object is not validated.
      return "CLARIFICATION";
    }
    if (response.path("status").asText().equals("UNSUPPORTED")) {
      // The model's own closed refusal: the service fails the session with MISSING_SOURCE when
      // the reason is MISSING_SOURCE, otherwise UNSUPPORTED_STEP (GuidedTranslationService).
      progress.stage = "modelUnsupported";
      progress.detail = "MODEL_UNSUPPORTED";
      throw new GuidedSessionException(
          response.path("reasonCode").asText().equals("MISSING_SOURCE")
              ? "MISSING_SOURCE"
              : "UNSUPPORTED_STEP",
          409);
    }
    progress.stage = "admitPlan";
    progress.detail = "GuidedProposalValidator.admitPlan";
    ObjectNode admitted =
        validator.admitPlan(session, response, window, manifest.path("sourceSteps"));
    progress.detail = "GuidedSourceInputResolver.validate";
    inputs.validate(session, manifest, admitted.path("sourceReferences"));
    progress.detail = "GuidedDependencyPlanner.validate";
    dependencies.validate(session, admitted);
    progress.detail = "GuidedProposalValidator.sourceSelections";
    validator.sourceSelections(session, admitted, context.path("clarificationSelections"));
    progress.detail = "GuidedAcceptedPlan.validateBeforeAllocation";
    GuidedAcceptedPlan.validateBeforeAllocation(contracts, admitted);
    progress.detail = "GuidedTranslationStore.sourceCoordinates";
    invokeSourceCoordinates(manifest, admitted);
    progress.detail = null;
    return null;
  }

  private static void invokeSourceCoordinates(JsonNode manifest, JsonNode plan) throws Exception {
    Method method =
        GuidedTranslationStore.class.getDeclaredMethod(
            "sourceCoordinates", JsonNode.class, JsonNode.class);
    method.setAccessible(true);
    try {
      method.invoke(null, manifest, plan);
    } catch (InvocationTargetException failure) {
      if (failure.getCause() instanceof RuntimeException runtime) {
        throw runtime;
      }
      throw failure;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // shared reconstruction
  // ---------------------------------------------------------------------------------------------

  /** {@link GuidedResponseParser#parse} rules: size, canonical wire, strict schema, kind. */
  private JsonNode parse(JsonNode reply, String kind) throws Exception {
    byte[] bytes = MAPPER.writeValueAsBytes(reply);
    require(bytes.length <= 65536, "INVALID_CONTRACT", 422);
    JsonNode result = contracts.parseWire(bytes);
    contracts.validate("v3/guided-model-response", result);
    require(result.path("kind").asText().equals(kind), "INVALID_CONTRACT", 422);
    return result;
  }

  private ObjectNode session(JsonNode context) {
    ObjectNode session = contracts.object();
    session.set("sessionId", context.path("sessionId"));
    session.set("scopeHash", context.path("scopeHash"));
    ArrayNode steps = session.putArray("sourceSteps");
    for (JsonNode step : context.path("sourceSteps")) {
      steps.addObject().put("stepId", step.path("stepId").asText());
    }
    session.putObject("limits").put("maxStatementsPerStep", 8);
    ObjectNode scope = session.putObject("scope");
    scope.set("sourceRevision", context.path("sourceRevision"));
    scope.set("configurationRevision", context.path("configurationRevision"));
    CAPABILITIES.forEach(scope.putArray("capabilities")::add);
    session.putObject("owner").put("workerId", "spk07-scorer").put("fence", 1);
    return session;
  }

  /**
   * The classifier's manifest shape. Regions are {@code GuidedSourceClassifier}'s: the text outside
   * {@code <var NAME>} and {@code <secret NAME>} tokens. With {@code placeholders} a configuration
   * value is invented for plain references (the grounding guard must not see invented values).
   */
  private ObjectNode manifest(JsonNode context, JsonNode suppliedValues, boolean placeholders) {
    ObjectNode manifest = contracts.object();
    manifest.set("sourceRevision", context.path("sourceRevision"));
    manifest.set("configurationRevision", context.path("configurationRevision"));
    ArrayNode steps = manifest.putArray("sourceSteps");
    for (JsonNode step : context.path("sourceSteps")) {
      String text = step.path("text").asText();
      ObjectNode item = steps.addObject().put("stepId", step.path("stepId").asText());
      item.put("text", text);
      ArrayNode regions = item.putArray("regions");
      var token = TOKEN.matcher(text);
      int previous = 0;
      while (token.find()) {
        if (previous < token.start()) {
          regions.addObject().put("startUtf16", previous).put("endUtf16", token.start());
        }
        previous = token.end();
      }
      if (previous < text.length()) {
        regions.addObject().put("startUtf16", previous).put("endUtf16", text.length());
      }
    }
    manifest.set("configurationReferences", context.path("configurationReferences"));
    ObjectNode values = manifest.putObject("configurationValues");
    for (JsonNode reference : context.path("configurationReferences")) {
      ObjectNode config = ((ObjectNode) reference).deepCopy();
      String id = reference.path("referenceId").asText();
      if (!reference.path("kind").asText().equals("secretRef")) {
        JsonNode supplied = suppliedValues.path(id);
        if (supplied.isTextual()) {
          config.put("value", supplied.asText());
        } else if (placeholders) {
          config.put(
              "value",
              reference.path("kind").asText().equals("destination")
                  ? PLACEHOLDER_URL
                  : PLACEHOLDER_TEXT);
        } else {
          continue;
        }
      }
      values.set(id, config);
    }
    return manifest;
  }
}
