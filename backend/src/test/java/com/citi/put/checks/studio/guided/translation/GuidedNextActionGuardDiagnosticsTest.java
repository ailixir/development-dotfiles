package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Capture;
import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Gate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.InvocationTargetException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** Public synthetic inputs only; invokes the actual validator and extracted private callback. */
class GuidedNextActionGuardDiagnosticsTest {
  private static void ignore(GuidedRefusalDiagnostics.Receipt receipt) {}

  static final GuidedContracts C = new GuidedContracts();
  static final List<Gate> SERVICE =
      List.of(
          Gate.NEXT_QUESTION_CALL,
          Gate.NEXT_PLAN_ACCESS_CALL,
          Gate.NEXT_SOURCE_SELECTION_CALL,
          Gate.NEXT_OBLIGATION_LOOKUP_CALL,
          Gate.NEXT_ASSOCIATION_LOOKUP_CALL,
          Gate.NEXT_RUNNER_CONTEXT_CALL,
          Gate.NEXT_MATERIALIZE_CALL,
          Gate.NEXT_EFFECTIVE_CHOICE_CALL,
          Gate.NEXT_VALIDATE_ACTION_CALL,
          Gate.NEXT_POLICY_CALL,
          Gate.NEXT_RESERVATION_CALL);
  static final List<Gate> VALIDATOR =
      List.of(
          Gate.NEXT_ORIGINAL_AUTHORITY,
          Gate.NEXT_CURRENT_AUTHORED_STEP,
          Gate.NEXT_SELECTION_SHAPE,
          Gate.NEXT_MATERIALIZE_CONTRACT_CALL,
          Gate.NEXT_ACTION_CONTRACT_CALL,
          Gate.NEXT_ACTION_MEANING,
          Gate.NEXT_ACTION_EVIDENCE,
          Gate.NEXT_TARGET_REF,
          Gate.NEXT_TARGET_INTENT,
          Gate.NEXT_SELECTED_CHOICE,
          Gate.NEXT_OPERATION_TARGET,
          Gate.NEXT_READ_RULE,
          Gate.NEXT_AUTHORED_SOURCE,
          Gate.NEXT_SECRET_POLICY,
          Gate.NEXT_BINDING_MEANING,
          Gate.NEXT_ASSERTION_PREDICATE,
          Gate.NEXT_ASSERT_TEXT_ABSENT);

  @TestFactory
  Stream<DynamicTest> everyRealSeamFailsAndSucceeds() {
    return Stream.concat(SERVICE.stream(), VALIDATOR.stream())
        .flatMap(
            gate ->
                Stream.of(
                    DynamicTest.dynamicTest(
                        gate + "_PROPAGATING_FAILURE",
                        () -> {
                          if (SERVICE.contains(gate)) {
                            ServiceFixture f = new ServiceFixture();
                            if (gate == Gate.NEXT_QUESTION_CALL) {
                              f.question();
                            }
                            f.fail(gate);
                            GuidedSessionException thrown =
                                assertThrows(
                                    GuidedSessionException.class, () -> f.apply(f.gates::add));
                            if (gate == Gate.NEXT_POLICY_CALL) {
                              assertEquals("POLICY_DENIED", thrown.getMessage());
                              assertEquals("UNGROUNDED_TARGET", thrown.messageCode());
                            } else {
                              assertSame(f.sentinel, thrown);
                            }
                            assertEquals(
                                gate == Gate.NEXT_EFFECTIVE_CHOICE_CALL
                                    ? List.of(gate, Gate.NEXT_VALIDATE_ACTION_CALL)
                                    : List.of(gate),
                                f.gates);
                          } else {
                            ValidatorFixture f = new ValidatorFixture(gate);
                            f.fail(gate);
                            GuidedSessionException actual =
                                assertThrows(
                                    GuidedSessionException.class, () -> f.run(gate, f.gates::add));
                            assertEquals(List.of(gate), f.gates);
                            if (f.contractFailure) {
                              assertSame(f.sentinel, actual);
                            } else {
                              ValidatorFixture baseline = new ValidatorFixture(gate);
                              baseline.fail(gate);
                              var old =
                                  assertThrows(
                                      GuidedSessionException.class,
                                      () -> baseline.run(gate, Capture.NONE));
                              assertEquals(old.getMessage(), actual.getMessage());
                              assertEquals(old.status(), actual.status());
                              assertEquals(old.messageCode(), actual.messageCode());
                            }
                          }
                        }),
                    DynamicTest.dynamicTest(
                        gate + "_SUCCESS_NO_TAG",
                        () -> {
                          if (SERVICE.contains(gate)) {
                            ServiceFixture f = new ServiceFixture();
                            if (gate == Gate.NEXT_QUESTION_CALL) {
                              f.question();
                            }
                            assertSame(f.result, f.apply(f.gates::add));
                            assertTrue(f.gates.isEmpty());
                          } else {
                            ValidatorFixture f = new ValidatorFixture(gate);
                            f.run(gate, f.gates::add);
                            assertTrue(f.gates.isEmpty());
                          }
                        })));
  }

  @Test
  void bothOriginalValidationsRunOnceAndTheServiceAlwaysPassesTheRecorder() throws Throwable {
    var f = new ValidatorFixture(Gate.NEXT_ACTION_MEANING);
    JsonNode materialized =
        f.validator.materializeAction(
            f.session,
            f.progress,
            f.obligation,
            f.selection,
            f.context,
            f.attempt,
            1,
            f.gates::add);
    f.validator.action(
        f.session, f.progress, f.plan, f.obligation, materialized, f.context, null, f.gates::add);
    verify(f.contracts, times(2)).validate(eq("v3/action"), any());
    assertTrue(f.gates.isEmpty());
    // ADR-SC-007 D5: production always hands the apply a recorder; there is no uncaptured route.
    ServiceFixture service = new ServiceFixture();
    var recorder = new GuidedGateRecorder();
    assertSame(service.result, service.apply(recorder));
    verify(service.validator, times(1))
        .materializeAction(any(), any(), any(), any(), any(), any(), eq(1L), eq(recorder));
    verify(service.validator, times(1))
        .action(any(), any(), any(), any(), any(), any(), any(), eq(recorder));
    assertEquals(null, recorder.firstGate());
    var order = inOrder(service.validator, service.questions, service.sessions, service.store);
    order.verify(service.validator).sourceSelections(any(), any(), any());
    order.verify(service.validator).remaining(any(), anyString());
    order.verify(service.store).obligation(anyString(), anyString());
    order.verify(service.sessions).runnerContext(any(), anyString(), anyLong());
    order
        .verify(service.validator)
        .materializeAction(any(), any(), any(), any(), any(), any(), anyLong(), any());
    order.verify(service.questions).effectiveObserved(anyString());
    order.verify(service.validator).action(any(), any(), any(), any(), any(), any(), any(), any());
    order.verify(service.store).reserveObligation(any(), anyString(), any());
  }

  @Test
  void firstLeafBeatsOuterAndOtherThrowablesAreIdenticalAndUntagged() throws Throwable {
    ServiceFixture f = new ServiceFixture();
    doAnswer(
            invocation -> {
              Capture capture = invocation.getArgument(7);
              return GuidedRefusalDiagnostics.call(
                  capture,
                  Gate.NEXT_MATERIALIZE_CONTRACT_CALL,
                  () -> {
                    throw f.sentinel;
                  });
            })
        .when(f.validator)
        .materializeAction(any(), any(), any(), any(), any(), any(), anyLong(), any());
    var attempt =
        new GuidedRefusalDiagnostics(GuidedNextActionGuardDiagnosticsTest::ignore)
            .attempt(UUID.randomUUID().toString(), UUID.randomUUID().toString());
    assertSame(f.sentinel, assertThrows(GuidedSessionException.class, () -> f.apply(attempt)));
    var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
    // Real afterCommit selection and first-leaf precedence are also exercised by DiagnosticsTest.
    var selected =
        new GuidedRefusalDiagnostics(events::add)
            .attempt(UUID.randomUUID().toString(), UUID.randomUUID().toString());
    selected.enterApplication();
    assertSame(f.sentinel, assertThrows(GuidedSessionException.class, () -> f.apply(selected)));
    new org.springframework.transaction.support.TransactionTemplate(
            new GuidedRefusalDiagnosticsTest.LocalTransactions())
        .executeWithoutResult(status -> selected.rejectedAfterCommit(true));
    assertEquals(Gate.NEXT_MATERIALIZE_CONTRACT_CALL, events.getFirst().gate());
    ServiceFixture effective = new ServiceFixture();
    effective.fail(Gate.NEXT_EFFECTIVE_CHOICE_CALL);
    events.clear();
    var effectiveAttempt =
        new GuidedRefusalDiagnostics(events::add)
            .attempt(UUID.randomUUID().toString(), UUID.randomUUID().toString());
    effectiveAttempt.enterApplication();
    assertSame(
        effective.sentinel,
        assertThrows(GuidedSessionException.class, () -> effective.apply(effectiveAttempt)));
    new org.springframework.transaction.support.TransactionTemplate(
            new GuidedRefusalDiagnosticsTest.LocalTransactions())
        .executeWithoutResult(status -> effectiveAttempt.rejectedAfterCommit(true));
    assertEquals(Gate.NEXT_EFFECTIVE_CHOICE_CALL, events.getFirst().gate());
    for (RuntimeException other :
        List.of(
            new IllegalArgumentException("public-canary"),
            new NullPointerException("public-canary"))) {
      ServiceFixture g = new ServiceFixture();
      when(g.sessions.runnerContext(any(), anyString(), anyLong())).thenThrow(other);
      assertSame(other, assertThrows(other.getClass(), () -> g.apply(g.gates::add)));
      assertTrue(g.gates.isEmpty());
    }
    AtomicInteger count = new AtomicInteger();
    assertThrows(
        GuidedSessionException.class,
        () ->
            GuidedRefusalDiagnostics.requireCaptured(
                count.incrementAndGet() == 0 && count.incrementAndGet() == 0,
                "INVALID_CONTRACT",
                422,
                GuidedRefusalDiagnostics.Capture.NONE,
                Gate.NEXT_SELECTION_SHAPE));
    assertEquals(1, count.get());
  }

  @Test
  void actualContractEngineValidatesEachOriginalStageOnce() {
    ValidatorFixture f = new ValidatorFixture(Gate.NEXT_ACTION_MEANING);
    f.progress
        .withObject("/executionEvidence")
        .put("sessionId", "synthetic")
        .put("documentId", "doc")
        .put("generation", 1)
        .put("origin", "http://synthetic.test");
    GuidedContracts contracts = spy(new GuidedContracts());
    GuidedProposalValidator validator = new GuidedProposalValidator(contracts);
    var proposal =
        validator.materializeAction(
            f.session,
            f.progress,
            f.obligation,
            f.selection,
            f.context,
            f.attempt,
            1,
            f.gates::add);
    verify(contracts, times(1)).validate("v3/action", proposal);
    validator.action(
        f.session, f.progress, f.plan, f.obligation, proposal, f.context, null, f.gates::add);
    verify(contracts, times(2)).validate("v3/action", proposal);
    assertTrue(f.gates.isEmpty());
  }

  @Test
  void originalPredicatesShortCircuitOnceAndDiagnosticsInspectNoThrowableProperties()
      throws Throwable {
    ValidatorFixture f = new ValidatorFixture(Gate.NEXT_ACTION_MEANING);
    ObjectNode proposal = spy(f.proposal);
    proposal.put("sessionId", "other");
    clearInvocations(proposal);
    assertThrows(
        GuidedSessionException.class,
        () ->
            f.validator.action(
                f.session,
                f.progress,
                f.plan,
                f.obligation,
                proposal,
                f.context,
                null,
                f.gates::add));
    verify(proposal, times(1)).path("sessionId");
    verify(proposal, never()).path("scopeHash");
    verify(proposal, never()).path("generation");
    ValidatorFixture authority = new ValidatorFixture(Gate.NEXT_ORIGINAL_AUTHORITY);
    ObjectNode attempt = spy(authority.attempt);
    attempt.put("planRevision", 2);
    clearInvocations(attempt);
    assertThrows(
        GuidedSessionException.class,
        () ->
            authority.validator.materializeAction(
                authority.session,
                authority.progress,
                authority.obligation,
                authority.selection,
                authority.context,
                attempt,
                1,
                authority.gates::add));
    verify(attempt, times(1)).path("planRevision");
    verify(attempt, never()).path("scope");
    var sentinel = mock(GuidedSessionException.class);
    ServiceFixture service = new ServiceFixture();
    doAnswer(
            invocation -> {
              throw sentinel;
            })
        .when(service.sessions)
        .runnerContext(any(), anyString(), anyLong());
    clearInvocations(sentinel);
    assertSame(
        sentinel,
        assertThrows(GuidedSessionException.class, () -> service.apply(service.gates::add)));
    verifyNoInteractions(sentinel);
    assertEquals(List.of(Gate.NEXT_RUNNER_CONTEXT_CALL), service.gates);
  }

  @Test
  void earlyReturnsPreserveValuesAndDoNotInvokeLaterCalls() throws Throwable {
    ServiceFixture complete = new ServiceFixture();
    complete.response.put("status", "COMPLETE");
    assertTrue(complete.apply(complete.gates::add).path("complete").asBoolean());
    verifyNoInteractions(complete.validator);
    assertTrue(complete.gates.isEmpty());
    ServiceFixture existing = new ServiceFixture();
    var prior = C.object().put("admissionId", "synthetic");
    when(existing.store.obligation(anyString(), anyString())).thenReturn(prior);
    assertSame(prior, existing.apply(existing.gates::add));
    verify(existing.sessions, never()).runnerContext(any(), anyString(), anyLong());
    assertTrue(existing.gates.isEmpty());
  }

  static final class ValidatorFixture {
    final GuidedContracts contracts = mock(GuidedContracts.class);
    final GuidedProposalValidator validator = new GuidedProposalValidator(contracts);
    final List<Gate> gates = new ArrayList<>();
    final GuidedSessionException sentinel = new GuidedSessionException("INVALID_CONTRACT", 422);
    boolean contractFailure;
    final ObjectNode session =
        C.object().put("sessionId", "synthetic").put("scopeHash", "a".repeat(64));
    final ObjectNode progress =
        C.object()
            .put("documentId", "doc")
            .put("generation", 1)
            .put("stepIndex", 0)
            .put("evidenceHash", "b".repeat(64));
    final ObjectNode context =
        C.object().put("contextRevision", 1).put("authoredInputsHash", "c".repeat(64));
    final ObjectNode attempt =
        C.object()
            .put("planRevision", 1)
            .put("expectedContextRevision", 1)
            .put("expectedAuthoredInputsHash", "c".repeat(64));
    final ObjectNode obligation =
        C.object()
            .put("obligationId", "o")
            .put("stepId", "step")
            .put("occurrence", 0)
            .put("operationKind", "click")
            .put("targetIntent", "Synthetic")
            .putNull("referenceIndex")
            .putNull("needId")
            .putNull("predicate");
    final ObjectNode selection = C.object();
    final ObjectNode plan = C.object();
    ObjectNode proposal;

    /** The authored literal the G2 text gate compares an assert containsText against. */
    String literal;

    ValidatorFixture(Gate variant) {
      when(contracts.object()).thenAnswer(invocation -> C.object());
      session.putObject("scope");
      session.putObject("owner").put("workerId", "worker").put("fence", 1);
      session.putArray("sourceSteps").addObject().put("stepId", "step");
      progress
          .putObject("executionEvidence")
          .put("kind", "observedDocument")
          .put("contextId", "ctx")
          .put("observationHash", "d".repeat(64));
      ObjectNode observation = progress.putObject("observation");
      observation.putObject("coverage").put("passwordControls", 1);
      observation.put("readRuleId", "rule");
      // ADR-SC-007: the observation the gates judge is a facts table keyed by ref.
      observation
          .putObject("facts")
          .putObject("e1")
          .put("role", "button")
          .put("name", "Synthetic")
          .put("editable", false)
          .put("evidence", "Synthetic")
          .putArray("evidenceSegments")
          .addObject()
          .put("field", "name")
          .put("start", 0)
          .put("end", 9);
      for (String key : List.of("scope", "scopeHash", "owner")) {
        attempt.set(key, session.path(key));
      }
      for (String key : List.of("documentId", "generation", "stepIndex", "executionEvidence")) {
        attempt.set(key, progress.path(key));
      }
      context.putObject("authoredInputs").putArray("inputs");
      selection.putObject("target").put("kind", "node").put("ref", "e1");
      selection.putObject("operation").put("kind", "click");
      plan.putArray("sourceReferences");
      plan.putArray("needs");
      proposal =
          validator.materializeAction(
              session, progress, obligation, selection, context, attempt, 1);
      if (variant == Gate.NEXT_AUTHORED_SOURCE) {
        obligation.put("referenceIndex", 0);
        ObjectNode ref = C.object().put("kind", "authoredLiteral");
        plan.withArray("sourceReferences").add(ref);
        ObjectNode input =
            context
                .withObject("/authoredInputs")
                .withArray("inputs")
                .addObject()
                .put("inputId", "input");
        input.set("provenance", ref);
        proposal
            .withObject("/operation")
            .putObject("value")
            .put("kind", "authoredLiteral")
            .put("sourceInputId", "input");
      }
      if (variant == Gate.NEXT_SECRET_POLICY) {
        obligation.put("operationKind", "fill");
        proposal.withObject("/operation").put("kind", "fill");
        proposal.withObject("/target").put("kind", "passwordControl");
        proposal
            .withObject("/operation")
            .putObject("value")
            .put("kind", "secretRef")
            .put("sourceInputId", "secret");
        context
            .withObject("/authoredInputs")
            .withArray("inputs")
            .addObject()
            .put("inputId", "secret")
            .put("kind", "secretRef")
            .put("sourceStepId", "step")
            .put("intendedSlot", "fill.value");
      }
      if (variant == Gate.NEXT_BINDING_MEANING) {
        obligation.put("needId", "need");
        plan.withArray("needs").addObject().put("needId", "need").put("bindingId", "binding");
        proposal
            .withObject("/operation")
            .putObject("value")
            .put("kind", "binding")
            .put("bindingId", "binding");
      }
      if (variant == Gate.NEXT_ASSERTION_PREDICATE) {
        obligation.put("operationKind", "assert").put("predicate", "visible");
        proposal.withObject("/operation").put("kind", "assert").put("predicate", "visible");
      }
      if (variant == Gate.NEXT_OPERATION_TARGET) {
        // A check needs a checkbox-like element: the success path picks one, the failure a button.
        obligation.put("operationKind", "check");
        proposal.withObject("/operation").put("kind", "check");
        fact().put("role", "checkbox");
      }
      if (variant == Gate.NEXT_READ_RULE) {
        obligation.put("operationKind", "read").put("needId", "need");
        plan.withArray("needs").addObject().put("needId", "need").put("bindingId", "binding");
        ObjectNode operation = proposal.withObject("/operation");
        operation.put("kind", "read").put("bindingId", "binding");
        operation
            .putObject("recipe")
            .put("kind", "visibleText")
            .put("classification", "permittedBusinessData")
            .put("policyRuleId", "rule");
        fact().put("text", "Synthetic");
      }
      if (variant == Gate.NEXT_ASSERT_TEXT_ABSENT) {
        obligation.put("operationKind", "assert").put("predicate", "containsText");
        obligation.put("referenceIndex", 0);
        ObjectNode ref = C.object().put("kind", "authoredLiteral");
        plan.withArray("sourceReferences").add(ref);
        ObjectNode input =
            context
                .withObject("/authoredInputs")
                .withArray("inputs")
                .addObject()
                .put("inputId", "input");
        input.set("provenance", ref);
        ObjectNode operation = proposal.withObject("/operation");
        operation.put("kind", "assert").put("predicate", "containsText");
        operation
            .putObject("expected")
            .put("kind", "authoredLiteral")
            .put("sourceInputId", "input");
        fact().put("text", "Synthetic");
        literal = "Synthetic";
      }
      clearInvocations(contracts);
    }

    ObjectNode fact() {
      return progress.withObject("/observation/facts/e1");
    }

    void fail(Gate gate) {
      switch (gate) {
        case NEXT_ORIGINAL_AUTHORITY -> attempt.put("planRevision", 2);
        case NEXT_CURRENT_AUTHORED_STEP -> obligation.put("stepId", "other");
        case NEXT_SELECTION_SHAPE -> selection.put("extra", true);
        case NEXT_MATERIALIZE_CONTRACT_CALL, NEXT_ACTION_CONTRACT_CALL -> {
          contractFailure = true;
          doThrow(sentinel).when(contracts).validate(eq("v3/action"), any());
        }
        case NEXT_ACTION_MEANING -> proposal.put("sessionId", "other");
        case NEXT_ACTION_EVIDENCE -> proposal.put("generation", 2);
        case NEXT_TARGET_REF -> proposal.withObject("/target").put("ref", "e9");
        case NEXT_TARGET_INTENT -> obligation.put("targetIntent", "other");
        case NEXT_SELECTED_CHOICE -> obligation.put("reconfirm", true);
        case NEXT_OPERATION_TARGET -> fact().put("role", "button");
        case NEXT_READ_RULE -> fact().remove("text");
        case NEXT_ASSERT_TEXT_ABSENT -> literal = "absent text";
        case NEXT_AUTHORED_SOURCE ->
            proposal.withObject("/operation/value").put("sourceInputId", "other");
        case NEXT_SECRET_POLICY ->
            progress.withObject("/observation/coverage").put("passwordControls", 2);
        case NEXT_BINDING_MEANING ->
            proposal.withObject("/operation/value").put("bindingId", "other");
        case NEXT_ASSERTION_PREDICATE ->
            proposal.withObject("/operation").put("predicate", "other");
        default -> throw new AssertionError();
      }
    }

    void run(Gate gate, Capture capture) {
      if (List.of(
              Gate.NEXT_ORIGINAL_AUTHORITY,
              Gate.NEXT_CURRENT_AUTHORED_STEP,
              Gate.NEXT_SELECTION_SHAPE,
              Gate.NEXT_MATERIALIZE_CONTRACT_CALL)
          .contains(gate)) {
        if (capture == Capture.NONE) {
          validator.materializeAction(
              session, progress, obligation, selection, context, attempt, 1);
        } else {
          validator.materializeAction(
              session, progress, obligation, selection, context, attempt, 1, capture);
        }
      } else {
        validator.action(session, progress, plan, obligation, proposal, context, literal, capture);
      }
    }
  }

  static final class ServiceFixture {
    final GuidedSessionService sessions = mock(GuidedSessionService.class);
    final GuidedSessionRepository repository = mock(GuidedSessionRepository.class);
    final GuidedTranslationStore store = mock(GuidedTranslationStore.class);
    final GuidedClarificationContextStore questions = mock(GuidedClarificationContextStore.class);
    final GuidedProposalValidator validator = mock(GuidedProposalValidator.class);
    final GuidedContracts contracts = mock(GuidedContracts.class);
    final ValidatorFixture inputs = new ValidatorFixture(Gate.NEXT_ACTION_MEANING);
    final GuidedSessionRepository.Session current =
        new GuidedSessionRepository.Session(inputs.session, inputs.progress);
    final ObjectNode state = C.object().put("planRevision", 1);
    final ObjectNode response = C.object().put("status", "ACTION").put("obligationId", "o");
    final ObjectNode result = C.object().put("syntheticResult", true);
    final List<Gate> gates = new ArrayList<>();
    final GuidedSessionException sentinel = new GuidedSessionException("INVALID_CONTRACT", 422);
    final GuidedTranslationService service;

    ServiceFixture() {
      when(contracts.object()).thenAnswer(invocation -> C.object());
      state.set("plan", inputs.plan);
      state
          .putObject("manifest")
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", "step")
          .put("text", "Click Synthetic");
      inputs.progress.putObject("resolvedClarifications");
      when(store.state(anyString())).thenReturn(state);
      when(validator.remaining(any(), anyString())).thenReturn(inputs.obligation);
      when(validator.materializeAction(any(), any(), any(), any(), any(), any(), anyLong()))
          .thenReturn(inputs.proposal);
      when(validator.materializeAction(any(), any(), any(), any(), any(), any(), anyLong(), any()))
          .thenReturn(inputs.proposal);
      when(sessions.runnerContext(any(), anyString(), anyLong())).thenReturn(inputs.context);
      when(questions.effectiveObserved(anyString())).thenReturn(List.of());
      when(store.reserveObligation(any(), anyString(), any())).thenReturn(result);
      when(sessions.translationQuestion(
              any(), anyString(), anyLong(), anyString(), any(), any(), any()))
          .thenReturn(result);
      service =
          new GuidedTranslationService(
              sessions,
              repository,
              store,
              questions,
              null,
              null,
              contracts,
              null,
              null,
              validator,
              null,
              new GuidedTranslationProperties(true, 131072, 4096, 20, "worker"),
              Clock.systemUTC());
    }

    void question() {
      response.put("status", "CLARIFICATION");
      ObjectNode candidate = response.putObject("question").put("reason", "AMBIGUOUS");
      candidate
          .putArray("choices")
          .addObject()
          .putObject("meaning")
          .put("ref", "e1")
          .put("obligationId", "o")
          .putNull("bindingId");
      inputs.attempt.put("kind", "NEXT_ACTION");
      inputs.context.put("workerId", "worker").put("ownerFence", 1).put("contextId", "ctx");
      inputs.progress.set(
          "observationHash", inputs.progress.path("executionEvidence").path("observationHash"));
      when(repository.actions(anyString())).thenReturn(List.of());
    }

    void fail(Gate gate) {
      switch (gate) {
        case NEXT_QUESTION_CALL ->
            when(sessions.translationQuestion(
                    any(), anyString(), anyLong(), anyString(), any(), any(), any()))
                .thenThrow(sentinel);
        case NEXT_PLAN_ACCESS_CALL -> when(store.state(anyString())).thenThrow(sentinel);
        case NEXT_SOURCE_SELECTION_CALL ->
            doThrow(sentinel).when(validator).sourceSelections(any(), any(), any());
        case NEXT_OBLIGATION_LOOKUP_CALL ->
            when(validator.remaining(any(), anyString())).thenThrow(sentinel);
        case NEXT_ASSOCIATION_LOOKUP_CALL ->
            when(store.obligation(anyString(), anyString())).thenThrow(sentinel);
        case NEXT_RUNNER_CONTEXT_CALL ->
            when(sessions.runnerContext(any(), anyString(), anyLong())).thenThrow(sentinel);
        case NEXT_MATERIALIZE_CALL ->
            when(validator.materializeAction(
                    any(), any(), any(), any(), any(), any(), anyLong(), any()))
                .thenThrow(sentinel);
        case NEXT_EFFECTIVE_CHOICE_CALL ->
            when(questions.effectiveObserved(anyString())).thenThrow(sentinel);
        case NEXT_VALIDATE_ACTION_CALL ->
            doThrow(sentinel)
                .when(validator)
                .action(any(), any(), any(), any(), any(), any(), any(), any());
        case NEXT_POLICY_CALL ->
            // The action guard is pure: its only failure is a refusal. The authored step no
            // longer names the proposed target, so the guard refuses it as ungrounded.
            state.withArray("/manifest/sourceSteps").removeAll();
        case NEXT_RESERVATION_CALL ->
            when(store.reserveObligation(any(), anyString(), any())).thenThrow(sentinel);
        default -> throw new AssertionError();
      }
    }

    JsonNode apply(Capture capture) throws Throwable {
      var method =
          GuidedTranslationService.class.getDeclaredMethod(
              "applyNextAction",
              org.springframework.security.core.Authentication.class,
              String.class,
              long.class,
              GuidedSessionRepository.Session.class,
              JsonNode.class,
              JsonNode.class,
              Capture.class);
      method.setAccessible(true);
      try {
        return (JsonNode)
            method.invoke(
                service, null, "synthetic", 1L, current, response, inputs.attempt, capture);
      } catch (InvocationTargetException failure) {
        throw failure.getCause();
      }
    }
  }
}
