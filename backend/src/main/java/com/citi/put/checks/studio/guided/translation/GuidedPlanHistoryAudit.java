package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedIncrementalStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.HashSet;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * ARCH015-02: audit actual immutable old/first/later plan rows; never pretend they are wire facts.
 */
public final class GuidedPlanHistoryAudit {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final GuidedIncrementalStore incremental;

  public GuidedPlanHistoryAudit(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.incremental = new GuidedIncrementalStore(jdbc, contracts);
  }

  public void transition(JsonNode session, JsonNode previous, JsonNode next, boolean firstSuffix) {
    // Initial SOURCE_PLAN acceptance precedes materialization/allocation. Audit those original
    // rows without inventing binding IDs; later allocated rows retain the same server meanings.
    GuidedAcceptedPlan.validateBeforeAllocation(contracts, next);
    if (previous.isNull() || previous.isMissingNode()) {
      require(
          !firstSuffix || incremental.initialIndex(session.path("sessionId").asText()) == 0,
          "EVIDENCE_MISMATCH",
          422);
      return;
    }
    preserveReferencePrefix(previous.path("sourceReferences"), next.path("sourceReferences"));
    if (!firstSuffix) {
      monotonic(previous, next);
      return;
    }
    String id = session.path("sessionId").asText();
    require(
        incremental.initialIndex(id) > 0 && previous.equals(incremental.prefixPlan(session)),
        "EVIDENCE_MISMATCH",
        422);
    JsonNode transition =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT jsonb_build_object('reason',reason,"
                    + "'stepId',effective_step_id,'index',effective_step_index,'ordinal',next_ordinal)::text"
                    + " FROM studio_guided_relearn_switches WHERE session_id=?",
                String.class,
                id));
    Set<String> retained = new HashSet<>();
    incremental.retainedAdmissions(id).forEach(admission -> retained.add(admission.asText()));
    for (JsonNode old : previous.path("obligations")) {
      var rows =
          jdbc.queryForList(
              "SELECT a.document::text FROM studio_guided_obligation_admissions o"
                  + " JOIN studio_guided_actions a ON a.session_id=o.session_id AND a.admission_id=o.admission_id"
                  + " WHERE o.session_id=? AND o.obligation_id=?",
              String.class,
              id,
              old.path("obligationId").asText());
      boolean successful =
          !rows.isEmpty()
              && contracts.parse(rows.getFirst()).path("state").asText().equals("SUCCEEDED");
      if (successful) {
        JsonNode ledger = contracts.parse(rows.getFirst());
        require(
            retained.contains(ledger.path("admission").path("admissionId").asText())
                && contains(next.path("obligations"), old),
            "EVIDENCE_MISMATCH",
            422);
      } else if (!contains(next.path("obligations"), old)) {
        require(
            transition.path("reason").asText().equals("DRIFT")
                && after(
                    session,
                    old.path("stepId").asText(),
                    old.path("occurrence").asInt(),
                    transition),
            "EVIDENCE_MISMATCH",
            422);
        if (!rows.isEmpty()) {
          require(
              incremental.excluded(id, contracts.parse(rows.getFirst())), "EVIDENCE_MISMATCH", 422);
        }
      }
    }
    for (JsonNode old : previous.path("needs")) {
      JsonNode current = find(next.path("needs"), "needId", old.path("needId").asText());
      String binding = old.path("bindingId").asText();
      var producerRows =
          jdbc.queryForList(
              "SELECT document::text FROM studio_guided_producers WHERE session_id=? AND binding_id=?",
              String.class,
              id,
              binding);
      boolean retainedProducer =
          !producerRows.isEmpty()
              && retained.contains(
                  contracts.parse(producerRows.getFirst()).path("producerAdmissionId").asText());
      if (!retainedProducer) {
        require(
            current == null
                && producerRows.isEmpty()
                && transition.path("reason").asText().equals("DRIFT")
                && importedReadAfter(session, binding, transition),
            "EVIDENCE_MISMATCH",
            422);
        continue;
      }
      require(current != null && sameNeedIdentity(old, current), "EVIDENCE_MISMATCH", 422);
      Set<String> actual = retainedPairs(id, binding, retained);
      Set<String> finalPairs = pairs(current.path("consumers"));
      require(finalPairs.containsAll(actual), "EVIDENCE_MISMATCH", 422);
      for (JsonNode oldConsumer : old.path("consumers")) {
        if (!finalPairs.contains(pair(oldConsumer))) {
          require(
              !actual.contains(pair(oldConsumer))
                  && transition.path("reason").asText().equals("DRIFT")
                  && importedConsumerAfter(session, binding, oldConsumer, transition),
              "EVIDENCE_MISMATCH",
              422);
        }
      }
    }
  }

  public void audit(String id) {
    JsonNode session =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id));
    var acceptance =
        jdbc.queryForList(
            "SELECT previous_plan_revision,plan_revision FROM studio_guided_suffix_acceptances WHERE session_id=?",
            id);
    long first =
        acceptance.isEmpty()
            ? -1
            : ((Number) acceptance.getFirst().get("plan_revision")).longValue();
    long previousFirst =
        acceptance.isEmpty()
            ? -1
            : ((Number) acceptance.getFirst().get("previous_plan_revision")).longValue();
    require(!incremental.hasBase(id) || first > 0, "EVIDENCE_MISMATCH", 422);
    var rows =
        jdbc.queryForList(
            "SELECT plan_revision,parent_revision,plan::text,plan_hash FROM studio_guided_translation_plans"
                + " WHERE session_id=? ORDER BY plan_revision",
            id);
    JsonNode previous = contracts.object().nullNode();
    long revision = 0;
    boolean seenFirst = false;
    for (var row : rows) {
      long nextRevision = ((Number) row.get("plan_revision")).longValue();
      long parent = ((Number) row.get("parent_revision")).longValue();
      JsonNode next = contracts.parse((String) row.get("plan"));
      require(
          parent == revision
              && nextRevision == Math.addExact(revision, 1)
              && GuidedContracts.hash(next).equals(row.get("plan_hash")),
          "EVIDENCE_MISMATCH",
          422);
      boolean firstSuffix = nextRevision == first;
      if (firstSuffix) {
        require(parent == previousFirst && !seenFirst, "EVIDENCE_MISMATCH", 422);
        seenFirst = true;
      }
      transition(session, previous, next, firstSuffix);
      revision = nextRevision;
      previous = next;
    }
    Long head =
        jdbc.queryForObject(
            "SELECT plan_revision FROM studio_guided_translation_state WHERE session_id=?",
            Long.class,
            id);
    require(head != null && head == revision && (first < 0 || seenFirst), "EVIDENCE_MISMATCH", 422);
    // Publication reads require an allocated current head, even though earlier immutable rows
    // legitimately record the unbound bootstrap intent.
    GuidedAcceptedPlan.validate(contracts, previous);
  }

  private void monotonic(JsonNode previous, JsonNode next) {
    for (JsonNode old : previous.path("obligations")) {
      require(contains(next.path("obligations"), old), "IDEMPOTENCY_CONFLICT", 409);
    }
    for (JsonNode old : previous.path("needs")) {
      JsonNode current = find(next.path("needs"), "needId", old.path("needId").asText());
      require(current != null && sameNeedIdentity(old, current), "BINDING_ORDER", 422);
      for (JsonNode consumer : old.path("consumers")) {
        require(contains(current.path("consumers"), consumer), "BINDING_ORDER", 422);
      }
    }
  }

  private boolean importedReadAfter(JsonNode session, String binding, JsonNode transition) {
    for (JsonNode action :
        incremental.program(session.path("sessionId").asText()).path("actions")) {
      if (contains(action.path("operation").path("captures"), TextNode.valueOf(binding))) {
        return after(
            session,
            action.path("coordinate").path("stepId").asText(),
            action.path("coordinate").path("ordinal").asInt(),
            transition);
      }
    }
    return false;
  }

  private boolean importedConsumerAfter(
      JsonNode session, String binding, JsonNode consumer, JsonNode transition) {
    for (JsonNode action :
        incremental.program(session.path("sessionId").asText()).path("actions")) {
      JsonNode operation = action.path("operation");
      if (action.path("coordinate").path("stepId").equals(consumer.path("stepId"))
          && operationUses(operation, binding)
          && after(
              session,
              action.path("coordinate").path("stepId").asText(),
              action.path("coordinate").path("ordinal").asInt(),
              transition)) {
        return true;
      }
    }
    return false;
  }

  private static boolean operationUses(JsonNode operation, String binding) {
    for (JsonNode use : operation.path("uses")) {
      if (use.path("kind").asText().equals("binding") && use.path("id").asText().equals(binding)) {
        return true;
      }
    }
    return false;
  }

  private Set<String> retainedPairs(String id, String binding, Set<String> retained) {
    Set<String> result = new HashSet<>();
    for (String document :
        jdbc.queryForList(
            "SELECT document::text FROM studio_guided_consumer_edges WHERE session_id=? AND binding_id=?",
            String.class,
            id,
            binding)) {
      JsonNode edge = contracts.parse(document);
      if (retained.contains(edge.path("consumerAdmissionId").asText())) {
        result.add(edge.path("coordinate").path("stepId").asText());
      }
    }
    return result;
  }

  private static boolean after(JsonNode session, String step, int ordinal, JsonNode transition) {
    int index = GuidedIncrementalStore.stepIndex(session, step),
        boundary = transition.path("index").asInt();
    return index > boundary || index == boundary && ordinal >= transition.path("ordinal").asInt();
  }

  private static boolean sameNeedIdentity(JsonNode old, JsonNode current) {
    ObjectNode left = old.deepCopy(), right = current.deepCopy();
    left.remove("consumers");
    right.remove("consumers");
    if (!old.has("bindingId")) {
      right.remove("bindingId");
    }
    return left.equals(right);
  }

  private static void preserveReferencePrefix(JsonNode old, JsonNode next) {
    require(next.isArray() && old.size() <= next.size(), "REFERENCE_MISMATCH", 422);
    for (int at = 0; at < old.size(); at++) {
      require(old.get(at).equals(next.get(at)), "REFERENCE_MISMATCH", 422);
    }
  }

  private static JsonNode find(JsonNode array, String field, String value) {
    JsonNode found = null;
    for (JsonNode item : array) {
      if (item.path(field).asText().equals(value)) {
        require(found == null, "INVALID_CONTRACT", 422);
        found = item;
      }
    }
    return found;
  }

  private static boolean contains(JsonNode array, JsonNode value) {
    for (JsonNode item : array) {
      if (item.equals(value)) {
        return true;
      }
    }
    return false;
  }

  private static Set<String> pairs(JsonNode array) {
    Set<String> result = new HashSet<>();
    for (JsonNode pair : array) {
      require(result.add(pair(pair)), "BINDING_ORDER", 422);
    }
    return result;
  }

  private static String pair(JsonNode pair) {
    return pair.path("stepId").asText();
  }
}
