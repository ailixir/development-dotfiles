package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.citi.put.checks.studio.guided.translation.*;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.Method;
import java.time.Clock;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.mock.mockito.SpyBean;

/** Delays a genuine owning-worker callback, without manufacturing evidence or DB authority. */
class GuidedBootstrapCallbackQAProbeR2Test extends GuidedPlanningIntegrationTest {
  @SpyBean(name="sessions") GuidedSessionService observedSessions;
  String id;
  private Object invokeBase(String name,Class<?>[] types,Object... args) throws Exception {
    Method m=GuidedPlanningIntegrationTest.class.getDeclaredMethod(name,types);m.setAccessible(true);
    try{return m.invoke(this,args);}catch(java.lang.reflect.InvocationTargetException e){throw (Exception)e.getCause();}
  }
  private ObjectNode command() throws Exception {return (ObjectNode)invokeBase("command",new Class<?>[]{String.class},id);}
  private GuidedTranslationService coordinator(GuidedDispatchService bridge) {
    var s=new GuidedTranslationService(sessions,repository,store,questions,bridge,gateway,C,new GuidedPromptAssembler(C),inputs,
      new GuidedProposalValidator(C),new GuidedDependencyPlanner(sessions),properties,Clock.systemUTC());s.installDatabase(jdbc);return s;
  }
  @AfterEach void cancelProbe(){if(id!=null)try{sessions.failTranslation(fixture.controller,id,1,"INVALID_CONTRACT");}catch(RuntimeException ignored){}}
  @Test void delayedOldBootstrapDoesNotAttestLaterAllocationsWithoutMetadataDelivery() throws Exception {
    id=(String)invokeBase("startSession",new Class<?>[]{});
    doAnswer(inv->{inv.callRealMethod();throw new AssertionError("stop-after-materialization");})
      .when(observedSessions).materialize(any(),eq(id),anyLong(),anyString(),any());
    assertThatThrownBy(()->translation.plan(fixture.controller,id,0,UUID.randomUUID().toString(),command()))
      .hasMessage("stop-after-materialization");
    doCallRealMethod().when(observedSessions).materialize(any(),eq(id),anyLong(),anyString(),any());
    assertThat(sessions.runnerContext(fixture.controller,id,1).path("allocations")).isEmpty();
    CountDownLatch callbackArrived=new CountDownLatch(1),releaseCallback=new CountDownLatch(1);
    doAnswer(inv->{callbackArrived.countDown();assertThat(releaseCallback.await(10,TimeUnit.SECONDS)).isTrue();return inv.callRealMethod();})
      .when(observedSessions).bootstrap(any(),eq(id),anyLong(),anyString(),any());
    try(var worker=Executors.newSingleThreadExecutor()) {
      var oldDelivery=worker.submit(()->dispatch.pushContext(fixture.controller,id,1));
      try {
        assertThat(callbackArrived.await(10,TimeUnit.SECONDS)).isTrue();
        var stopBeforeNewDelivery=spy(dispatch);
        doThrow(new AssertionError("stop-before-new-metadata"))
          .when(stopBeforeNewDelivery).pushContext(any(),eq(id),eq(1L));
        assertThatThrownBy(()->coordinator(stopBeforeNewDelivery).plan(fixture.controller,id,1,UUID.randomUUID().toString(),command()))
          .hasMessage("stop-before-new-metadata");
        JsonNode pending=repository.transaction(()->repository.lock(id).progress().path("translationBootstrap").deepCopy());
        assertThat(pending.path("phase").asText()).isEqualTo("CONTEXT_PENDING");
        assertThat(pending.path("metadataAcknowledgement").isMissingNode()).isTrue();
        assertThat(sessions.runnerContext(fixture.controller,id,1).path("allocations")).hasSize(1);
        releaseCallback.countDown();
        oldDelivery.get(10,TimeUnit.SECONDS);
        assertThat(repository.transaction(()->repository.lock(id).progress().path("executionEvidence").path("kind").asText())).isEqualTo("initialBlank");
        var delivered=spy(dispatch);
        coordinator(delivered).plan(fixture.controller,id,1,UUID.randomUUID().toString(),command());
        // Original callback came from context with zero bindings; READY needs current metadata ACK.
        assertThat(repository.transaction(()->repository.lock(id).progress().path("translationBootstrap").path("phase").asText())).isEqualTo("READY");
        long deliveries=mockingDetails(delivered).getInvocations().stream()
          .filter(i->i.getMethod().getName().equals("pushContext")).count();
        java.nio.file.Files.writeString(java.nio.file.Path.of("../docs/qa/evidence/STUDIO-OBS-005/independent-review-r2/delayed-callback-observation.json"),
          C.object().put("initialDeliveredAllocations",0).put("pendingAllocations",1)
            .put("actualPhaseAfterFinalMetadataAck","READY")
            .put("newMetadataDeliveries",deliveries).put("sourcePlanCalls",PROVIDER_KINDS.size())
            .put("evidenceOrigin","actual owning-worker mTLS callback; delayed before production commit")
            .put("syntheticEvidenceOrDbAuthorityInserted",false).toPrettyString());
        verify(delivered,times(1)).pushContext(any(),eq(id),eq(1L));
        JsonNode ready=repository.transaction(()->repository.lock(id).progress().path("translationBootstrap").deepCopy());
        assertThat(ready.path("metadataAcknowledgement").path("contextHash").asText()).isEqualTo(GuidedContracts.hash(pending.path("context")));
        assertThat(sessions.runnerContext(fixture.controller,id,1).path("contextId")).isEqualTo(pending.path("context").path("contextId"));
        assertThat(repository.transaction(()->repository.actions(id))).isEmpty();
        assertThat(NAVIGATION_DESTINATIONS).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='bootstrap'",Integer.class,id)).isEqualTo(1);
        assertThat(PROVIDER_KINDS).containsExactly("SOURCE_PLAN");
      } finally {releaseCallback.countDown();}
    }
  }
  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(strings={"source","configuration","pins","fence","lease","cancel"})
  void currentAuthorityMismatchAfterRealMetadataAckCannotGrantReady(String mutation) throws Exception {
    id=(String)invokeBase("startSession",new Class<?>[]{});
    var pinChanged=new java.util.concurrent.atomic.AtomicBoolean();
    var prompts=spy(new GuidedPromptAssembler(C));
    ObjectNode originalPins=prompts.schemaProvenance();
    doAnswer(inv->pinChanged.get()?originalPins.deepCopy().put("outputContractHash","e".repeat(64)):originalPins.deepCopy())
      .when(prompts).schemaProvenance();
    var bridge=spy(dispatch);
    doAnswer(inv->{
      assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
      Object ack=inv.callRealMethod();
      switch(mutation) {
        case "source" -> jdbc.update("UPDATE ui_tests SET source_revision=source_revision+1 WHERE id=?",testId);
        case "configuration" -> jdbc.update("UPDATE ui_tests SET configuration_revision=configuration_revision+1 WHERE id=?",testId);
        case "pins" -> pinChanged.set(true);
        case "cancel" -> sessions.cancel(fixture.user,id,"qa-cancel",C.object().put("schemaVersion",2).put("reason","userRequested"));
        default -> repository.transaction(()-> {
          var s=repository.lock(id);
          if(mutation.equals("fence"))s.document().withObject("/owner").put("fence",2);
          else s.document().withObject("/owner").put("leaseExpiresAt",java.time.Instant.now().minusSeconds(1).toString());
          repository.save(s);return null;
        });
      }
      return ack;
    }).when(bridge).pushContext(any(),eq(id),eq(1L));
    var service=new GuidedTranslationService(sessions,repository,store,questions,bridge,gateway,C,prompts,inputs,
      new GuidedProposalValidator(C),new GuidedDependencyPlanner(sessions),properties,Clock.systemUTC());service.installDatabase(jdbc);
    assertThatThrownBy(()->service.plan(fixture.controller,id,0,java.util.UUID.randomUUID().toString(),command()))
      .isInstanceOf(GuidedSessionException.class);
    JsonNode marker=repository.transaction(()->repository.lock(id).progress().path("translationBootstrap").deepCopy());
    assertThat(marker.path("phase").asText()).isEqualTo("CONTEXT_PENDING");
    assertThat(marker.path("metadataAcknowledgement").isMissingNode()).isTrue();
    assertThat(PROVIDER_KINDS).containsExactly("SOURCE_PLAN");
    assertThat(NAVIGATION_DESTINATIONS).isEmpty();
    assertThat(repository.transaction(()->repository.actions(id))).isEmpty();
    verify(bridge,times(1)).pushContext(any(),eq(id),eq(1L));
  }

}
