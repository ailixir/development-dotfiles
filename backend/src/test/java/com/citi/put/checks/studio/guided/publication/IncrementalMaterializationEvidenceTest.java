package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Private SQL-adapter reconstruction tests; database immutability and browser proof are separate.
 */
class IncrementalMaterializationEvidenceTest {
  private static final GuidedContracts C = new GuidedContracts();

  private record Fixture(
      JsonNode basis,
      JsonNode privateInputs,
      List<Map<String, Object>> inputs,
      List<Map<String, Object>> versions,
      Map<String, Object> current,
      org.springframework.jdbc.core.JdbcTemplate jdbc) {}

  private Fixture fixture() throws Exception {
    JsonNode all =
        C.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    JsonNode vector = null;
    for (JsonNode candidate : all.path("incrementalContracts").path("basisCases")) {
      if (candidate.path("name").asText().equals("appendedHistorical")) {
        vector = candidate;
      }
    }
    assertThat(vector).isNotNull();
    JsonNode basis = vector.path("basis"), evidence = basis.path("materializationEvidence");
    JsonNode privateInputs = vector.path("authority").path("privateInputs");
    List<Map<String, Object>> inputs = new ArrayList<>(), versions = new ArrayList<>();
    for (JsonNode entry : evidence.path("entries")) {
      var row = new HashMap<String, Object>();
      row.put("input_ordinal", entry.path("inputOrdinal").asInt());
      row.put("input_id", entry.path("inputId").asText());
      row.put("introduced_revision", entry.path("introducedContextRevision").asInt());
      row.put(
          "document",
          privateInputs.path("inputs").get(entry.path("inputOrdinal").asInt()).toString());
      inputs.add(row);
    }
    for (JsonNode header : evidence.path("versions")) {
      var row = new HashMap<String, Object>();
      for (var field :
          Map.of(
                  "context_revision",
                  "contextRevision",
                  "owner_fence",
                  "ownerFence",
                  "materialization_revision",
                  "birthMaterializationRevision",
                  "input_count",
                  "inputCount")
              .entrySet()) {
        row.put(field.getKey(), header.path(field.getValue()).asInt());
      }
      for (var field :
          Map.of(
                  "context_id",
                  "contextId",
                  "scope_hash",
                  "scopeHash",
                  "worker_id",
                  "workerId",
                  "source_revision",
                  "sourceRevision",
                  "configuration_revision",
                  "configurationRevision",
                  "authored_inputs_hash",
                  "authoredInputsHash")
              .entrySet()) {
        row.put(field.getKey(), header.path(field.getValue()).asText());
      }
      row.put(
          "previous_inputs_hash",
          header.path("previousInputsHash").isNull()
              ? null
              : header.path("previousInputsHash").asText());
      ObjectNode identity = privateInputs.deepCopy();
      identity.remove("inputs");
      row.put("authored_inputs_identity", identity.toString());
      versions.add(row);
    }
    var current = new HashMap<String, Object>();
    current.put("context_revision", versions.size());
    current.put("authored_inputs_hash", basis.path("authoredInputsHash").asText());
    current.put("authored_inputs", privateInputs.toString());
    var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
    String id = basis.path("sessionId").asText();
    when(jdbc.queryForList(anyString(), eq(id)))
        .thenAnswer(
            call -> {
              String sql = call.getArgument(0);
              if (sql.contains("studio_guided_materialization_inputs")) {
                return inputs;
              }
              if (sql.contains("studio_guided_materialization_versions")) {
                return versions;
              }
              throw new AssertionError("Unaccounted evidence query: " + sql);
            });
    when(jdbc.queryForMap(anyString(), eq(id))).thenReturn(current);
    return new Fixture(basis, privateInputs, inputs, versions, current, jdbc);
  }

  @Test
  void reconstructsEveryPrivateHistoricalEnvelopeAndExportsOnlyMetadata() throws Exception {
    Fixture f = fixture();
    JsonNode result =
        new GuidedMaterializationEvidence(f.jdbc(), C).read(f.basis().path("sessionId").asText());
    assertThat(result).isEqualTo(f.basis().path("materializationEvidence"));
    for (JsonNode entry : result.path("entries")) {
      assertThat(entry.path("metadata").has("value")).isFalse();
    }
    ObjectNode first = GuidedMaterializationEvidence.versionContext(C, result, 1);
    ObjectNode last = GuidedMaterializationEvidence.versionContext(C, result, 2);
    assertThat(first.path("inputs").size()).isLessThan(last.path("inputs").size());
    assertThat(first.path("authoredInputsHash")).isNotEqualTo(last.path("authoredInputsHash"));
  }

  @Test
  void alteredPrivateValueCannotKeepTheOriginalEntryAndHeaderHash() throws Exception {
    Fixture f = fixture();
    ObjectNode changed = (ObjectNode) C.parse((String) f.inputs().getFirst().get("document"));
    changed.put("value", changed.path("value").asText() + "-forged");
    f.inputs().getFirst().put("document", changed.toString());
    assertThatThrownBy(
            () ->
                new GuidedMaterializationEvidence(f.jdbc(), C)
                    .read(f.basis().path("sessionId").asText()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
  }

  @Test
  void historicalEnvelopeCannotUseTheLatestInputsHashOrSkipAnOrdinal() throws Exception {
    Fixture f = fixture();
    f.versions()
        .getFirst()
        .put("authored_inputs_hash", f.basis().path("authoredInputsHash").asText());
    assertThatThrownBy(
            () ->
                new GuidedMaterializationEvidence(f.jdbc(), C)
                    .read(f.basis().path("sessionId").asText()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
    Fixture gap = fixture();
    gap.inputs().getFirst().put("input_ordinal", 1);
    assertThatThrownBy(
            () ->
                new GuidedMaterializationEvidence(gap.jdbc(), C)
                    .read(gap.basis().path("sessionId").asText()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
  }

  @Test
  void headerIdentityAndCurrentPointerMustMatchReconstructedHistory() throws Exception {
    Fixture foreign = fixture();
    foreign.versions().getLast().put("context_id", "foreign-context");
    assertThatThrownBy(
            () ->
                new GuidedMaterializationEvidence(foreign.jdbc(), C)
                    .read(foreign.basis().path("sessionId").asText()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
    Fixture stale = fixture();
    stale.current().put("context_revision", 1);
    assertThatThrownBy(
            () ->
                new GuidedMaterializationEvidence(stale.jdbc(), C)
                    .read(stale.basis().path("sessionId").asText()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("EVIDENCE_MISMATCH");
  }
}
