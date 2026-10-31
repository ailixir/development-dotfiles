package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The public presentation of one guided session: {@code progress} (session view and result) and
 * {@code explanation} (result) (STUDIO-OBS-008 P2, P3).
 *
 * <p>One implementation is shared by {@link GuidedSessionService} and the receipt-backed result
 * projector, so the two builders cannot drift. It is read-only: it runs under the caller's session
 * lock and performs no write, no browser, model, Vault or network call, and it never reads the
 * current head of the test. A failed or conflicted run is explained from this session's own facts.
 *
 * <p><b>Progress</b> comes from the frozen {@code sourceSteps} order and the durable {@code
 * progress.stepIndex} only. It is never clamped and never inferred from counters or time. The
 * active step is {@code null} while finalizing, in every terminal state, and whenever the
 * coordinate or its authored sentence is unavailable.
 *
 * <p><b>Explanation</b> claims only what retained facts prove: per action its coordinates and
 * outcome, and {@code referenceIds}, the opaque identifiers a step captures or uses. No code,
 * locator, URL, page text, model output, document, context body or resolved value is read into the
 * output, so none can leak into it.
 */
public final class GuidedPublicPresentationProjector {

  private static final Set<String> TERMINAL =
      Set.of(
          "SUCCEEDED", "PUBLICATION_CONFLICT", "FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED");

  /** The shape the public contract gives a step id (and a revision id). */
  private static final java.util.regex.Pattern UUID_SHAPE =
      java.util.regex.Pattern.compile(
          "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$");

  /** A revision as the public contract states it: a decimal string, as a real start validates. */
  private static final java.util.regex.Pattern REVISION =
      java.util.regex.Pattern.compile("^(0|[1-9][0-9]{0,18})$");

  private static final int MAX_STEPS = 100;
  private static final int MAX_TEXT = 4000;

  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedPublicPresentationProjector(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = java.util.Objects.requireNonNull(jdbc);
    this.contracts = contracts;
  }

  private GuidedPublicPresentationProjector(GuidedContracts contracts) {
    this.jdbc = null;
    this.contracts = contracts;
  }

  /**
   * The projector of a service composed without durable facts to read (hand-built services). {@link
   * #progress} states the frozen step count and no active sentence; {@link #explanation} refuses
   * with {@code RUNTIME_INCOMPATIBLE}, because an unwired projection must fail the result contract
   * rather than satisfy it. The production composition installs the full projector.
   */
  public static GuidedPublicPresentationProjector withoutFacts(GuidedContracts contracts) {
    return new GuidedPublicPresentationProjector(contracts);
  }

  // ── P2: progress ─────────────────────────────────────────────────────────

  /** {@code PublicProgress} for a locked session. */
  public ObjectNode progress(GuidedSessionRepository.Session session) {
    JsonNode document = session.document();
    JsonNode steps = document.path("sourceSteps");
    ObjectNode out = contracts.object().put("stepCount", steps.size());
    ObjectNode active = activeStep(session);
    if (active == null) {
      out.putNull("activeStep");
    } else {
      out.set("activeStep", active);
    }
    return out;
  }

  private ObjectNode activeStep(GuidedSessionRepository.Session session) {
    JsonNode document = session.document();
    String state = document.path("state").asText();
    JsonNode steps = document.path("sourceSteps");
    if (jdbc == null
        || state.equals("FINALIZING")
        || TERMINAL.contains(state)
        || steps.size() > MAX_STEPS) {
      return null;
    }
    JsonNode stored = session.progress().path("stepIndex");
    int index = stored.isMissingNode() ? 0 : stored.isInt() ? stored.asInt() : -1;
    if (index < 0 || index >= steps.size()) {
      return null;
    }
    String stepId = steps.get(index).path("stepId").asText();
    if (!UUID_SHAPE.matcher(stepId).matches()) {
      return null;
    }
    JsonNode question = session.progress().path("clarification");
    if (state.equals("AWAITING_CLARIFICATION") && question.isObject()) {
      // The public question and the active coordinate are one fact; a disagreement is corruption.
      GuidedSessionException.require(
          question.path("coordinate").path("stepId").asText().equals(stepId),
          "INVALID_CONTRACT",
          422);
    }
    String text = authoredText(document.path("sessionId").asText(), stepId);
    if (text == null || text.isEmpty() || text.length() > MAX_TEXT) {
      return null;
    }
    return contracts.object().put("stepId", stepId).put("number", index + 1).put("text", text);
  }

  /** The authored sentence of this session's immutable source manifest, or null if it has none. */
  private String authoredText(String sessionId, String stepId) {
    List<String> manifests =
        jdbc.queryForList(
            "SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?",
            String.class,
            sessionId);
    if (manifests.isEmpty()) {
      return null;
    }
    for (JsonNode step : contracts.parse(manifests.getFirst()).path("sourceSteps")) {
      if (step.path("stepId").asText().equals(stepId) && step.path("text").isTextual()) {
        return step.path("text").asText();
      }
    }
    return null;
  }

  // ── P3: explanation ──────────────────────────────────────────────────────

  /** {@code PublicExplanation} for a locked session, whatever its outcome. */
  public ObjectNode explanation(GuidedSessionRepository.Session session) {
    JsonNode document = session.document();
    String id = document.path("sessionId").asText();
    JsonNode sourceSteps = document.path("sourceSteps");
    List<String> stepIds = new ArrayList<>();
    sourceSteps.forEach(step -> stepIds.add(step.path("stepId").asText()));
    // A real start validates decimal revisions and uses the authoring step UUIDs, and the limit is
    // 100 steps. A session outside that cannot be described by this contract, and the field cannot
    // be omitted: it is an integrity refusal, never a placeholder and never an empty list.
    String source = document.path("scope").path("sourceRevision").asText();
    String configuration = document.path("scope").path("configurationRevision").asText();
    GuidedSessionException.require(
        jdbc != null, "RUNTIME_INCOMPATIBLE", 409); // no facts: a composition fault
    GuidedSessionException.require(
        REVISION.matcher(source).matches()
            && REVISION.matcher(configuration).matches()
            && stepIds.size() <= MAX_STEPS
            && stepIds.stream().allMatch(step -> UUID_SHAPE.matcher(step).matches()),
        "INVALID_CONTRACT",
        422);
    ObjectNode out = contracts.object();
    out.put("sessionId", id);
    out.put("sourceRevision", source);
    out.put("configurationRevision", configuration);
    ArrayNode steps = out.putArray("steps");
    ArrayNode flows = out.putArray("referenceFlows");
    Map<String, Integer> position = new HashMap<>();
    for (int at = 0; at < stepIds.size(); at++) {
      position.put(stepIds.get(at), at);
    }

    List<Fact> facts = facts(id, position);
    Window window = window(id, stepIds.size());
    JsonNode stored = session.progress().path("stepIndex");
    int verified = stored.isInt() ? stored.asInt() : 0;
    var incremental = new GuidedIncrementalStore(jdbc, contracts);

    for (int at = 0; at < stepIds.size(); at++) {
      String stepId = stepIds.get(at);
      List<Fact> mine = new ArrayList<>();
      for (Fact fact : facts) {
        if (fact.stepIndex == at) {
          mine.add(fact);
        }
      }
      boolean completed = at < verified && effectivelySucceeded(id, mine, incremental);
      ObjectNode step = steps.addObject();
      step.put("stepId", stepId).put("number", at + 1).put("completed", completed);
      step.put("learnedFromThisRun", completed && at >= window.learningStart);
      if (completed && window.base != null && at < window.learningStart) {
        step.putObject("reusedFrom").put("revisionId", window.base).put("stepId", stepId);
      } else {
        step.putNull("reusedFrom");
      }
      step.put(
          "relearnedAfterDrift",
          completed && window.drift && at >= window.learningStart && at < window.initialIndex);
      ArrayNode actions = step.putArray("actions");
      for (Fact fact : mine) {
        ObjectNode action = actions.addObject();
        action
            .put("admissionId", fact.admissionId)
            .put("ordinal", fact.ordinal)
            .put("attemptOrdinal", fact.attemptOrdinal)
            .put("outcome", fact.state);
        ArrayNode references = action.putArray("referenceIds");
        fact.referenceIds.forEach(references::add);
      }
    }
    flows(id, position, flows);
    return out;
  }

  /** A step is complete only when it has actions and every effective one succeeded. */
  private boolean effectivelySucceeded(
      String id, List<Fact> mine, GuidedIncrementalStore incremental) {
    int effective = 0;
    for (Fact fact : mine) {
      if (incremental.excluded(id, fact.document)) {
        continue;
      }
      effective++;
      if (!fact.state.equals("SUCCEEDED")) {
        return false;
      }
    }
    return effective > 0;
  }

  /** One recorded action: coordinates and the closed facts the output may carry. */
  private static final class Fact {
    int stepIndex;
    int ordinal;
    int attemptOrdinal;
    String admissionId;
    String state;
    ObjectNode document;
    Set<String> referenceIds = new TreeSet<>();
  }

  private List<Fact> facts(String id, Map<String, Integer> position) {
    List<Fact> facts = new ArrayList<>();
    jdbc.query(
        "SELECT step_id,ordinal,attempt_ordinal,document::text,proposal::text FROM"
            + " studio_guided_actions WHERE session_id=?",
        rs -> {
          Integer at = position.get(rs.getString(1));
          if (at == null) {
            return;
          }
          ObjectNode document = (ObjectNode) contracts.parse(rs.getString(4));
          JsonNode operation = contracts.parse(rs.getString(5)).path("operation");
          Fact fact = new Fact();
          fact.stepIndex = at;
          fact.ordinal = rs.getInt(2);
          fact.attemptOrdinal = rs.getInt(3);
          fact.admissionId = document.path("admission").path("admissionId").asText();
          fact.state = document.path("state").asText();
          fact.document = document;
          for (JsonNode captured : operation.path("captures")) {
            addId(fact.referenceIds, captured);
          }
          for (JsonNode use : operation.path("uses")) {
            addId(fact.referenceIds, use.path("id"));
          }
          facts.add(fact);
        },
        id);
    facts.sort(
        java.util.Comparator.<Fact>comparingInt(f -> f.stepIndex)
            .thenComparingInt(f -> f.ordinal)
            .thenComparingInt(f -> f.attemptOrdinal));
    return facts;
  }

  private static void addId(Set<String> into, JsonNode id) {
    if (id.isTextual() && !id.asText().isEmpty()) {
      into.add(id.asText());
    }
  }

  /** The 015 learning window, from this session's own frozen plan and switch rows. */
  private record Window(String base, int learningStart, int initialIndex, boolean drift) {}

  private Window window(String id, int stepCount) {
    var plans =
        jdbc.queryForList(
            "SELECT base_revision_id::text AS base,initial_step_index AS initial FROM"
                + " studio_guided_relearn_plans WHERE session_id=?",
            id);
    if (plans.isEmpty()) {
      // An ordinary session learns every step it completes.
      return new Window(null, 0, 0, false);
    }
    String base = (String) plans.getFirst().get("base");
    int initial = ((Number) plans.getFirst().get("initial")).intValue();
    var switches =
        jdbc.queryForList(
            "SELECT reason,effective_step_index AS effective FROM studio_guided_relearn_switches"
                + " WHERE session_id=?",
            id);
    if (switches.isEmpty()) {
      // The prefix replay has not been proven complete: nothing is claimed as learned or reused.
      return new Window(null, stepCount, initial, false);
    }
    var row = switches.getFirst();
    return new Window(
        base,
        ((Number) row.get("effective")).intValue(),
        initial,
        "DRIFT".equals(row.get("reason")));
  }

  /** Actual produced bindings joined to the executed consumers that used them; no invented edge. */
  private void flows(String id, Map<String, Integer> position, ArrayNode into) {
    record Flow(int producer, int consumer, String binding, String producerId, String consumerId) {}
    Set<Flow> seen = new LinkedHashSet<>();
    jdbc.query(
        "SELECT e.binding_id,p.step_id,c.step_id FROM"
            + " studio_guided_consumer_edges e JOIN studio_guided_actions p ON"
            + " p.session_id=e.session_id AND p.admission_id=e.producer_admission_id JOIN"
            + " studio_guided_actions c ON c.session_id=e.session_id AND"
            + " c.admission_id=e.consumer_admission_id WHERE e.session_id=? AND"
            + " p.document->>'state'='SUCCEEDED' AND c.document->>'state'='SUCCEEDED'",
        rs -> {
          Integer producer = position.get(rs.getString(2)),
              consumer = position.get(rs.getString(3));
          if (producer != null && consumer != null) {
            seen.add(
                new Flow(producer, consumer, rs.getString(1), rs.getString(2), rs.getString(3)));
          }
        },
        id);
    seen.stream()
        .sorted(
            java.util.Comparator.comparingInt(Flow::producer)
                .thenComparingInt(Flow::consumer)
                .thenComparing(Flow::binding))
        .forEach(
            flow ->
                into.addObject()
                    .put("bindingId", flow.binding())
                    .put("producerStepId", flow.producerId())
                    .put("consumerStepId", flow.consumerId()));
  }
}
