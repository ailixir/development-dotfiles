package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Gate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.google.genai.types.Candidate;
import com.google.genai.types.Content;
import com.google.genai.types.FinishReason;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.GenerateContentResponseUsageMetadata;
import com.google.genai.types.Part;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

class GuidedRefusalCompatibilityTest {
  private static void noop() {}

  private static final GuidedContracts C = new GuidedContracts();
  private static final String CANARY = "public-fake-request-label-locator-value-provider-canary";
  private static final List<String> DISTINCT_CANARIES =
      List.of(
          "request-canary-282",
          "label-canary-282",
          "locator-canary-282",
          "value-canary-282",
          "provider-error-canary-282",
          "unknown-sdk-canary-282");

  @Test
  void samLegacyOverloadConstructorsAndDisabledParserDispatchRemain() throws Exception {
    assertEquals(
        1,
        java.util.Arrays.stream(GuidedLlmGatewayClient.class.getMethods())
            .filter(method -> java.lang.reflect.Modifier.isAbstract(method.getModifiers()))
            .count());
    AtomicInteger sends = new AtomicInteger();
    GuidedModelResponse expected =
        new GuidedModelResponse(GuidedModelResponse.Code.TRANSPORT, null, 1, 2, CANARY);
    GuidedLlmGatewayClient old =
        (request, budget) -> {
          sends.incrementAndGet();
          return expected;
        };
    assertSame(
        expected,
        old.propose(
            request(),
            budget(),
            gate -> {
              throw new AssertionError(CANARY);
            }));
    assertEquals(1, sends.get());
    assertNotNull(
        GenAiGuidedLlmGatewayClient.class.getConstructor(
            GenAiGatewayTransport.class, GuidedResponseParser.class));
    assertNotNull(GuidedResponseParser.class.getConstructor(GuidedContracts.class));
    assertNotNull(
        GuidedModelResponse.class.getConstructor(
            GuidedModelResponse.Code.class,
            JsonNode.class,
            Integer.class,
            Integer.class,
            String.class));
    var parser = mock(GuidedResponseParser.class);
    when(parser.parse(any(), any(byte[].class))).thenReturn(C.object().put("canary", CANARY));
    var fixture = client(parser, response("STOP", Part.fromText("{}")));
    assertEquals(GuidedModelResponse.Code.OK, fixture.client.propose(request(), budget()).code());
    verify(parser, times(1)).parse(any(), any(byte[].class));
    verify(parser, never()).parse(any(), any(byte[].class), any());
    verify(fixture.lease, times(1)).generate(anyString(), any(), eq(true));
  }

  @Test
  void actualParserGatesUseOriginalSingleValidationAndOriginalThrowable() {
    var gates = new ArrayList<Gate>();
    var parser = new GuidedResponseParser(C);
    String valid =
        "{\"schemaVersion\":3,\"kind\":\"NEXT_ACTION\",\"requestId\":\""
            + CANARY
            + "\",\"status\":\"COMPLETE\",\"obligationId\":null,\"action\":null,\"question\":null}";
    for (String[] fixture :
        List.of(
            new String[] {"{\"x\":1,\"x\":2}", "WIRE_CANONICAL"},
            new String[] {"{} trailing", "WIRE_CANONICAL"},
            new String[] {"{}", "STRICT_SCHEMA"},
            new String[] {valid.replace(CANARY, "wrong-identity-canary"), "REQUEST_IDENTITY"})) {
      gates.clear();
      assertThrows(
          GuidedSessionException.class,
          () ->
              parser.parse(
                  request(),
                  fixture[0].getBytes(java.nio.charset.StandardCharsets.UTF_8),
                  gates::add));
      assertEquals(List.of(Gate.valueOf(fixture[1])), gates);
    }
    gates.clear();
    assertNotNull(
        parser.parse(
            request(), valid.getBytes(java.nio.charset.StandardCharsets.UTF_8), gates::add));
    assertTrue(gates.isEmpty());
    var contracts = mock(GuidedContracts.class);
    var sentinel = new IllegalArgumentException(CANARY);
    when(contracts.parseWire(any(byte[].class))).thenThrow(sentinel);
    assertSame(
        sentinel,
        assertThrows(
            IllegalArgumentException.class,
            () ->
                new GuidedResponseParser(contracts).parse(request(), new byte[] {1}, gates::add)));
    verify(contracts, times(1)).parseWire(any(byte[].class));
    verify(contracts, never()).validate(anyString(), any());
    reset(contracts);
    when(contracts.parseWire(any(byte[].class))).thenReturn(C.parse(valid));
    assertNotNull(
        new GuidedResponseParser(contracts)
            .parse(
                request(),
                new byte[] {1},
                gate -> {
                  throw new AssertionError(CANARY);
                }));
    verify(contracts, times(1)).parseWire(any(byte[].class));
    verify(contracts, times(1)).validate(eq("v3/guided-model-response"), any());
  }

  @Test
  void actualClientTagsOnlyExistingPredicatesAndPreservesCodesSingleSendAndUsage()
      throws Exception {
    for (String category : List.of("candidate", "finish", "content", "usage", "provider")) {
      GenerateContentResponse raw = response("STOP", Part.fromText("{}"));
      if (category.equals("candidate")) {
        when(raw.candidates()).thenReturn(Optional.empty());
      }
      if (category.equals("finish")) {
        raw = response("MAX_TOKENS", Part.fromText(CANARY));
      }
      if (category.equals("content")) {
        raw =
            response(
                "STOP",
                mock(
                    Part.class,
                    invocation -> {
                      if (invocation.getMethod().getReturnType() == Optional.class) {
                        return Optional.empty();
                      }
                      return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
                    }));
      }
      if (category.equals("usage")) {
        var usage = mock(GenerateContentResponseUsageMetadata.class);
        when(usage.promptTokenCount()).thenReturn(Optional.of(-1));
        when(raw.usageMetadata()).thenReturn(Optional.of(usage));
      }
      var parser = mock(GuidedResponseParser.class);
      var fixture = client(parser, raw);
      if (category.equals("provider")) {
        when(fixture.lease.generate(anyString(), any(), eq(true)))
            .thenThrow(new IllegalArgumentException(DISTINCT_CANARIES.get(4)));
      }
      var gates = new ArrayList<Gate>();
      var enabled = fixture.client.propose(request(), budget(), gates::add);
      var disabled = fixture.client.propose(request(), budget());
      assertEquals(disabled.code(), enabled.code());
      assertEquals(disabled.inputTokens(), enabled.inputTokens());
      assertEquals(disabled.outputTokens(), enabled.outputTokens());
      assertNull(enabled.proposal());
      assertEquals(
          category.equals("usage") || category.equals("provider")
              ? GuidedModelResponse.Code.TRANSPORT
              : GuidedModelResponse.Code.INVALID_RESPONSE,
          enabled.code());
      if (category.equals("provider")) {
        assertTrue(gates.isEmpty());
      } else {
        assertEquals(
            List.of(
                switch (category) {
                  case "candidate" -> Gate.ADAPTER_CANDIDATE;
                  case "finish" -> Gate.ADAPTER_FINISH;
                  case "content" -> Gate.ADAPTER_CONTENT;
                  default -> Gate.ADAPTER_USAGE;
                }),
            gates);
      }
      verify(fixture.lease, times(2)).generate(anyString(), any(), eq(true));
      verifyNoInteractions(parser);
      verify(raw, never()).modelVersion();
    }
  }

  @Test
  void disabledServiceCallsOldTwoArgMockAndEnabledServicePreservesRepairsAndNullReceipts()
      throws Throwable {
    Fixture disabled = new Fixture(false, GuidedModelResponse.Code.INVALID_RESPONSE);
    assertThrows(GuidedSessionException.class, () -> disabled.call(() -> C.object()));
    verify(disabled.gateway, times(3)).propose(any(), any());
    verify(disabled.gateway, never()).propose(any(), any(), any());
    assertTrue(disabled.events.isEmpty());
    Fixture enabled = new Fixture(true, GuidedModelResponse.Code.INVALID_RESPONSE);
    assertThrows(GuidedSessionException.class, () -> enabled.call(() -> C.object()));
    verify(enabled.gateway, times(3)).propose(any(), any(), any());
    verify(enabled.gateway, never()).propose(any(), any());
    assertEquals(3, enabled.events.size());
    assertTrue(
        enabled.events.stream().allMatch(event -> event.gate() == Gate.OTHER_CLIENT_FAILURE));
    assertEquals(List.of(0, 1, 2), enabled.repairCounts);
    assertEquals(disabled.repairCounts, enabled.repairCounts);
    verify(enabled.sessions, times(3))
        .reserveModel(any(), anyString(), anyLong(), anyString(), anyInt(), anyInt());
    verify(enabled.store, times(3))
        .finishAttempt(
            anyString(),
            anyString(),
            eq("REJECTED"),
            isNull(),
            eq(4),
            eq(5),
            eq("INVALID_RESPONSE"));
    verify(enabled.sessions, times(1))
        .failTranslation(any(), anyString(), anyLong(), eq("INVALID_CONTRACT"));
  }

  @Test
  void serviceEmitsApplicationOnlyInsideApplyAndSettlementBeforeOrAfterReturn() throws Throwable {
    var original = new GuidedSessionException("INVALID_CONTRACT", 422);
    Fixture inside = new Fixture(true, GuidedModelResponse.Code.OK);
    assertSame(
        original,
        assertThrows(
            GuidedSessionException.class,
            () ->
                inside.call(
                    () -> {
                      throw original;
                    })));
    assertEquals(3, inside.events.size());
    assertTrue(inside.events.stream().allMatch(event -> event.gate() == Gate.APPLICATION));
    Fixture before = new Fixture(true, GuidedModelResponse.Code.OK);
    AtomicInteger settlements = new AtomicInteger();
    doAnswer(
            invocation -> {
              if (settlements.incrementAndGet() % 2 == 1) {
                throw original;
              }
              return C.object();
            })
        .when(before.sessions)
        .settleModel(any(), anyString(), anyLong(), anyString(), anyString(), any(), any());
    assertSame(
        original, assertThrows(GuidedSessionException.class, () -> before.call(() -> C.object())));
    assertTrue(before.events.stream().allMatch(event -> event.gate() == Gate.SETTLEMENT_AUTHORITY));
    Fixture after = new Fixture(true, GuidedModelResponse.Code.OK);
    doAnswer(
            invocation -> {
              throw original;
            })
        .when(after.store)
        .finishAttempt(anyString(), anyString(), eq("APPLIED"), any(), any(), any());
    assertSame(
        original, assertThrows(GuidedSessionException.class, () -> after.call(() -> C.object())));
    assertEquals(3, after.events.size());
    assertTrue(after.events.stream().allMatch(event -> event.gate() == Gate.SETTLEMENT_AUTHORITY));
  }

  @Test
  void appliedSupersededCancelledUnsettledAndNonsentNeverEmit() throws Throwable {
    Fixture applied = new Fixture(true, GuidedModelResponse.Code.OK);
    JsonNode expected = C.object().put("ok", true);
    assertEquals(expected, applied.call(() -> expected));
    assertTrue(applied.events.isEmpty());
    for (boolean cancel : List.of(false, true)) {
      Fixture late = new Fixture(true, GuidedModelResponse.Code.OK);
      if (cancel) {
        late.onSend = () -> late.current.document().put("state", "CANCELLED");
      } else {
        when(late.store.currentAttempt(any(), anyString(), anyString(), anyLong(), any()))
            .thenReturn(true, false);
      }
      assertThrows(GuidedSessionException.class, () -> late.call(() -> C.object()));
      assertTrue(late.events.isEmpty());
      verify(late.store, never())
          .finishAttempt(anyString(), anyString(), eq("REJECTED"), any(), any(), any());
      verify(late.store, never())
          .finishAttempt(anyString(), anyString(), eq("REJECTED"), any(), any(), any(), any());
    }
    Fixture unsettled = new Fixture(true, GuidedModelResponse.Code.TRANSPORT);
    doThrow(new GuidedSessionException("REVISION_CONFLICT", 409))
        .when(unsettled.sessions)
        .settleModel(any(), anyString(), anyLong(), anyString(), anyString(), any(), any());
    assertThrows(GuidedSessionException.class, () -> unsettled.call(() -> C.object()));
    assertTrue(unsettled.events.isEmpty());
    Fixture nonsent = new Fixture(true, GuidedModelResponse.Code.OK);
    nonsent.send = false;
    assertNotNull(nonsent.call(() -> C.object()));
    assertTrue(nonsent.events.isEmpty());
    verifyNoInteractions(nonsent.gateway);
  }

  @Test
  void serviceJoinedOuterRollbackDoesNotPublishCallbackReturnAsCommit() {
    Fixture fixture = new Fixture(true, GuidedModelResponse.Code.TRANSPORT);
    fixture.tx.executeWithoutResult(
        status -> {
          assertThrows(GuidedSessionException.class, () -> fixture.call(() -> C.object()));
          assertTrue(fixture.events.isEmpty());
          status.setRollbackOnly();
        });
    assertTrue(fixture.events.isEmpty());
  }

  @Test
  void receiptWhitelistExcludesDistinctRequestProviderBodyAndSdkCanaries() throws Throwable {
    Fixture fixture = new Fixture(true, GuidedModelResponse.Code.OK);
    assertThrows(
        GuidedSessionException.class,
        () ->
            fixture.call(
                () -> {
                  throw new GuidedSessionException("INVALID_CONTRACT", 422);
                }));
    assertEquals(3, fixture.events.size());
    for (var receipt : fixture.events) {
      String text = new String(receipt.bytes(), java.nio.charset.StandardCharsets.US_ASCII);
      for (String canary : DISTINCT_CANARIES) {
        assertFalse(text.contains(canary));
      }
      var parsed = new com.fasterxml.jackson.databind.ObjectMapper().readTree(receipt.bytes());
      assertEquals(5, parsed.size());
      assertEquals("APPLICATION", parsed.path("gate").asText());
    }
  }

  @Test
  void reservationAndSendAuthorityRefusalsCreateNoDiagnosticOrProviderCall() {
    Fixture budget = new Fixture(true, GuidedModelResponse.Code.OK);
    when(budget.sessions.modelReservationFitsLocked(any(), anyInt(), anyInt())).thenReturn(false);
    assertThrows(GuidedSessionException.class, () -> budget.call(() -> C.object()));
    assertTrue(budget.events.isEmpty());
    verifyNoInteractions(budget.gateway);
    verify(budget.store, never())
        .reserveAttempt(
            any(),
            anyString(),
            anyInt(),
            anyString(),
            anyString(),
            anyLong(),
            anyInt(),
            anyInt(),
            anyString(),
            any());
    Fixture send = new Fixture(true, GuidedModelResponse.Code.OK);
    when(send.store.claimSend(anyString(), anyString(), anyString(), any())).thenReturn(false);
    assertThrows(GuidedSessionException.class, () -> send.call(() -> C.object()));
    assertTrue(send.events.isEmpty());
    verifyNoInteractions(send.gateway);
  }

  @Test
  void fourthCallbackCaptureIsExactNoneExceptEnabledNextAndFineLabelSettlesRealCommit()
      throws Throwable {
    for (boolean enabled : List.of(false, true)) {
      for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
        Fixture fixture = new Fixture(enabled, GuidedModelResponse.Code.OK);
        var seen = new ArrayList<GuidedRefusalDiagnostics.Capture>();
        assertThrows(
            GuidedSessionException.class,
            () ->
                fixture.call(
                    kind,
                    capture -> {
                      seen.add(capture);
                      return GuidedRefusalDiagnostics.call(
                          capture,
                          Gate.NEXT_RESERVATION_CALL,
                          () -> {
                            throw new GuidedSessionException("INVALID_CONTRACT", 422);
                          });
                    }));
        assertEquals(3, seen.size());
        boolean fine = enabled && kind == GuidedModelRequest.Kind.NEXT_ACTION;
        assertTrue(
            seen.stream()
                .allMatch(
                    capture ->
                        fine
                            ? capture != GuidedRefusalDiagnostics.Capture.NONE
                            : capture == GuidedRefusalDiagnostics.Capture.NONE));
        if (enabled) {
          assertTrue(
              fixture.events.stream()
                  .allMatch(
                      receipt ->
                          receipt.gate()
                              == (fine ? Gate.NEXT_RESERVATION_CALL : Gate.APPLICATION)));
        } else {
          assertTrue(fixture.events.isEmpty());
        }
      }
    }
    Fixture joined = new Fixture(true, GuidedModelResponse.Code.OK);
    joined.tx.executeWithoutResult(
        status -> {
          assertThrows(
              GuidedSessionException.class,
              () ->
                  joined.call(
                      GuidedModelRequest.Kind.NEXT_ACTION,
                      capture ->
                          GuidedRefusalDiagnostics.call(
                              capture,
                              Gate.NEXT_RESERVATION_CALL,
                              () -> {
                                throw new GuidedSessionException("INVALID_CONTRACT", 422);
                              })));
          assertTrue(joined.events.isEmpty());
          status.setRollbackOnly();
        });
    assertTrue(joined.events.isEmpty());
  }

  private record Client(GenAiGuidedLlmGatewayClient client, GenAiGatewayTransport.Lease lease) {}

  private static Client client(GuidedResponseParser parser, GenerateContentResponse raw)
      throws Exception {
    var transport = mock(GenAiGatewayTransport.class);
    var properties =
        new StudioGatewayProperties(
            "http://127.0.0.1",
            "synthetic",
            "synthetic",
            CANARY,
            new StudioGatewayProperties.Credentials("none", null),
            Duration.ofSeconds(5),
            1,
            131072,
            65536,
            4096,
            null,
            new StudioGatewayProperties.ProviderFeatures(false, false));
    when(transport.properties()).thenReturn(properties);
    var lease = mock(GenAiGatewayTransport.Lease.class);
    when(transport.tryAcquire(any())).thenReturn(lease);
    when(lease.generate(anyString(), any(), eq(true))).thenReturn(raw);
    return new Client(new GenAiGuidedLlmGatewayClient(transport, parser), lease);
  }

  private static GenerateContentResponse response(String reason, Part part) {
    var raw = mock(GenerateContentResponse.class);
    when(raw.usageMetadata()).thenReturn(Optional.empty());
    when(raw.modelVersion()).thenReturn(Optional.of(DISTINCT_CANARIES.get(5)));
    var candidate = mock(Candidate.class);
    var finish = mock(FinishReason.class);
    when(finish.toString()).thenReturn(reason);
    when(candidate.finishReason()).thenReturn(Optional.of(finish));
    when(candidate.content()).thenReturn(Optional.of(Content.fromParts(part)));
    when(raw.candidates()).thenReturn(Optional.of(List.of(candidate)));
    return raw;
  }

  private static GuidedCallBudget budget() {
    return new GuidedCallBudget(Instant.now().plusSeconds(20), Clock.systemUTC());
  }

  private static GuidedModelRequest request() {
    ObjectNode context =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", "synthetic")
            .put("scopeHash", "a".repeat(64))
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    context.putArray("sourceSteps").addObject().put("stepId", "step").put("text", CANARY);
    for (String field :
        List.of(
            "configurationReferences",
            "inputs",
            "obligations",
            "needs",
            "repairCodes",
            "authoringContext",
            "clarificationSelections")) {
      context.putArray(field);
    }
    context
        .putNull("observation")
        .putNull("executionEvidence")
        .putNull("authoredInputsHash")
        .put("contextRevision", 0);
    context.putObject("coordinate").put("stepId", "step").put("ordinal", 0);
    return new GuidedModelRequest(
        CANARY,
        1,
        GuidedModelRequest.Kind.NEXT_ACTION,
        new GuidedModelProjection(context),
        "fixed synthetic contract",
        C.object().put("type", "object"),
        1024);
  }

  private static final class Fixture {
    final GuidedSessionService sessions = mock(GuidedSessionService.class);
    final GuidedSessionRepository repository = mock(GuidedSessionRepository.class);
    final GuidedTranslationStore store = mock(GuidedTranslationStore.class);
    final GuidedLlmGatewayClient gateway = mock(GuidedLlmGatewayClient.class);
    final TransactionTemplate tx =
        new TransactionTemplate(new GuidedRefusalDiagnosticsTest.LocalTransactions());
    final List<GuidedRefusalDiagnostics.Receipt> events = new ArrayList<>();
    final List<Integer> repairCounts = new ArrayList<>();
    final String id = UUID.randomUUID().toString();
    final GuidedSessionRepository.Session current;
    final ObjectNode state;
    final GuidedTranslationService service;
    boolean send = true;
    Runnable onSend = GuidedRefusalCompatibilityTest::noop;

    @SuppressWarnings("unchecked")
    Fixture(boolean enabled, GuidedModelResponse.Code code) {
      ObjectNode document =
          C.object()
              .put("sessionId", id)
              .put("state", "PROPOSING")
              .put("scopeHash", "a".repeat(64))
              .put("expiresAt", Instant.now().plusSeconds(300).toString());
      document.putObject("scope").put("sourceRevision", "1").put("configurationRevision", "1");
      document.putObject("owner").put("workerId", "worker").put("fence", 1);
      document
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", "step")
          .put("requiresAssertion", false);
      current = new GuidedSessionRepository.Session(document, C.object().put("stepIndex", 0));
      var prompts = new GuidedPromptAssembler(C);
      state =
          C.object()
              .put("planRevision", 0)
              .put("continuation", "SOURCE_PLAN")
              .putNull("plan")
              .putNull("activeAttempt");
      ObjectNode manifest = state.putObject("manifest");
      manifest.set("schemaPins", prompts.schemaProvenance());
      manifest
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", "step")
          .put("text", "Click Synthetic");
      manifest.putArray("configurationReferences");
      manifest.putArray("authoringContext");
      when(store.state(anyString())).thenAnswer(invocation -> state);
      when(repository.lock(anyString())).thenReturn(current);
      when(repository.incremental())
          .thenReturn(mock(com.citi.put.checks.studio.guided.session.GuidedIncrementalStore.class));
      when(repository.transaction(any()))
          .thenAnswer(
              invocation -> tx.execute(status -> ((Supplier<?>) invocation.getArgument(0)).get()));
      when(sessions.translationTransaction(any(), anyString(), anyLong(), any()))
          .thenAnswer(
              invocation ->
                  tx.execute(
                      status ->
                          ((Function<GuidedSessionRepository.Session, ?>) invocation.getArgument(3))
                              .apply(current)));
      when(sessions.reconcileLateModelUsageLocked(any())).thenReturn(true);
      when(sessions.modelReservationFitsLocked(any(), anyInt(), anyInt())).thenReturn(true);
      when(store.currentAttempt(any(), anyString(), anyString(), anyLong(), any()))
          .thenReturn(true);
      when(store.claimSend(anyString(), anyString(), anyString(), any())).thenReturn(true);
      when(store.reserveAttempt(
              any(),
              anyString(),
              anyInt(),
              anyString(),
              anyString(),
              anyLong(),
              anyInt(),
              anyInt(),
              anyString(),
              any()))
          .thenAnswer(
              invocation -> {
                String attempt = UUID.randomUUID().toString();
                state.putObject("activeAttempt").put("attemptId", attempt);
                ObjectNode identity = C.object().put("sessionId", id).put("attemptId", attempt);
                if (!send) {
                  identity.put("status", "APPLIED");
                  identity
                      .putObject("result")
                      .put("kind", "NEXT_ACTION")
                      .put("status", "ACTION")
                      .put("obligationId", "prior");
                }
                return new GuidedTranslationStore.Attempt(
                    attempt, "reserve-" + attempt, "settle-" + attempt, send, identity);
              });
      when(store.obligation(anyString(), eq("prior"))).thenReturn(C.object().put("prior", true));
      doAnswer(
              invocation -> {
                state.putNull("activeAttempt");
                return null;
              })
          .when(store)
          .finishAttempt(anyString(), anyString(), anyString(), any(), any(), any());
      // Round 053: a REJECTED finish carries the closed reason through the seven-argument form.
      doAnswer(
              invocation -> {
                state.putNull("activeAttempt");
                return null;
              })
          .when(store)
          .finishAttempt(anyString(), anyString(), anyString(), any(), any(), any(), any());
      var response =
          new GuidedModelResponse(
              code,
              code == GuidedModelResponse.Code.OK
                  ? C.object()
                      .put("status", "ACTION")
                      .put("label", DISTINCT_CANARIES.get(1))
                      .put("locator", DISTINCT_CANARIES.get(2))
                      .put("value", DISTINCT_CANARIES.get(3))
                  : null,
              4,
              5,
              DISTINCT_CANARIES.get(4));
      org.mockito.stubbing.Answer<GuidedModelResponse> answer =
          invocation -> {
            GuidedModelRequest request = invocation.getArgument(0);
            repairCounts.add(request.projection().document().path("repairCodes").size());
            onSend.run();
            return response;
          };
      when(gateway.propose(any(), any())).thenAnswer(answer);
      when(gateway.propose(any(), any(), any())).thenAnswer(answer);
      service =
          new GuidedTranslationService(
              sessions,
              repository,
              store,
              null,
              null,
              gateway,
              C,
              prompts,
              null,
              null,
              null,
              new GuidedTranslationProperties(
                  true, true, List.of(), List.of(), 131072, 4096, 20, "worker"),
              Clock.systemUTC());
      try {
        var field = GuidedTranslationService.class.getDeclaredField("refusalDiagnostics");
        field.setAccessible(true);
        field.set(
            service,
            enabled
                ? new GuidedRefusalDiagnostics(events::add)
                : GuidedRefusalDiagnostics.disabled());
      } catch (Exception failure) {
        throw new AssertionError(failure);
      }
    }

    JsonNode call(ThrowingInput input) throws Throwable {
      return call(GuidedModelRequest.Kind.SOURCE_PLAN, capture -> input.get());
    }

    JsonNode call(GuidedModelRequest.Kind kind, CapturedInput input) throws Throwable {
      Class<?> application =
          Class.forName(GuidedTranslationService.class.getName() + "$ModelApplication");
      Object callback =
          Proxy.newProxyInstance(
              application.getClassLoader(),
              new Class<?>[] {application},
              (proxy, method, args) -> input.get((GuidedRefusalDiagnostics.Capture) args[3]));
      var method =
          GuidedTranslationService.class.getDeclaredMethod(
              "call",
              org.springframework.security.core.Authentication.class,
              String.class,
              long.class,
              String.class,
              GuidedModelRequest.Kind.class,
              application);
      method.setAccessible(true);
      try {
        return (JsonNode)
            method.invoke(service, null, id, 1L, DISTINCT_CANARIES.get(0), kind, callback);
      } catch (InvocationTargetException failure) {
        throw failure.getCause();
      }
    }
  }

  private interface CapturedInput {
    JsonNode get(GuidedRefusalDiagnostics.Capture capture) throws Throwable;
  }

  private interface ThrowingInput {
    JsonNode get() throws Throwable;
  }
}
