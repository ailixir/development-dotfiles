package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class GuidedPreparationJoinTest {

  @Test
  void exactPreparationIdAndOperationJoinsRejectAlternateProof() {
    var c = new GuidedContracts();
    try (var pg = new TestPostgresDatabase()) {
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
  }
}
