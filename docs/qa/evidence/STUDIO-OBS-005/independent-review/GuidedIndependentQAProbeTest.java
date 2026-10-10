package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.citi.put.checks.studio.guided.translation.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.Method;
import java.nio.file.*;
import java.net.URI;
import java.time.Clock;
import java.util.UUID;
import javax.net.ssl.SSLContext;
import org.junit.jupiter.api.*;

/** Independent adversarial probes; production sources remain unchanged. */
class GuidedIndependentQAProbeTest extends GuidedPlanningIntegrationTest {
  private String currentId;
  private Object invokePrivate(String name, Class<?>[] types, Object... args) throws Exception {
    Method method = GuidedPlanningIntegrationTest.class.getDeclaredMethod(name, types);
    method.setAccessible(true);
    try { return method.invoke(this,args); }
    catch (java.lang.reflect.InvocationTargetException e) { throw (Exception)e.getCause(); }
  }
  private String start() throws Exception {
    currentId=(String)invokePrivate("startSession",new Class<?>[]{}); return currentId;
  }
  private ObjectNode cmd(String id) throws Exception {
    return (ObjectNode)invokePrivate("command",new Class<?>[]{String.class},id);
  }
  private JsonNode post(String suffix, JsonNode body) throws Exception {
    return (JsonNode)invokePrivate("publicPost",new Class<?>[]{String.class,JsonNode.class},suffix,body);
  }
  private GuidedTranslationService service(GuidedSessionService s, GuidedLlmGatewayClient g) {
    var v=new GuidedTranslationService(s,repository,store,questions,dispatch,g,C,
      new GuidedPromptAssembler(C),inputs,new GuidedProposalValidator(C),
      new GuidedDependencyPlanner(s),properties,Clock.systemUTC()); v.installDatabase(jdbc);return v;
  }
  @AfterEach void cancelProbe() {
    if(currentId!=null) try { sessions.failTranslation(fixture.controller,currentId,1,"INVALID_CONTRACT"); }
    catch(RuntimeException ignored) {}
  }
  @Test void selectedSourceCannotBeIncludedUnusedWhileAnotherDestinationIsExecuted() throws Exception {
    askSource=true; String id=start();
    translation.plan(fixture.controller,id,0,UUID.randomUUID().toString(),cmd(id));
    JsonNode question=(JsonNode)invokePrivate("publicGet",new Class<?>[]{String.class},"/"+id+"/clarification");
    post("/"+id+"/clarify",C.object().put("schemaVersion",2)
      .put("clarificationId",question.path("clarificationId").asText()).put("generation",0)
      .put("choiceId",question.path("choices").get(1).path("choiceId").asText()));
    JsonNode selected=repository.transaction(()->questions.selected(id,question.path("clarificationId").asText()));
    GuidedLlmGatewayClient malicious=(request,budget)-> {
      var response=gateway.propose(request,budget);
      ObjectNode proposal=(ObjectNode)response.proposal();
      if(request.kind()==GuidedModelRequest.Kind.SOURCE_PLAN && proposal!=null && proposal.has("sourceReferences")) {
        proposal.withArray("sourceReferences").add(selected);
        return new GuidedModelResponse(response.code(),proposal,response.inputTokens(),response.outputTokens(),response.providerModel());
      } return response;
    };
    service(sessions,malicious).plan(fixture.controller,id,1,UUID.randomUUID().toString(),cmd(id));
    ObjectNode accepted=repository.transaction(()->store.state(id));
    JsonNode nav=accepted.path("plan").path("obligations").get(0);
    JsonNode used=accepted.path("plan").path("sourceReferences").get(nav.path("referenceIndex").asInt());
    assertThat(used).as("Accepted navigation must use the exact source chosen by the user, not merely include it unused").isEqualTo(selected);
  }
  @Test void actualCoordinatorResumesAcceptedPlanBeforeMaterialization() throws Exception {
    String id=start(); var interrupted=spy(sessions);
    doThrow(new IllegalStateException("simulated-process-stop-before-materialization"))
      .when(interrupted).materialize(any(),eq(id),anyLong(),anyString(),any());
    assertThatThrownBy(()->service(interrupted,gateway).plan(fixture.controller,id,0,UUID.randomUUID().toString(),cmd(id)))
      .hasMessage("simulated-process-stop-before-materialization");
    assertThat(repository.transaction(()->store.state(id).path("continuation").asText())).isEqualTo("MATERIALIZE");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",Integer.class,id)).isZero();
    int calls=PROVIDER_BYTES.size();
    SSLContext previous=SSLContext.getDefault();
    Path token=Files.createTempFile("qa-controller-token-", ".txt");
    Files.writeString(token,Environment.token("backend-controller","controller-1","studio-guided-controller"));
    try {
      SSLContext.setDefault(Environment.TLS);
      var coordinator=new GuidedTranslationCoordinator(store,repository,C,URI.create("https://localhost:"+port),token);
      coordinator.continueRuns();
    } finally { SSLContext.setDefault(previous);Files.deleteIfExists(token); }
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",Integer.class,id))
      .as("Real persisted continuation must resume materialization before requesting a next action; provider calls before=%s after=%s",calls,PROVIDER_BYTES.size()).isEqualTo(1);
  }
  @Test void lateOverageCommittedBeforeFreshReservationBlocksTheActualNextProviderSend() throws Exception {
    String id=start();
    translation.plan(fixture.controller,id,0,UUID.randomUUID().toString(),cmd(id));
    String attempt=repository.transaction(()-> {
      var current=repository.lock(id);
      long revision=store.state(id).path("planRevision").asLong();
      var pending=store.reserveAttempt(current.document(),"old-unknown-call",1,"NEXT_ACTION",
        "d".repeat(64),revision,100,100,"old-coordinator",java.time.Instant.now().plusSeconds(20));
      sessions.reserveModel(fixture.controller,id,1,pending.reservationKey(),100,100);
      assertThat(store.claimSend(id,pending.attemptId(),"old-coordinator",java.time.Instant.now())).isTrue();
      sessions.settleModel(fixture.controller,id,1,pending.settlementKey(),pending.reservationKey(),null,null);
      store.finishAttempt(id,pending.attemptId(),"UNKNOWN_CALL",null,null,null);
      return pending.attemptId();
    });
    var instrumented=spy(sessions);
    doAnswer(invocation->{
      Object result=invocation.callRealMethod();
      // Concurrent old response commits after entry reconciliation and before the new reservation.
      repository.transaction(()->{repository.lock(id);store.recordLateUsage(id,attempt,200000,100);return null;});
      return result;
    }).when(instrumented).reconcileLateModelUsage(any(),eq(id),eq(1L));
    int before=PROVIDER_BYTES.size();
    try { service(instrumented,gateway).advance(fixture.controller,id,1,UUID.randomUUID().toString(),cmd(id)); }
    catch(GuidedSessionException expectedRefusal) {}
    assertThat(PROVIDER_BYTES.size()).as("Already committed known overage must be reconciled atomically before a fresh actual provider request").isEqualTo(before);
  }

}
