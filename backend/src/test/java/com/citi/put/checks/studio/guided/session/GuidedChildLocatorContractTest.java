package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

class GuidedChildLocatorContractTest {
  @Test
  void currentOutcomeEpochValidatesBothCompleteNativeBranchesWithoutWidening() throws Exception {
    var c = new GuidedContracts();
    var fixtures =
        c.parse(
            java.nio.file.Files.readString(
                java.nio.file.Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    var ordinary = (ObjectNode) fixtures.path("documents").path("outcome").deepCopy();
    c.validate("v3/bridge#/definitions/outcome", ordinary);
    ordinary.putNull("pressInheritance");
    assertThatThrownBy(() -> c.validate("v3/bridge#/definitions/outcome", ordinary))
        .hasMessage("INVALID_CONTRACT");
    var publication =
        c.parse(
            java.nio.file.Files.readString(
                java.nio.file.Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    boolean checked = false;
    for (var row : publication.path("incrementalContracts").path("schemaCases")) {
      if (!row.path("name").asText().equals("pre-admission-drift")) {
        continue;
      }
      ObjectNode prefix = c.object().put("kind", "prefixDrift").putNull("ledger");
      prefix.set("receipt", row.path("value"));
      c.validate("v3/bridge#/definitions/outcome", prefix);
      prefix.put("foreign", true);
      assertThatThrownBy(() -> c.validate("v3/bridge#/definitions/outcome", prefix))
          .hasMessage("INVALID_CONTRACT");
      checked = true;
    }
    assertThat(checked).isTrue();
  }

  @Test
  void exactPreparationIdAndOperationJoinsRejectAlternateProof() {
    var c = new GuidedContracts();
    try (var pg = new PostgreSQLContainer<>("postgres:15-alpine")) {
      pg.start();
      var jdbc =
          new JdbcTemplate(
              new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()));
      // A query-boundary probe; forward-migration constraints are exercised by the migration ITs.
      jdbc.execute(
          "CREATE TABLE studio_guided_preparations(session_id text,preparation_id"
              + " text,request_digest text,admission_id text,expires_at timestamptz,proof jsonb)");
      ObjectNode context =
          c.object()
              .put("contextId", "context")
              .put("contextRevision", 1)
              .put("workerId", "worker")
              .put("ownerFence", 1)
              .put("scopeHash", "a".repeat(64))
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("authoredInputsHash", "b".repeat(64));
      context.putObject("versions").put("contract", 3);
      ObjectNode proposal = c.object().put("evidenceHash", "c".repeat(64));
      Instant now = Instant.now();
      context.put("contextRevision", 1L).put("ownerFence", 1L);
      assertThat(GuidedContracts.same(context, c.parse(context.toString()))).isTrue();
      String dbRoundTrip =
          jdbc.queryForObject("SELECT ?::jsonb::text", String.class, context.toString());
      assertThat(GuidedContracts.same(context, c.parse(dbRoundTrip))).isTrue();
      assertThat(GuidedContracts.same(context.path("contextRevision"), c.object().textNode("1")))
          .isFalse();
      assertThatThrownBy(
              () -> GuidedContracts.same(context.path("contextRevision"), c.parse("1.0")))
          .hasMessage("INVALID_CONTRACT");
      for (String id : java.util.List.of("A", "B")) {
        ObjectNode proof =
            context.deepCopy().put("preparationId", id).put("evidenceHash", "c".repeat(64));
        jdbc.update(
            "INSERT INTO studio_guided_preparations VALUES ('session',?,?,NULL,?,?::jsonb)",
            id,
            GuidedContracts.hash(proposal),
            Timestamp.from(now.plusSeconds(id.equals("A") ? 20 : 100)),
            proof.toString());
      }
      var store = new GuidedPreparationStore(jdbc, c);
      ObjectNode session = c.object().put("sessionId", "session");
      assertThat(
              store.authorize(session, proposal, context, "A", now).path("preparationId").asText())
          .isEqualTo("A");
      assertThatThrownBy(() -> store.authorize(session, proposal, context, "missing", now))
          .hasMessage("STALE_GENERATION");
      jdbc.update(
          "UPDATE studio_guided_preparations SET expires_at=? WHERE preparation_id='A'",
          Timestamp.from(now.minusSeconds(1)));
      assertThatThrownBy(() -> store.authorize(session, proposal, context, "A", now))
          .hasMessage("STALE_GENERATION");
      assertThat(
              store.authorize(session, proposal, context, "B", now).path("preparationId").asText())
          .isEqualTo("B");
    }
    ObjectNode observation =
        ObservationFixtures.observation()
            .readable("e1", "paragraph", "", "Public")
            .document("doc", 1)
            .build()
            .put("generation", 1);
    ObjectNode action = c.object();
    action
        .putObject("target")
        .put("kind", "node")
        .put("ref", "e1")
        .put("documentId", "doc")
        .put("generation", 1);
    action.putObject("operation").put("kind", "read");
    ObjectNode target = ObservationFixtures.resolvedTarget("unused", "paragraph", null);
    target.put("tier", "filterHas");
    var locator = target.putArray("locator");
    locator.addObject().put("by", "role").put("role", "region");
    locator
        .addObject()
        .put("by", "filterHas")
        .put("relation", "child")
        .putArray("has")
        .addObject()
        .put("by", "role")
        .put("role", "heading")
        .put("name", "About")
        .put("exact", true);
    locator.addObject().put("by", "role").put("role", "paragraph");
    c.validate("v3/locator", locator);
    ObjectNode proof = c.object();
    proof.set("target", target);
    GuidedPreparationCrossCheck.verify(action, proof, observation);
    action.withObject("/operation").put("kind", "click");
    assertThatThrownBy(() -> GuidedPreparationCrossCheck.verify(action, proof, observation))
        .hasMessage("EVIDENCE_MISMATCH");
  }
}
