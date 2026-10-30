package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;

/** Backend-only eligibility reconstructed from immutable original action and observation rows. */
public final class GuidedPressInheritance {
  private GuidedPressInheritance() {}

  public static boolean bare(JsonNode manifest, JsonNode proposal) {
    if (!proposal.path("operation").path("kind").asText().equals("press")) {
      return false;
    }
    String authored = authored(manifest, proposal.path("coordinate").path("stepId").asText());
    String key = proposal.path("operation").path("key").asText();
    return authored
        .strip()
        .matches(
            "(?i)press\\s+(?:the\\s+)?" + java.util.regex.Pattern.quote(key) + "(?:\\s+key)?[.!]?");
  }

  public static ArrayNode history(JdbcTemplate jdbc, GuidedContracts contracts, String id) {
    ArrayNode history = contracts.object().putArray("history");
    jdbc.query(
        "SELECT a.document::text,a.proposal::text,p.proof::text,o.observation::text"
            + " FROM studio_guided_actions a LEFT JOIN studio_guided_preparations p"
            + " ON p.session_id=a.session_id AND p.preparation_id=a.document->>'preparationId'"
            + " LEFT JOIN studio_guided_publication_observations o ON o.session_id=a.session_id"
            + " AND o.observation_hash=a.proposal->'executionEvidence'->>'observationHash'"
            + " WHERE a.session_id=? ORDER BY a.step_id,a.ordinal,a.attempt_ordinal",
        rs -> {
          ObjectNode row = history.addObject();
          row.set("ledger", contracts.parse(rs.getString(1)));
          row.set("proposal", contracts.parse(rs.getString(2)));
          row.set("proof", contracts.parse(rs.getString(3)));
          row.set(
              "observation",
              rs.getString(4) == null ? NullNode.instance : contracts.parse(rs.getString(4)));
        },
        id);
    return history;
  }

  public static JsonNode derive(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      String id,
      JsonNode manifest,
      JsonNode plan,
      JsonNode proposal,
      JsonNode observation,
      JsonNode context) {
    return derive(
        contracts, manifest, plan, proposal, observation, context, history(jdbc, contracts, id));
  }

  /** No matching predecessor is ordinary guard refusal, never an alternate predecessor search. */
  public static JsonNode derive(
      GuidedContracts contracts,
      JsonNode manifest,
      JsonNode plan,
      JsonNode proposal,
      JsonNode observation,
      JsonNode context,
      JsonNode history) {
    if (!bare(manifest, proposal)
        || !proposal.path("target").path("kind").asText().equals("node")) {
      return NullNode.instance;
    }
    String current = proposal.path("coordinate").path("stepId").asText();
    String previous = previousStep(manifest, current);
    if (previous == null) {
      return NullNode.instance;
    }
    JsonNode priorObligation = onlyObligation(plan, previous),
        currentObligation = onlyObligation(plan, current);
    if (priorObligation == null
        || currentObligation == null
        || !Set.of("fill", "click", "check")
            .contains(priorObligation.path("operationKind").asText())
        || !currentObligation.path("operationKind").asText().equals("press")
        || !currentObligation.path("targetIntent").equals(priorObligation.path("targetIntent"))) {
      return NullNode.instance;
    }
    JsonNode prior = null;
    int currentCount = 0;
    for (JsonNode row : history) {
      if (row.path("ledger").path("coordinate").path("stepId").asText().equals(current)) {
        if (++currentCount > 1
            || !row.path("ledger").path("state").asText().equals("SUCCEEDED")
            || !row.path("proposal").equals(proposal)) {
          return NullNode.instance;
        }
      }
      String step = row.path("ledger").path("coordinate").path("stepId").asText();
      if (!step.equals(previous)) {
        continue;
      }
      if (prior != null) {
        return NullNode.instance;
      }
      prior = row;
    }
    if (prior == null) {
      return NullNode.instance;
    }
    JsonNode ledger = prior.path("ledger"),
        oldProposal = prior.path("proposal"),
        proof = prior.path("proof");
    if (!ledger.path("state").asText().equals("SUCCEEDED")
        || ledger.path("dispatchCount").asInt(-1) != 1
        || !ledger.path("outcomeCode").asText().equals("OK")
        || ledger.path("attemptOrdinal").asInt(-1) != 0
        || !proof.path("pressInheritance").isNull()
        || !oldProposal.path("target").path("kind").asText().equals("node")
        || !oldProposal.path("operation").path("kind").equals(priorObligation.path("operationKind"))
        || oldProposal.path("operation").path("value").path("kind").asText().equals("secretRef")) {
      return NullNode.instance;
    }
    if (!oldProposal.path("coordinate").equals(ledger.path("coordinate"))
        || !proof.path("requestDigest").asText().equals(GuidedContracts.hash(oldProposal))
        || !ledger.path("requestDigest").equals(proof.path("requestDigest"))
        || !ledger
            .path("operationHash")
            .asText()
            .equals(
                com.citi.put.checks.studio.guided.session.GuidedOperationIdentity.of(
                    oldProposal, proof.path("target")))) {
      return NullNode.instance;
    }
    for (String field :
        List.of(
            "contextId",
            "contextRevision",
            "authoredInputsHash",
            "workerId",
            "ownerFence",
            "sourceRevision",
            "configurationRevision",
            "scopeHash")) {
      if (!GuidedContracts.same(proof.path(field), context.path(field))) {
        return NullNode.instance;
      }
    }
    if (!oldProposal
            .path("target")
            .path("documentId")
            .equals(proposal.path("target").path("documentId"))
        || !oldProposal
            .path("executionEvidence")
            .path("origin")
            .equals(proposal.path("executionEvidence").path("origin"))) {
      return NullNode.instance;
    }
    JsonNode oldFacts = prior.path("observation").path("facts"), facts = observation.path("facts");
    JsonNode oldFact = oldFacts.path(oldProposal.path("target").path("ref").asText());
    JsonNode fact = facts.path(proposal.path("target").path("ref").asText());
    if (!oldFact.isObject()
        || !fact.isObject()
        || !oldFact.path("nameComplete").asBoolean(false)
        || !oldFact.path("ownTextComplete").asBoolean(false)
        || GuidedActionGuard.ownText(oldFact) == null
        || GuidedActionGuard.ownText(fact) == null) {
      return NullNode.instance;
    }
    com.citi.put.checks.studio.guided.session.GuidedPreparationCrossCheck.verify(
        oldProposal, proof, prior.path("observation"));
    GuidedGates.requireCoherentOrdinals(oldFacts);
    GuidedGates.requireCoherentOrdinals(facts);
    if (!sameElementSelection(
            GuidedGates.selectionOf(oldFacts, oldFact), GuidedGates.selectionOf(facts, fact))
        || !matchingRefs(facts, GuidedGates.selectionOf(oldFacts, oldFact))
            .equals(List.of(proposal.path("target").path("ref").asText()))) {
      return NullNode.instance;
    }
    if (!GuidedGates.scopeSatisfied(priorObligation, oldFacts, oldFact)
        || !GuidedGates.scopeSatisfied(currentObligation, facts, fact)
        || !GuidedGates.intent(
                priorObligation.path("operationKind").asText(),
                priorObligation.path("targetIntent").asText(),
                GuidedGates.of(oldFact))
            .passed()
        || !GuidedGates.intent(
                "press", currentObligation.path("targetIntent").asText(), GuidedGates.of(fact))
            .passed()
        || GuidedGates.operationTarget(
                priorObligation.path("operationKind").asText(), GuidedGates.of(oldFact))
            != null
        || GuidedActionGuard.grounding(oldFact, sources(manifest, previous)) == null
        || GuidedActionGuard.evaluate(
                priorObligation.path("operationKind").asText(),
                "prior",
                oldFact,
                authored(manifest, previous),
                saved(manifest, previous))
            .refused()
        || !fact.path("nameComplete").asBoolean(false)
        || !fact.path("ownTextComplete").asBoolean(false)) {
      return NullNode.instance;
    }
    for (String verb : GuidedActionGuard.destructiveTerms(fact)) {
      if (sources(manifest, current).stream()
          .noneMatch(source -> GuidedActionGuard.containsPhrase(source, verb))) {
        return NullNode.instance;
      }
    }
    ObjectNode result =
        contracts
            .object()
            .put("kind", "same-element-press")
            .put("predecessorAdmissionId", ledger.path("admission").path("admissionId").asText())
            .put("predecessorRequestDigest", ledger.path("requestDigest").asText())
            .put("predecessorOperationHash", ledger.path("operationHash").asText())
            .put("documentId", proposal.path("target").path("documentId").asText());
    result.set("predecessorCoordinate", ledger.path("coordinate").deepCopy());
    return result;
  }

  public static JsonNode prefix(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      String id,
      JsonNode manifest,
      JsonNode plan,
      JsonNode action,
      JsonNode observation,
      JsonNode context) {
    ArrayNode history = history(jdbc, contracts, id);
    String previous = previousStep(manifest, action.path("coordinate").path("stepId").asText());
    if (previous == null || !action.path("operation").path("kind").asText().equals("press")) {
      return NullNode.instance;
    }
    for (JsonNode prior : history) {
      if (!prior.path("ledger").path("coordinate").path("stepId").asText().equals(previous)) {
        continue;
      }
      JsonNode oldFacts = prior.path("observation").path("facts");
      JsonNode oldFact = oldFacts.path(prior.path("proposal").path("target").path("ref").asText());
      List<String> refs =
          matchingRefs(observation.path("facts"), GuidedGates.selectionOf(oldFacts, oldFact));
      if (refs.size() != 1) {
        return NullNode.instance;
      }
      ObjectNode proposal = contracts.object();
      proposal.set("coordinate", action.path("coordinate"));
      proposal.set("operation", action.path("operation"));
      proposal
          .putObject("target")
          .put("kind", "node")
          .put("ref", refs.getFirst())
          .set("documentId", observation.path("documentId"));
      proposal.putObject("executionEvidence").set("origin", observation.path("origin"));
      return derive(contracts, manifest, plan, proposal, observation, context, history);
    }
    return NullNode.instance;
  }

  /**
   * The roles one native text-entry input can take: a site script may turn a search box into a
   * combobox once it is used.
   */
  private static final Set<String> TEXT_ENTRY_ROLES = Set.of("textbox", "searchbox", "combobox");

  /**
   * Equality of two selections for the same-element press: role, name, evidence, ordinal and scope
   * all equal, except that two text-entry roles are one role. The runner still proves it is the
   * same DOM node when it prepares the press.
   */
  public static boolean sameElementSelection(
      GuidedGates.Selection first, GuidedGates.Selection second) {
    return entryRole(first).equals(entryRole(second));
  }

  private static GuidedGates.Selection entryRole(GuidedGates.Selection selection) {
    return TEXT_ENTRY_ROLES.contains(selection.role())
        ? new GuidedGates.Selection(
            "text-entry",
            selection.name(),
            selection.evidence(),
            selection.ordinal(),
            selection.scopeHash())
        : selection;
  }

  /** Every ref whose fact has the selection, with text-entry roles read as one role. */
  static List<String> matchingRefs(JsonNode facts, GuidedGates.Selection selection) {
    List<String> refs = new ArrayList<>();
    if (facts == null || !facts.isObject()) {
      return refs;
    }
    GuidedGates.requireCoherentOrdinals(facts);
    facts
        .fields()
        .forEachRemaining(
            entry -> {
              if (sameElementSelection(
                  GuidedGates.selectionOf(facts, entry.getValue()), selection)) {
                refs.add(entry.getKey());
              }
            });
    return refs;
  }

  public static String previousStep(JsonNode manifest, String current) {
    String prior = null;
    for (JsonNode step : manifest.path("sourceSteps")) {
      if (step.path("stepId").asText().equals(current)) {
        return prior;
      }
      prior = step.path("stepId").asText();
    }
    return null;
  }

  public static JsonNode onlyObligation(JsonNode plan, String step) {
    JsonNode result = null;
    for (JsonNode obligation : plan.path("obligations")) {
      if (obligation.path("stepId").asText().equals(step)) {
        if (result != null) {
          return null;
        }
        result = obligation;
      }
    }
    return result;
  }

  public static String authored(JsonNode manifest, String stepId) {
    for (JsonNode step : manifest.path("sourceSteps")) {
      if (step.path("stepId").asText().equals(stepId)) {
        return step.path("text").asText();
      }
    }
    return "";
  }

  public static List<String> saved(JsonNode manifest, String stepId) {
    List<String> result = new ArrayList<>();
    for (JsonNode value : manifest.path("configurationValues")) {
      if (value.path("stepId").asText().equals(stepId)
          && !value.path("kind").asText().equals("secretRef")
          && value.path("value").isTextual()) {
        result.add(value.path("value").asText());
      }
    }
    return List.copyOf(result);
  }

  public static List<String> sources(JsonNode manifest, String stepId) {
    List<String> result = new ArrayList<>();
    result.add(authored(manifest, stepId));
    result.addAll(saved(manifest, stepId));
    return List.copyOf(result);
  }
}
