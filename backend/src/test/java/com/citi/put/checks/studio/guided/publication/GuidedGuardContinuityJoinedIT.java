package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.ContextualDefault;
import com.citi.put.checks.studio.dto.DefaultVariableValue;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** SOURCE_PLAN, source authority and the browser's physical predecessor are exercised together. */
class GuidedGuardContinuityJoinedIT extends GuidedJoinedSupport {
  private static final String COPIED = "Public encyclopedia query 49831";
  private static final String SAVED = "Private query canary 61748";
  private static final String HIDDEN_RECEIVER =
      "Private receiver canary 92814 Search receiving area trailing";

  @Test
  void wikipediaSourcePlanCopiedFillSeparateEnterPassesIntentAndP1() throws Exception {
    ContinuityRun run = copiedSearch();
    JsonNode inherited = inheritedPreparation(run.evidence());
    assertThat(inherited.path("proposal").path("coordinate").path("stepId").asText())
        .isEqualTo(stepIds.get(3));
    assertInheritanceJoins(run.evidence());
    assertThat(run.evidence().path("materializationEvidence").path("versions")).isNotEmpty();
    int models = modelRequests.size();
    Published published = complete(run.testId(), run.session());
    assertThat(events.stream().filter("enter"::equals).count()).isEqualTo(4);
    assertThat(modelRequests).hasSize(models);
    assertThat(published.artifact().toString()).doesNotContain(COPIED, "backendNodeId");
    assertThat(published.artifact().path("learnedPlan").path("actions")).isNotEmpty();
  }

  @Test
  void savedInputOnlyPreviousCorrespondencePublishesWithoutPrivateExport() throws Exception {
    ContinuityRun run = savedSearch();
    assertInheritanceJoins(run.evidence());
    JsonNode witness = authenticBasis(run).path("guardAuthorizations");
    assertThat(witness).hasSize(1);
    assertThat(witness.get(0).path("predecessorGrounding").path("source").path("kind").asText())
        .isEqualTo("SAVED_INPUT");
    // RECEIVER is inherited from global context but is never selected as an executable argument.
    // Its same-step lexical authorization must survive UNMATERIALIZED status.
    assertThat(
            witness
                .get(0)
                .path("predecessorGrounding")
                .path("source")
                .path("declarationId")
                .asText())
        .isEqualTo("RECEIVER");
    List<String> receiverReferences = new ArrayList<>();
    for (JsonNode reference :
        run.evidence().path("sourceManifest").path("configurationReferences")) {
      if (reference.path("referenceName").asText().equals("RECEIVER")) {
        receiverReferences.add(reference.path("referenceId").asText());
      }
    }
    assertThat(receiverReferences).isNotEmpty();
    assertThat(run.evidence().path("materialization").path("inputs"))
        .noneMatch(
            input ->
                receiverReferences.contains(input.path("provenance").path("referenceId").asText()));
    Published published = complete(run.testId(), run.session());
    assertThat(published.artifact().toString())
        .doesNotContain(SAVED, HIDDEN_RECEIVER, "backendNodeId");
    assertThat(modelRequests.stream().map(JsonNode::toString).toList())
        .noneMatch(value -> value.contains(SAVED) || value.contains(HIDDEN_RECEIVER));
    assertThat(events.stream().filter("enter"::equals).count()).isEqualTo(4);
  }

  @Test
  void sameLabelPhysicalReplacementAndNavigationRefuseBeforeNativeEnter() throws Exception {
    for (String mutation : List.of("replace", "navigate")) {
      reset();
      configureCopiedSearch();
      mutationAfterFill = mutation;
      UUID test = source(copiedTexts(), Map.of());
      String session = learn(test);
      JsonNode terminal = awaitTerminal(session);
      assertThat(terminal.path("state").asText()).isEqualTo("FAILED");
      assertThat(mutationTimeline)
          .startsWith(
              "FILL_CALLBACK_COMMITTED", "BROWSER_MUTATION_ACKNOWLEDGED", "FRESH_PRESS_PLAN");
      assertThat(mutationAcks.get()).as("real browser acknowledged mutation").isPositive();
      assertThat(events.stream().filter("fill"::equals).count()).isEqualTo(1);
      assertThat(events).doesNotContain("enter");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?",
                  Integer.class,
                  session,
                  stepIds.get(3)))
          .as("no press admission or dispatch fence")
          .isZero();
      if (mutation.equals("replace")) {
        assertThat(pageFacts)
            .anySatisfy(
                fact -> {
                  assertThat(fact.path("replacement").asBoolean()).isTrue();
                  assertThat(fact.path("sameLabel").asBoolean()).isTrue();
                  assertThat(fact.path("oldDisconnected").asBoolean()).isTrue();
                  assertThat(fact.path("newConnected").asBoolean()).isTrue();
                });
      }
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publications WHERE session_id=?",
                  Integer.class,
                  session))
          .isZero();
      JsonNode evidence = runtime.evidence(session);
      assertThat(evidence.path("actions"))
          .noneMatch(
              action ->
                  action.path("state").asText().equals("SUCCEEDED")
                      && action.path("operationKind").asText().equals("press"));
    }
  }

  @Test
  void coherentFalsePredecessorOrHiddenSourceWitnessNeverPublishes() throws Exception {
    ContinuityRun run = savedSearch();
    var repository = application.getBean(GuidedPublicationEvidenceRepository.class);
    var bases = application.getBean(GuidedPublicationBaseRepository.class);
    var builder = new GuidedPlanBuilder(CONTRACTS);
    sessions.transaction(
        () -> {
          var base = bases.find(run.session()).orElseThrow();
          var source = bases.lockCurrent(run.testId());
          var original = repository.read(run.session());
          JsonNode session = sessions.lock(run.session()).document();
          JsonNode provenance =
              builder.learningProvenance(original.document().path("sourceManifest"));
          ObjectNode genuine = builder.basis(base, source, original, session, provenance);
          assertThat(genuine.path("guardAuthorizations")).hasSize(1);
          // A serialization round trip cannot recreate the nonserializable source capability.
          ObjectNode serialized = original.document().deepCopy();
          serialized.set("guardAuthorizations", genuine.path("guardAuthorizations"));
          assertThatThrownBy(
                  () ->
                      builder.basis(
                          base,
                          source,
                          new PublicationContracts.Evidence(serialized),
                          session,
                          provenance))
              .hasMessage("EVIDENCE_MISMATCH");

          // Change the predecessor identity consistently everywhere it occurs, including the
          // offered
          // inheritance and lineage witnesses. A fresh public hash is insufficient source
          // authority.
          String predecessor =
              inheritedPreparation(original.document())
                  .path("proof")
                  .path("pressInheritance")
                  .path("predecessorAdmissionId")
                  .asText();
          assertThat(predecessor).isNotBlank();
          String replacement = UUID.randomUUID().toString();
          ObjectNode coherent =
              CONTRACTS
                  .parse(
                      original
                          .document()
                          .toString()
                          .replace("\"" + predecessor + "\"", "\"" + replacement + "\""))
                  .deepCopy();
          for (JsonNode prepared : coherent.path("preparations")) {
            ObjectNode proof = (ObjectNode) prepared.path("proof");
            if (proof.path("pressInheritance").isObject()) {
              assertThat(proof.path("pressInheritance").path("predecessorAdmissionId").asText())
                  .isEqualTo(replacement);
            }
          }
          for (JsonNode action : coherent.path("actions")) {
            JsonNode proof = null;
            for (JsonNode prepared : coherent.path("preparations")) {
              if (prepared.path("preparationId").equals(action.path("preparationId"))) {
                proof = prepared.path("proof");
              }
            }
            assertThat(proof).isNotNull();
            ObjectNode decision = CONTRACTS.object();
            decision.set("scopeHash", session.path("scopeHash"));
            decision.set("preparation", proof);
            decision.set("requestDigest", action.path("requestDigest"));
            ((ObjectNode) action.path("admission"))
                .put("policyDecisionHash", GuidedContracts.hash(decision));
          }
          assertThat(GuidedContracts.hash(coherent))
              .isNotEqualTo(GuidedContracts.hash(original.document()));
          assertThatThrownBy(() -> original.sourceAuthority().requireFor(coherent))
              .hasMessage("EVIDENCE_MISMATCH");
          assertThatThrownBy(
                  () ->
                      builder.basis(
                          base,
                          source,
                          new PublicationContracts.Evidence(coherent, original.sourceAuthority()),
                          session,
                          provenance))
              .hasMessage("EVIDENCE_MISMATCH");
          return null;
        });
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_publications WHERE session_id=?",
                Integer.class,
                run.session()))
        .isZero();
    // The untouched real source still completes the whole publication/proof/replay lifecycle.
    complete(run.testId(), run.session());
    assertThat(events.stream().filter("enter"::equals).count()).isEqualTo(4);
  }

  private ContinuityRun copiedSearch() throws Exception {
    reset();
    configureCopiedSearch();
    UUID test = source(copiedTexts(), Map.of());
    String session = learn(test);
    runtime.awaitFinalizing(session);
    return new ContinuityRun(test, session, runtime.evidence(session));
  }

  private List<String> copiedTexts() {
    return List.of(
        "Open " + url(),
        "Copy Article keyword.",
        "Fill Search with that copied article keyword.",
        "Press Enter",
        "Check Search results is visible.");
  }

  private void configureCopiedSearch() {
    html = searchHtml("Search") + "<output aria-label='Article keyword'>" + COPIED + "</output>";
    script =
        List.of(
            Op.navigate(0, url()),
            Op.node(1, "read", "Article keyword", null, "status", "Article keyword", "query", null),
            Op.node(2, "fill", "Search", null, "textbox", "Search", "query", null),
            Op.node(3, "press", "Search", null, "textbox", "Search", null, null),
            Op.node(
                4, "assert", "Search results", null, "status", "Search results", null, "visible"));
  }

  private ContinuityRun savedSearch() throws Exception {
    reset();
    html = searchHtml("Search receiving area");
    script =
        List.of(
            Op.navigate(0, url()),
            Op.savedFill(1, "Search", "Search receiving area"),
            Op.node(2, "press", "Search", null, "textbox", "Search receiving area", null, null),
            Op.node(
                3, "assert", "Search results", null, "status", "Search results", null, "visible"));
    GlobalAuthoringContext global =
        new GlobalAuthoringContext(
            List.of(new ContextualDefault("receiver", new DefaultVariableValue("RECEIVER"))),
            List.of());
    UUID test =
        source(
            List.of(
                "Open " + url(),
                "Fill the receiving control with <var QUERY>.",
                "Press Enter",
                "Check Search results is visible."),
            Map.of("QUERY", SAVED, "RECEIVER", HIDDEN_RECEIVER),
            global);
    String session = learn(test);
    runtime.awaitFinalizing(session);
    return new ContinuityRun(test, session, runtime.evidence(session));
  }

  private String searchHtml(String label) {
    return "<main><h1>Encyclopedia search</h1><form onsubmit=\"event.preventDefault();"
        + "document.getElementById('result').hidden=false\"><input aria-label='"
        + label
        + "' oninput=\"eventOf('fill')\" onkeydown=\"if(event.key==='En"
        + "ter')eventOf('enter')\">"
        + "<button type='submit'>Find article</button></form>"
        + "<output id='result' aria-label='Search results' hidden>Resul"
        + "ts ready</output></main>";
  }

  private JsonNode authenticBasis(ContinuityRun run) {
    return sessions.transaction(
        () -> {
          var bases = application.getBean(GuidedPublicationBaseRepository.class);
          var evidence =
              application.getBean(GuidedPublicationEvidenceRepository.class).read(run.session());
          var builder = new GuidedPlanBuilder(CONTRACTS);
          return builder.basis(
              bases.find(run.session()).orElseThrow(),
              bases.lockCurrent(run.testId()),
              evidence,
              sessions.lock(run.session()).document(),
              builder.learningProvenance(evidence.document().path("sourceManifest")));
        });
  }

  private void assertInheritanceJoins(JsonNode evidence) {
    JsonNode prepared = inheritedPreparation(evidence),
        inheritance = prepared.path("proof").path("pressInheritance");
    String predecessorId = inheritance.path("predecessorAdmissionId").asText();
    List<JsonNode> predecessors = new ArrayList<>();
    for (JsonNode action : evidence.path("actions")) {
      if (action.path("admission").path("admissionId").asText().equals(predecessorId)) {
        predecessors.add(action);
      }
    }
    assertThat(predecessors).hasSize(1);
    assertThat(predecessors.getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
    assertThat(predecessors.getFirst().path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(prepared.path("proposal").path("operation").path("key").asText()).isEqualTo("Enter");
    assertThat(inheritance.toString()).doesNotContain(SAVED, HIDDEN_RECEIVER, "backendNodeId");
    assertThat(events.stream().filter("enter"::equals).count()).isEqualTo(1);
    assertThat(
            modelRequests.stream()
                .filter(request -> request.path("kind").asText().equals("SOURCE_PLAN"))
                .count())
        .isEqualTo(1);
  }

  private static JsonNode inheritedPreparation(JsonNode evidence) {
    List<JsonNode> matches = new ArrayList<>();
    for (JsonNode preparation : evidence.path("preparations")) {
      if (preparation.path("proof").path("pressInheritance").isObject()) {
        matches.add(preparation);
      }
    }
    assertThat(matches).hasSize(1);
    return matches.getFirst();
  }

  private record ContinuityRun(UUID testId, String session, JsonNode evidence) {}
}
