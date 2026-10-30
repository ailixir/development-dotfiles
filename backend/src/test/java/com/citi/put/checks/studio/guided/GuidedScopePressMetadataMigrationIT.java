package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.support.ObservationFixtures;
import org.junit.jupiter.api.Test;

class GuidedScopePressMetadataMigrationIT {
  @Test
  void ordinalScopeCompletenessAndClosedPressMetadataRefuseDirectSqlMutation() {
    GuidedChildLocatorMigrationIT.database(
        jdbc -> {
          var observation =
              ObservationFixtures.observation()
                  .element("e1", "region", "Primary")
                  .element("e2", "button", "Open")
                  .element("e3", "button", "Open")
                  .build();
          for (int index = 2; index <= 3; index++) {
            var fact = observation.withObject("/facts/e" + index);
            fact.putObject("ordinal").put("index", index - 1).put("count", 2);
            fact.putArray("scopeRefs").add("e1");
          }
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      observation.toString()))
              .isTrue();
          var sparse = observation.deepCopy();
          sparse.withObject("/facts/e3").remove("ordinal");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      sparse.toString()))
              .isFalse();
          var privateSource = observation.deepCopy();
          privateSource.withObject("/facts/e1").put("nameComplete", false);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      privateSource.toString()))
              .isFalse();
          var missing = observation.deepCopy();
          missing.withObject("/facts/e2").remove("ownTextComplete");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      missing.toString()))
              .isFalse();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_press_metadata('null'::jsonb)", Boolean.class))
              .isTrue();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_press_metadata('{}'::jsonb)", Boolean.class))
              .isFalse();
          var metadata =
              new GuidedContracts()
                  .object()
                  .put("kind", "same-element-press")
                  .put("predecessorAdmissionId", "prior")
                  .put("predecessorRequestDigest", "a".repeat(64))
                  .put("predecessorOperationHash", "b".repeat(64))
                  .put("documentId", "doc");
          metadata.putObject("predecessorCoordinate").put("stepId", "step").put("ordinal", 0);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_press_metadata(?::jsonb)",
                      Boolean.class,
                      metadata.toString()))
              .isTrue();
          metadata.put("backendNodeId", 123);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_press_metadata(?::jsonb)",
                      Boolean.class,
                      metadata.toString()))
              .isFalse();
        });
  }

  @Test
  void genuinePreV32ProofBytesAndHashesSurviveForwardMigrationWithoutBackfill() throws Exception {
    try (var pg = new org.testcontainers.containers.PostgreSQLContainer<>("postgres:15-alpine")) {
      pg.start();
      var ds =
          new org.springframework.jdbc.datasource.DriverManagerDataSource(
              pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      org.flywaydb.core.Flyway.configure().dataSource(ds).target("31").load().migrate();
      var jdbc = new org.springframework.jdbc.core.JdbcTemplate(ds);
      var contracts = new GuidedContracts();
      var documents =
          contracts
              .parse(
                  java.nio.file.Files.readString(
                      java.nio.file.Path.of(
                          "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
              .path("documents");
      var session = documents.path("session");
      String id = session.path("sessionId").asText(), scope = session.path("scopeHash").asText();
      jdbc.update(
          "INSERT INTO"
              + " studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,expires_at,document)"
              + " VALUES (?,?,?,?,?,now()+interval '1 hour',?::jsonb)",
          id,
          session.path("testId").asText(),
          session.path("scope").path("principalId").asText(),
          scope,
          "OBSERVING",
          session.toString());
      var assignment = documents.path("assignment");
      jdbc.update(
          "INSERT INTO"
              + " studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,expected_fence,intent)"
              + " VALUES (?,?,?,?,?,?::jsonb)",
          id,
          assignment.path("assignmentId").asText(),
          scope,
          assignment.path("workerId").asText(),
          0,
          assignment.toString());
      var inputs =
          ((com.fasterxml.jackson.databind.node.ObjectNode) documents.path("inputs")).deepCopy();
      inputs.putArray("inputs");
      String inputsHash = GuidedContracts.hash(inputs);
      jdbc.update(
          "INSERT INTO studio_guided_materializations(session_id,scope_hash,conte"
              + ("xt_id,context_revision,materialization_revision,worker_id,owner_fence,")
              + ("source_revision,configuration_revision,authored_inputs_hash,authored_i")
              + ("nputs) VALUES (?,?,?,1,1,?,1,?,?,?,?::jsonb)"),
          id,
          scope,
          "context-1",
          "worker-1",
          inputs.path("sourceRevision").asText(),
          inputs.path("configurationRevision").asText(),
          inputsHash,
          inputs.toString());
      var proof =
          ((com.fasterxml.jackson.databind.node.ObjectNode) documents.path("preparation"))
              .deepCopy();
      proof.put("authoredInputsHash", inputsHash);
      jdbc.update(
          "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
              + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES (?,?,?,1,?,?")
              + ("::jsonb,now()+interval '1 hour')"),
          id,
          proof.path("preparationId").asText(),
          "context-1",
          proof.path("requestDigest").asText(),
          proof.toString());
      String before =
          jdbc.queryForObject(
              "SELECT proof::text||request_digest||studio_publication_hash(proof) FROM"
                  + " studio_guided_preparations WHERE session_id=?",
              String.class,
              id);
      org.flywaydb.core.Flyway.configure().dataSource(ds).load().migrate();
      assertThat(
              jdbc.queryForObject(
                  "SELECT proof::text||request_digest||studio_publication_hash(proof) FROM"
                      + " studio_guided_preparations WHERE session_id=?",
                  String.class,
                  id))
          .isEqualTo(before);
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "UPDATE studio_guided_preparations SET"
                          + " proof=proof||'{\"assertSourceBinding\":null}'::jsonb WHERE"
                          + " session_id=?",
                      id))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      var ordinary = proof.deepCopy().put("preparationId", "ordinary-after-v32");
      jdbc.update(
          "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
              + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES (?,?,?,1,?,?")
              + ("::jsonb,now()+interval '1 hour')"),
          id,
          ordinary.path("preparationId").asText(),
          "context-1",
          ordinary.path("requestDigest").asText(),
          ordinary.toString());
      var malformed = proof.deepCopy().put("preparationId", "null-is-not-omission");
      malformed.putNull("assertSourceBinding");
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "INSERT INTO studio_guided_preparations(session_id,preparation_id,conte"
                          + ("xt_id,owner_fence,request_digest,proof,expires_at) VALUES"
                              + " (?,?,?,1,?,?")
                          + ("::jsonb,now()+interval '1 hour')"),
                      id,
                      malformed.path("preparationId").asText(),
                      "context-1",
                      malformed.path("requestDigest").asText(),
                      malformed.toString()))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      assertThat(
              jdbc.queryForObject(
                  "SELECT proof::text||request_digest||studio_publication_hash(proof) FROM"
                      + " studio_guided_preparations WHERE session_id=? AND preparation_id=?",
                  String.class,
                  id,
                  proof.path("preparationId").asText()))
          .isEqualTo(before);
    }
  }

  @Test
  void forwardSqlClosesDirectTitleAndComparatorMetadataIndependentlyOfHashes() {
    GuidedChildLocatorMigrationIT.database(
        jdbc -> {
          var contracts = new GuidedContracts();
          var observation =
              ObservationFixtures.observation()
                  .element("e1", "paragraph", "")
                  .element("e2", "columnheader", "Python")
                  .element("e3", "link", "Designed by")
                  .build();
          var fact =
              observation
                  .withObject("/facts/e1")
                  .put("directTextAssertion", true)
                  .put("text", "domain examples")
                  .put("ownTextComplete", true);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      observation.toString()))
              .isTrue();
          for (var invalid :
              java.util.List.of(
                  contracts.parse("null"), contracts.parse("false"), contracts.parse("\"true\""))) {
            var changed = observation.deepCopy();
            changed.withObject("/facts/e1").set("directTextAssertion", invalid);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT studio_publication_observation_shape(?::jsonb)",
                        Boolean.class,
                        changed.toString()))
                .isFalse();
          }
          fact.remove("directTextAssertion");
          var scope =
              fact.putObject("readScope")
                  .put("relation", "SAME_ROW_LABEL")
                  .put("tableTitleRef", "e2");
          scope.putArray("sourceRefs").add("e2").add("e3");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      observation.toString()))
              .isTrue();
          for (String ref : java.util.List.of("e1", "e9", "null")) {
            scope.put("tableTitleRef", ref);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT studio_publication_observation_shape(?::jsonb)",
                        Boolean.class,
                        observation.toString()))
                .isFalse();
          }
          scope.putNull("tableTitleRef");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      observation.toString()))
              .isFalse();
          scope.put("tableTitleRef", "e2");
          scope.putArray("sourceRefs").add("e2").add("e2");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_publication_observation_shape(?::jsonb)",
                      Boolean.class,
                      observation.toString()))
              .isFalse();
          var proposal = contracts.object();
          proposal.putObject("target").put("kind", "node").put("ref", "e1");
          var op =
              proposal
                  .putObject("operation")
                  .put("kind", "assert")
                  .put("predicate", "containsText");
          op.putObject("expected").put("kind", "authoredLiteral").put("sourceInputId", "input");
          var proof = contracts.object();
          var reported =
              proof
                  .putObject("target")
                  .put("assertTextMode", "DIRECT_PUBLIC")
                  .put("tier", "testId");
          reported.putArray("locator").addObject().put("by", "testId").put("value", "paragraph");
          reported.putObject("identity").put("role", "paragraph").putNull("name");
          fact.remove("readScope");
          fact.put("directTextAssertion", true);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_assertion_metadata(?::jsonb,?::jsonb,?::jsonb)",
                      Boolean.class,
                      proposal.toString(),
                      proof.toString(),
                      observation.toString()))
              .isTrue();
          for (String predicate : java.util.List.of("visible", "url", "hasValue")) {
            op.put("predicate", predicate);
            assertThat(
                    jdbc.queryForObject(
                        "SELECT studio_wi6_assertion_metadata(?::jsonb,?::jsonb,?::jsonb)",
                        Boolean.class,
                        proposal.toString(),
                        proof.toString(),
                        observation.toString()))
                .isFalse();
          }
          op.put("predicate", "containsText");
          proof.withObject("/target").remove("assertTextMode");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_assertion_metadata(?::jsonb,?::jsonb,?::jsonb)",
                      Boolean.class,
                      proposal.toString(),
                      proof.toString(),
                      observation.toString()))
              .isFalse();
        });
  }
}
