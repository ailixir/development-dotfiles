package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Gate;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;

/**
 * A pure, database-free harness around the real {@link GuidedProposalValidator} and the real
 * contract schemas: one session, one step, one observation, one obligation. The pure gate tests
 * (read recipe, clarification selection) use it to run the same code paths the translation service
 * runs, so a gate cannot be satisfied by a test double.
 */
final class ActionHarness {
  static final GuidedContracts C = new GuidedContracts();
  static final String STEP_ID = "00000000-0000-4000-8000-000000000001";

  final GuidedProposalValidator validator = new GuidedProposalValidator(C);
  final ObjectNode session = C.object();
  final ObjectNode progress = C.object();
  final ObjectNode context = C.object();
  final ObjectNode attempt = C.object();
  final ObjectNode plan = C.object();
  final ObjectNode obligation = C.object();
  final List<Gate> gates = new ArrayList<>();
  final List<GuidedGates.IntentPath> intentPaths = new ArrayList<>();
  final GuidedRefusalDiagnostics.Capture capture =
      new GuidedRefusalDiagnostics.Capture() {
        @Override
        public void record(Gate gate) {
          gates.add(gate);
        }

        @Override
        public void intent(GuidedGates.IntentPath path, List<String> fields) {
          intentPaths.add(path);
        }
      };

  ActionHarness(ObjectNode observation, String operationKind, String targetIntent) {
    session.put("sessionId", ObservationFixtures.SESSION_ID);
    session.put("scopeHash", ObservationFixtures.SCOPE_HASH);
    session.putObject("scope").put("csi", "synthetic");
    session.putObject("owner").put("workerId", "worker-1").put("fence", 1);
    session.putArray("sourceSteps").addObject().put("stepId", STEP_ID);
    progress.put("documentId", observation.path("documentId").asText());
    progress.set("generation", observation.path("generation"));
    progress.put("stepIndex", 0);
    progress.put("evidenceHash", "b".repeat(64));
    progress
        .putObject("executionEvidence")
        .put("kind", "observedDocument")
        .put("sessionId", ObservationFixtures.SESSION_ID)
        .put("contextId", "context-1")
        .put("documentId", observation.path("documentId").asText())
        .put("origin", ObservationFixtures.ORIGIN)
        .put("observationHash", "d".repeat(64))
        .set("generation", observation.path("generation"));
    progress.set("observation", observation);
    context.put("contextRevision", 1).put("authoredInputsHash", "c".repeat(64));
    context.putObject("authoredInputs").putArray("inputs");
    attempt.put("planRevision", 1);
    attempt.put("expectedContextRevision", 1).put("expectedAuthoredInputsHash", "c".repeat(64));
    for (String key : List.of("scope", "scopeHash", "owner")) {
      attempt.set(key, session.path(key));
    }
    for (String key : List.of("documentId", "generation", "stepIndex", "executionEvidence")) {
      attempt.set(key, progress.path(key));
    }
    plan.putArray("sourceReferences");
    plan.putArray("needs");
    obligation
        .put("obligationId", "obligation-1")
        .put("stepId", STEP_ID)
        .put("occurrence", 0)
        .put("operationKind", operationKind)
        .putNull("referenceIndex")
        .putNull("needId")
        .putNull("predicate");
    if (targetIntent == null) {
      obligation.putNull("targetIntent");
    } else {
      obligation.put("targetIntent", targetIntent);
    }
  }

  /** The selection a model reply names: a node ref and an operation. */
  static ObjectNode selection(String ref, ObjectNode operation) {
    ObjectNode selection = C.object();
    selection.set("target", ObservationFixtures.nodeRef(ref));
    selection.set("operation", operation);
    return selection;
  }

  ObjectNode materialize(ObjectNode selection) {
    return validator.materializeAction(
        session, progress, obligation, selection, context, attempt, 1, capture);
  }

  void action(JsonNode proposal) {
    validator.action(session, progress, plan, obligation, proposal, context, null, capture);
  }

  /** Runs materialize + action and returns the refusal, or null when both pass. */
  GuidedSessionException refusal(ObjectNode selection) {
    gates.clear();
    intentPaths.clear();
    try {
      action(materialize(selection));
      return null;
    } catch (GuidedSessionException refusal) {
      return refusal;
    }
  }

  /** The last gate the run recorded (the gate that refused, for a refused run). */
  Gate lastGate() {
    return gates.isEmpty() ? null : gates.get(gates.size() - 1);
  }
}
