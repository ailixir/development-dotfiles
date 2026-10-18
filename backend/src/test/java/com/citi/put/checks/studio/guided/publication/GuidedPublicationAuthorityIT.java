package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Real head PostgreSQL and current writer boundaries. Upstream learning/validator facts in the
 * relational fixture are controlled test inputs, not browser, native, model or authentication
 * proof.
 */
class GuidedPublicationAuthorityIT {
  private static final GuidedContracts C = new GuidedContracts();

  private static JsonNode fixtures() throws Exception {
    return C.parse(
        Files.readString(
            Path.of(
                "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
  }

  /** Controlled validator result, with actual stored reserve/claim/finish and current commit. */
  private static PublicationContracts.Commit prepareStored(
      GuidedPublicationMigrationTest.Database db, PublicationContracts.Base base) {
    var captured = db.snapshot(base);
    JsonNode basis = captured.basis();
    var profile = GuidedPublicationMigrationTest.currentProfile();
    var build = GuidedPublicationMigrationTest.observedBuild(profile);
    var candidate = new ObservedArtifactLowerer(C).lower(basis, profile);
    ObjectNode identity = captured.identity().deepCopy();
    identity
        .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
        .put("basisHash", GuidedContracts.hash(basis))
        .put("validationBuildHash", GuidedContracts.hash(build));
    for (String field :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash")) {
      identity.set(field, candidate.hashes().path(field));
    }
    var snapshot = new PublicationContracts.Snapshot(identity, basis);
    String id = db.fixtureSession(), digest = "b".repeat(64);
    var attempt =
        db.tx.execute(
            t ->
                db.publications.reserve(
                    new PublicationContracts.Claim(id, "b0-control", digest, snapshot),
                    Instant.now()));
    db.tx.executeWithoutResult(
        t ->
            db.publications.claim(
                id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now()));
    ObjectNode verdict =
        C.object()
            .put("schemaVersion", 3)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String field :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash")) {
      verdict.set(field, candidate.hashes().path(field));
    }
    verdict.set("profile", profile);
    verdict.set("build", build);
    db.tx.executeWithoutResult(
        t ->
            db.publications.finish(
                id,
                attempt.attemptId(),
                attempt.claimId(),
                snapshot.hash(),
                PublicationContracts.AttemptStatus.VALIDATED,
                verdict,
                null,
                Instant.now()));
    return new PublicationContracts.Commit(
        id,
        UUID.randomUUID(),
        attempt.attemptId(),
        attempt.claimId(),
        "b0-control",
        digest,
        snapshot,
        candidate,
        new PublicationContracts.Grant(
            id,
            base.document().path("originalPrincipalId").asText(),
            base.document().path("csiId").asText(),
            snapshot.hash(),
            attempt.validationDeadline()));
  }

  private static String durableSnapshot(GuidedPublicationMigrationTest.Database db) {
    ObjectNode out = C.object();
    for (String table :
        List.of(
            "ui_tests",
            "ui_test_revisions",
            "studio_guided_sessions",
            "studio_guided_publications",
            "studio_guided_publication_attempts",
            "studio_guided_actions",
            "studio_guided_preparations",
            "studio_guided_publication_preparations",
            "studio_guided_obligation_admissions",
            "studio_guided_publication_admissions",
            "studio_guided_allocations",
            "studio_guided_producers",
            "studio_guided_consumer_edges")) {
      out.set(
          table,
          C.parse(
              db.jdbc.queryForObject(
                  "SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM "
                      + table
                      + " t",
                  String.class)));
    }
    return GuidedContracts.canonical(out);
  }

  @Test
  @DisplayName("graphTimingConformance:raw-edge-cannot-name-pending-action")
  void rawEdgeCannotNamePendingActionAgainstActualStoredAuthority() throws Exception {
    JsonNode contract = fixtures(), attack = null, parent = null;
    for (JsonNode row : contract.path("graphTimingConformance").path("graphCases")) {
      if (row.path("name").asText().equals("raw-edge-cannot-name-pending-action")) {
        attack = row;
      }
      if (row.path("name").asText().equals("admitted-binding-replacement")) {
        parent = row;
      }
    }
    assertThat(attack).isNotNull();
    assertThat(parent).isNotNull();
    assertThat(attack.path("basis")).isEqualTo(parent.path("basis"));
    assertThat(
            new ObservedArtifactLowerer(C)
                .lower(attack.path("basis"), attack.path("expectedArtifact").path("profile"))
                .artifact())
        .as("the exact original public basis and candidate do not reveal the private pending row")
        .isEqualTo(attack.path("expectedArtifact"));
    JsonNode pendingSidecar =
        attack
            .path("authority")
            .path("ledgers")
            .get(attack.path("authority").path("ledgers").size() - 1);
    assertThat(pendingSidecar.path("state").asText()).isEqualTo("ADMITTED");
    assertThat(pendingSidecar.path("dispatchCount").asInt()).isZero();
    assertThat(pendingSidecar.path("admission").path("admissionId"))
        .isEqualTo(attack.path("basis").path("consumerEdges").get(0).path("consumerAdmissionId"));
    // One owned container; both test sessions use actual classifier/source/base and original
    // guarded setup. The second stops at its real pending admission, never reverses a terminal row.
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var control =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b0-control", contract.path("basis").deepCopy());
        var pending =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b0-pending", contract.path("basis").deepCopy())) {
      var controlBase = control.capture();
      control.finalizing();
      var command = prepareStored(control, controlBase);
      var published = control.tx.execute(t -> control.publications.commit(command, Instant.now()));
      assertThat(published).isNotNull();
      assertThat(control.publications.receipt(command.sessionId())).isPresent();
      var pendingBase = pending.capture();
      pending.preparePendingBindingConsumer();
      String id = pending.fixtureSession();
      assertThat(
              pending.jdbc.queryForObject(
                  "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id))
          .isEqualTo("FINALIZING");
      var joined =
          pending.jdbc.queryForList(
              "SELECT a.admission_id,a.document::text AS"
                  + " ledger_document,e.argument_slot,p.preparation_id,o.obligation_id,"
                  + "a.proposal::text AS action_proposal,e.document::text AS edge_document,al.document::text AS"
                  + " allocation_document,"
                  + "pr.document::text AS producer_document,pa.document::text AS producer_ledger,p.proof::text AS"
                  + " preparation_proof,"
                  + "p.request_digest,o.meaning::text AS obligation_meaning,o.proposal_digest,v.authored_inputs_hash"
                  + " AS version_hash"
                  + " FROM studio_guided_actions a JOIN studio_guided_consumer_edges e ON e.session_id=a.session_id"
                  + " AND e.consumer_admission_id=a.admission_id"
                  + " JOIN studio_guided_allocations al ON al.session_id=e.session_id AND al.binding_id=e.binding_id"
                  + " JOIN studio_guided_producers pr ON pr.session_id=e.session_id AND pr.binding_id=e.binding_id"
                  + " AND pr.admission_id=e.producer_admission_id"
                  + " JOIN studio_guided_actions pa ON pa.session_id=pr.session_id AND pa.admission_id=pr.admission_id"
                  + " JOIN studio_guided_preparations p ON p.session_id=a.session_id AND p.admission_id=a.admission_id"
                  + " JOIN studio_guided_obligation_admissions o ON o.session_id=a.session_id AND"
                  + " o.admission_id=a.admission_id"
                  + " JOIN studio_guided_materialization_versions v ON v.session_id=a.session_id AND"
                  + " v.context_revision=(a.document->>'contextRevision')::integer"
                  + " WHERE a.session_id=? AND a.document->>'state'='ADMITTED' AND a.document->>'dispatchCount'='0'",
              id);
      assertThat(joined).hasSize(1);
      var row = joined.getFirst();
      JsonNode actualPending = C.parse((String) row.get("ledger_document")),
          proposal = C.parse((String) row.get("action_proposal")),
          edge = C.parse((String) row.get("edge_document")),
          allocation = C.parse((String) row.get("allocation_document")),
          producer = C.parse((String) row.get("producer_document")),
          producerLedger = C.parse((String) row.get("producer_ledger")),
          proof = C.parse((String) row.get("preparation_proof")),
          meaning = C.parse((String) row.get("obligation_meaning"));
      assertThat(actualPending.path("attemptOrdinal").asInt()).isZero();
      assertThat(actualPending.path("preparationId").asText()).isEqualTo(row.get("preparation_id"));
      assertThat(proposal.path("operation").path("kind").asText()).isEqualTo("fill");
      assertThat(proposal.path("operation").path("value").path("kind").asText())
          .isEqualTo("binding");
      assertThat(proposal.path("coordinate")).isEqualTo(actualPending.path("coordinate"));
      assertThat(GuidedContracts.hash(proposal))
          .isEqualTo(actualPending.path("requestDigest").asText())
          .isEqualTo(row.get("request_digest"))
          .isEqualTo(row.get("proposal_digest"));
      assertThat(actualPending.path("authoredInputsHash").asText())
          .isEqualTo(row.get("version_hash"));
      assertThat(proof.path("preparationId")).isEqualTo(actualPending.path("preparationId"));
      for (String field : List.of("sourceRevision", "configurationRevision")) {
        assertThat(proof.path(field)).isEqualTo(pendingBase.document().path(field));
      }
      for (String field :
          List.of(
              "contextRevision",
              "authoredInputsHash",
              "ownerFence",
              "scopeHash",
              "evidenceHash",
              "requestDigest")) {
        assertThat(proof.path(field))
            .as("exact pending proof %s", field)
            .isEqualTo(actualPending.path(field));
      }
      assertThat(producerLedger.path("state").asText()).isEqualTo("SUCCEEDED");
      assertThat(producerLedger.path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(producer.path("coordinate")).isEqualTo(producerLedger.path("coordinate"));
      assertThat(allocation.path("producerStepId"))
          .isEqualTo(producer.path("coordinate").path("stepId"));
      assertThat(allocation.path("bindingId"))
          .isEqualTo(proposal.path("operation").path("value").path("bindingId"));
      ObjectNode exactEdge =
          C.object()
              .put("bindingId", allocation.path("bindingId").asText())
              .put(
                  "producerAdmissionId",
                  producerLedger.path("admission").path("admissionId").asText())
              .put(
                  "consumerAdmissionId",
                  actualPending.path("admission").path("admissionId").asText())
              .put("argumentSlot", "fill.value")
              .put("destinationOrigin", proposal.path("executionEvidence").path("origin").asText())
              .put("transferPolicy", "sameOrigin");
      exactEdge.set("coordinate", actualPending.path("coordinate"));
      assertThat(edge).isEqualTo(exactEdge);
      assertThat(row.get("argument_slot")).isEqualTo("fill.value");
      assertThat(producer.path("origin"))
          .isEqualTo(proposal.path("executionEvidence").path("origin"));
      for (String field : List.of("contextId", "workerId", "ownerFence")) {
        assertThat(producer.path("availability").path(field))
            .as("producer availability %s", field)
            .isEqualTo(proof.path(field));
      }
      int pairs = 0;
      for (JsonNode intent : allocation.path("consumers")) {
        if (intent.path("stepId").equals(actualPending.path("coordinate").path("stepId"))
            && intent.path("argumentSlot").asText().equals("fill.value")) {
          pairs++;
        }
      }
      assertThat(pairs).isEqualTo(1);
      assertThat(
              pending.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_admissions WHERE session_id=? AND admission_id=?"
                      + " AND preparation_id=? AND obligation_id=?",
                  Integer.class,
                  id,
                  joined.getFirst().get("admission_id"),
                  joined.getFirst().get("preparation_id"),
                  joined.getFirst().get("obligation_id")))
          .isEqualTo(1);
      ObjectNode identity = C.object();
      identity.set("base", pendingBase.document());
      identity
          .put("ownerWorkerId", "worker")
          .put("ownerFence", 1)
          .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
          .put(
              "translationHash",
              pending.jdbc.queryForObject(
                  "SELECT p.plan_hash FROM studio_guided_translation_state s JOIN studio_guided_translation_plans p"
                      + " USING(session_id,plan_revision) WHERE s.session_id=?",
                  String.class,
                  id))
          .put("basisHash", GuidedContracts.hash(attack.path("basis")));
      pending.tx.executeWithoutResult(
          t -> {
            var current = pending.sessions.lock(id).document();
            assertThat(current.path("state").asText()).isEqualTo("FINALIZING");
            assertThat(current.path("owner").path("workerId"))
                .isEqualTo(identity.path("ownerWorkerId"));
            assertThat(current.path("owner").path("fence")).isEqualTo(identity.path("ownerFence"));
            assertThat(current.path("scopeHash")).isEqualTo(proof.path("scopeHash"));
            assertThat(Instant.parse(current.path("owner").path("leaseExpiresAt").asText()))
                .isAfter(Instant.now());
            assertThat(Instant.parse(current.path("expiresAt").asText())).isAfter(Instant.now());
            assertThat(pending.bases.find(id).orElseThrow().document())
                .isEqualTo(identity.path("base"));
            pending.bases.requireCurrent(pendingBase, pending.bases.lockCurrent(pending.testId));
            JsonNode head =
                C.parse(
                    pending.jdbc.queryForObject(
                        "SELECT p.plan::text FROM studio_guided_translation_state s JOIN"
                            + " studio_guided_translation_plans p USING(session_id,plan_revision) WHERE"
                            + " s.session_id=?",
                        String.class,
                        id));
            assertThat(GuidedContracts.hash(head))
                .isEqualTo(identity.path("translationHash").asText());
            assertThat(
                    GuidedPlanBuilder.unique(
                        head.path("obligations"),
                        "obligationId",
                        (String) row.get("obligation_id")))
                .isEqualTo(meaning);
            assertThat(meaning.path("stepId"))
                .isEqualTo(actualPending.path("coordinate").path("stepId"));
            assertThat(meaning.path("occurrence"))
                .isEqualTo(actualPending.path("coordinate").path("ordinal"));
            assertThat(meaning.path("needId")).isEqualTo(allocation.path("needId"));
            var order = new java.util.ArrayList<String>();
            current.path("sourceSteps").forEach(step -> order.add(step.path("stepId").asText()));
            int producerIndex = order.indexOf(producer.path("coordinate").path("stepId").asText()),
                consumerIndex =
                    order.indexOf(actualPending.path("coordinate").path("stepId").asText());
            assertThat(producerIndex).isGreaterThanOrEqualTo(0);
            assertThat(consumerIndex).isGreaterThanOrEqualTo(producerIndex);
            assertThat(
                    producerIndex < consumerIndex
                        || producer.path("coordinate").path("ordinal").asInt()
                            < actualPending.path("coordinate").path("ordinal").asInt())
                .isTrue();
            assertThat(
                    pending.jdbc.queryForObject(
                        "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND status IN"
                            + " ('RESERVED','CALLING')",
                        Integer.class,
                        id))
                .isZero();
          });
      // This is a malicious offered request, not a claim that the public vector is stored history
      // of this session. Every scalar gate is pinned correctly so the real pending ledger gate is
      // reached before reserve can mint any attempt. No prior VALIDATED history is invented.
      var omitted = new PublicationContracts.Snapshot(identity, attack.path("basis"));
      String before = durableSnapshot(pending);
      assertThatThrownBy(
              () ->
                  pending.tx.execute(
                      t ->
                          pending.publications.reserve(
                              new PublicationContracts.Claim(
                                  id, "omitted-pending", "c".repeat(64), omitted),
                              Instant.now())))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("PUBLICATION_CONFLICT");
      assertThat(durableSnapshot(pending)).isEqualTo(before);
      assertThat(
              pending.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_attempts WHERE session_id=?",
                  Integer.class,
                  id))
          .isZero();
      assertThatThrownBy(
              () ->
                  pending.tx.execute(
                      t -> {
                        var current = pending.sessions.lock(id);
                        var raw = pending.evidence.read(id);
                        var builder = new GuidedPlanBuilder(C);
                        return builder.basis(
                            pendingBase,
                            pending.bases.lockCurrent(pending.testId),
                            raw,
                            current.document(),
                            builder.learningProvenance(raw.document().path("sourceManifest")));
                      }))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("EVIDENCE_MISMATCH");
      assertThat(durableSnapshot(pending)).isEqualTo(before);
    }
  }

  @Test
  void ordinaryCurrentCommitRechecksCompleteStoredEvidenceAndRollbackRemovesEveryWrite()
      throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      var base = db.capture();
      var command = GuidedPublicationRaceTest.prepared(db, db.session, base);
      String before = durableSnapshot(db);
      var reads = new AtomicInteger();
      var writer =
          new GuidedPublicationRepository(
              db.jdbc,
              C,
              () -> {
                reads.incrementAndGet();
                return db.evidence;
              });
      assertThat(reads).hasValue(0);
      db.tx.executeWithoutResult(
          t -> {
            var receipt = writer.commit(command, Instant.now());
            assertThat(reads).hasValue(1);
            assertThat(receipt.document().path("publicReceipt").has("relearnedFrom")).isTrue();
            assertThat(receipt.document().path("publicReceipt").path("relearnedFrom").isNull())
                .isTrue();
            assertThat(
                    db.jdbc.queryForObject(
                        "SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
                        Integer.class,
                        command.sessionId()))
                .isEqualTo(1);
            assertThat(
                    db.jdbc.queryForObject(
                        "SELECT confirmed_revision_id FROM ui_tests WHERE id=?",
                        UUID.class,
                        db.testId))
                .isEqualTo(command.revisionId());
            t.setRollbackOnly();
          });
      assertThat(durableSnapshot(db)).isEqualTo(before);
      var receipt = db.tx.execute(t -> writer.commit(command, Instant.now()));
      assertThat(receipt).isNotNull();
      assertThat(reads).hasValue(2);
      var repeated = db.tx.execute(t -> writer.commit(command, Instant.now()));
      assertThat(repeated.document()).isEqualTo(receipt.document());
      assertThat(reads)
          .as("immutable receipt retry performs no new authority read/write")
          .hasValue(2);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
                  Integer.class,
                  command.sessionId()))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT publication_epoch FROM ui_tests WHERE id=?", Long.class, db.testId))
          .isEqualTo(Long.parseLong(base.document().path("publicationEpoch").asText()) + 1);
    }
  }

  /**
   * STUDIO-OBS-015 ruling E-2: an in-lock re-derivation skips the repeated pure ValidationBasis
   * check only when it equals an already-validated document; absent or unequal revalidates.
   */
  @Test
  void lockedRederivationRevalidatesOnlyWhenTheDerivedBasisDiffers() throws Exception {
    String validationBasis = "v3/replay-validation#/definitions/ValidationBasis";
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      var base = db.capture();
      // The same completed-session setup the commit tests use (complete evidence, FINALIZING).
      GuidedPublicationRaceTest.prepared(db, db.session, base);
      String id = db.session.path("sessionId").asText();
      var checked = org.mockito.Mockito.spy(new GuidedContracts());
      var b = new GuidedPlanBuilder(checked);
      db.tx.executeWithoutResult(
          t -> {
            var current = db.sessions.lock(id);
            var raw = db.evidence.read(id);
            var source = db.bases.lockCurrent(db.testId);
            JsonNode provenance = b.learningProvenance(raw.document().path("sourceManifest"));
            ObjectNode v = b.basis(base, source, raw, current.document(), provenance);
            org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(1))
                .validate(
                    org.mockito.ArgumentMatchers.eq(validationBasis),
                    org.mockito.ArgumentMatchers.any());
            assertThat(b.basisMatching(base, source, raw, current.document(), provenance, v))
                .isEqualTo(v);
            org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(1))
                .validate(
                    org.mockito.ArgumentMatchers.eq(validationBasis),
                    org.mockito.ArgumentMatchers.any());
            b.basisMatching(base, source, raw, current.document(), provenance, null);
            org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(2))
                .validate(
                    org.mockito.ArgumentMatchers.eq(validationBasis),
                    org.mockito.ArgumentMatchers.any());
            b.basisMatching(
                base,
                source,
                raw,
                current.document(),
                provenance,
                v.deepCopy().put("schemaVersion", 2));
            org.mockito.Mockito.verify(checked, org.mockito.Mockito.times(3))
                .validate(
                    org.mockito.ArgumentMatchers.eq(validationBasis),
                    org.mockito.ArgumentMatchers.any());
            t.setRollbackOnly();
          });
    }
  }

  @ParameterizedTest(name = "direct writer authority {0}")
  @ValueSource(
      strings = {
        "claim",
        "snapshot",
        "finalize-digest",
        "grant-principal",
        "grant-csi",
        "grant-session",
        "grant-snapshot",
        "grant-expired",
        "grant-after-validation"
      })
  void directCurrentCommitKeepsExactClaimAndGrantAuthorityWithoutAnyWrite(String mutation)
      throws Exception {
    try (var db = new GuidedPublicationMigrationTest.Database()) {
      var command = GuidedPublicationRaceTest.prepared(db, db.session, db.capture());
      String before = durableSnapshot(db);
      var snapshot = command.snapshot();
      if (mutation.equals("snapshot")) {
        ObjectNode identity = snapshot.identity().deepCopy();
        identity.put("basisHash", "0".repeat(64));
        snapshot = new PublicationContracts.Snapshot(identity, snapshot.basis());
      }
      var grant = command.grant();
      if (mutation.startsWith("grant-")) {
        grant =
            new PublicationContracts.Grant(
                mutation.equals("grant-session") ? "other-session" : grant.sessionId(),
                mutation.equals("grant-principal") ? "other-principal" : grant.principalId(),
                mutation.equals("grant-csi") ? "other-csi" : grant.csiId(),
                mutation.equals("grant-snapshot") ? "0".repeat(64) : grant.snapshotHash(),
                mutation.equals("grant-expired")
                    ? Instant.EPOCH
                    : mutation.equals("grant-after-validation")
                        ? grant.expiresAt().plusSeconds(1)
                        : grant.expiresAt());
      }
      var offered =
          new PublicationContracts.Commit(
              command.sessionId(),
              command.revisionId(),
              command.attemptId(),
              mutation.equals("claim") ? UUID.randomUUID() : command.claimId(),
              command.finalizeKey(),
              mutation.equals("finalize-digest") ? "0".repeat(64) : command.finalizeDigest(),
              snapshot,
              command.candidate(),
              grant);
      String code =
          mutation.startsWith("grant-")
              ? "FORBIDDEN_SCOPE"
              : mutation.equals("finalize-digest")
                  ? "PUBLICATION_CONFLICT"
                  : "IDEMPOTENCY_CONFLICT";
      assertThatThrownBy(() -> db.tx.execute(t -> db.publications.commit(offered, Instant.now())))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage(code);
      assertThat(durableSnapshot(db))
          .as("failed direct commit leaves every authority/write row unchanged")
          .isEqualTo(before);
    }
  }

  /**
   * Real PostgreSQL queries with explicitly substituted returned rows, never SQL corruption or
   * mocked JDBC. Only the reader's datasource is shared; the production writer uses db.jdbc.
   * Original source/history rows and triggers are untouched. This ordinary, single-version
   * relational fixture supplies controlled upstream outcomes, not native or HTTP authority.
   */
  private static final class PrivateReadBoundary extends JdbcTemplate {
    private static final String INPUTS =
        "SELECT input_ordinal,input_id,introduced_revision,document::text FROM"
            + " studio_guided_materialization_inputs WHERE session_id=? ORDER BY input_ordinal";
    private static final String VERSIONS =
        "SELECT * FROM studio_guided_materialization_versions WHERE session_id=? ORDER BY context_revision";
    private static final String CURRENT =
        "SELECT context_revision,authored_inputs_hash,authored_inputs::text FROM"
            + " studio_guided_materializations WHERE session_id=?";
    private static final String MANIFEST =
        "SELECT manifest::text,manifest_hash FROM studio_guided_source_manifests WHERE session_id=?";
    private final String sessionId;
    private String mutation;
    private int substitutions, inputReads, versionReads, currentReads;

    PrivateReadBoundary(JdbcTemplate actual, String sessionId) {
      super(java.util.Objects.requireNonNull(actual.getDataSource()));
      this.sessionId = sessionId;
    }

    void arm(String mutation) {
      this.mutation = mutation;
      substitutions = inputReads = versionReads = currentReads = 0;
    }

    @Override
    public List<Map<String, Object>> queryForList(String sql, Object... args) {
      List<Map<String, Object>> actual = super.queryForList(sql, args);
      if (!sql.equals(INPUTS) && !sql.equals(VERSIONS)) {
        return actual;
      }
      assertThat(args).containsExactly(sessionId);
      if (sql.equals(INPUTS)) {
        inputReads++;
      } else {
        versionReads++;
      }
      if (mutation == null) {
        return actual;
      }
      List<Map<String, Object>> offered = new ArrayList<>();
      actual.forEach(row -> offered.add(new HashMap<>(row)));
      boolean changed = false;
      if (sql.equals(INPUTS)) {
        switch (mutation) {
          case "private-value", "private-provenance" -> {
            ObjectNode input =
                PublicationContracts.copy(C.parse((String) offered.get(1).get("document")));
            assertThat(input.path("kind").asText()).isEqualTo("nonsecretText");
            if (mutation.equals("private-value")) {
              input.put("value", "DIFFERENT_PRIVATE_VALUE");
            } else {
              ObjectNode provenance = (ObjectNode) input.path("provenance");
              assertThat(provenance.path("referenceKind").asText()).isEqualTo("sourceSpan");
              provenance.put("endUtf16", provenance.path("endUtf16").asInt() + 1);
            }
            offered.get(1).put("document", input.toString());
            changed = true;
          }
          case "input-order" -> {
            java.util.Collections.swap(offered, 0, 1);
            changed = true;
          }
          case "missing-input" -> {
            offered.removeLast();
            changed = true;
          }
          case "introduced-version" -> {
            offered.getFirst().put("introduced_revision", 2);
            changed = true;
          }
          default -> {
            /* Other mutations target a different exact returned query. */
          }
        }
      } else {
        switch (mutation) {
          case "header-hash" -> {
            offered.getFirst().put("authored_inputs_hash", "0".repeat(64));
            changed = true;
          }
          case "header-count" -> {
            offered
                .getFirst()
                .put(
                    "input_count", ((Number) offered.getFirst().get("input_count")).intValue() - 1);
            changed = true;
          }
          case "header-provenance" -> {
            ObjectNode identity =
                PublicationContracts.copy(
                    C.parse(String.valueOf(offered.getFirst().get("authored_inputs_identity"))));
            identity.put("sourceRevision", "2");
            offered.getFirst().put("authored_inputs_identity", identity.toString());
            changed = true;
          }
          default -> {
            /* Other mutations target a different exact returned query. */
          }
        }
      }
      if (changed) {
        assertThat(offered.equals(actual))
            .as("returned history substitution changes its selected preimage")
            .isFalse();
        substitutions++;
      }
      return offered;
    }

    @Override
    public Map<String, Object> queryForMap(String sql, Object... args) {
      Map<String, Object> actual = super.queryForMap(sql, args);
      if (sql.equals(CURRENT)) {
        currentReads++;
      }
      if (mutation == null || (!sql.equals(CURRENT) && !sql.equals(MANIFEST))) {
        return actual;
      }
      assertThat(args).containsExactly(sessionId);
      Map<String, Object> offered = new HashMap<>(actual);
      if (sql.equals(CURRENT) && mutation.equals("current-private-value")) {
        ObjectNode full =
            PublicationContracts.copy(C.parse((String) actual.get("authored_inputs")));
        ((ObjectNode) full.path("inputs").get(1)).put("value", "DIFFERENT_PRIVATE_VALUE");
        offered.put("authored_inputs", full.toString());
      } else if (sql.equals(MANIFEST) && mutation.startsWith("manifest-")) {
        ObjectNode manifest = PublicationContracts.copy(C.parse((String) actual.get("manifest")));
        if (mutation.equals("manifest-checksum")) {
          offered.put("manifest_hash", "0".repeat(64));
        } else {
          switch (mutation) {
            case "manifest-private-plain", "manifest-missing-plain" -> {
              int selected = 0;
              for (JsonNode value : manifest.path("configurationValues")) {
                if (value.path("referenceName").asText().equals("saved-label")) {
                  // The classifier freezes all four legal slots for this exact declaration.
                  // Change each copy together so refusal proves the declaration hash join,
                  // rather than stopping at inconsistent duplicate configuration values.
                  if (mutation.equals("manifest-private-plain")) {
                    ((ObjectNode) value).put("value", "DIFFERENT_PRIVATE_VALUE");
                  } else {
                    ((ObjectNode) value).remove("value");
                  }
                  selected++;
                }
              }
              assertThat(selected)
                  .as("the positive parent freezes every slot for its exact declared private value")
                  .isEqualTo(4);
            }
            case "manifest-authored-context" -> {
              ((ObjectNode)
                      manifest
                          .path("authoringSnapshot")
                          .path("steps")
                          .get(2)
                          .path("context")
                          .path("entries")
                          .get(1))
                  .put("value", "A different complete source");
              ObjectNode identity = C.object().put("authoringIdentityVersion", 1);
              identity.set("authoring", manifest.path("authoringSnapshot"));
              identity.set("authoredDeclarations", manifest.path("authoredDeclarations"));
              var substituted =
                  com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.snapshot(
                      identity);
              manifest.set(
                  "authoringRevisionInputs",
                  new ObjectMapper().valueToTree(substituted.identity().inputs()));
            }
            default -> throw new AssertionError("Unrecognized manifest substitution");
          }
          // Attacker reseals only the returned full private manifest, never the stored original
          // or its start-base public hash. The context attack must pass snapshotEvidence first.
          offered.put("manifest", manifest.toString());
          offered.put("manifest_hash", GuidedContracts.hash(manifest));
        }
      } else {
        return actual;
      }
      assertThat(offered.equals(actual))
          .as("returned private substitution changes its selected preimage")
          .isFalse();
      substitutions++;
      return offered;
    }
  }

  /** Whole test-owned durable rows and trigger definitions; assertions expose only one digest. */
  private static String privateAuthoritySnapshot(GuidedPublicationMigrationTest.Database db) {
    ObjectNode snapshot = C.object();
    for (String table :
        db.jdbc.queryForList(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
            String.class)) {
      assertThat(table).matches("[a-z0-9_]+");
      snapshot.set(
          table,
          C.parse(
              db.jdbc.queryForObject(
                  "SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM public."
                      + table
                      + " t",
                  String.class)));
    }
    snapshot.set(
        "_triggers",
        C.parse(
            db.jdbc.queryForObject(
                "SELECT COALESCE(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,"
                    + "'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY"
                    + " c.relname,t.tgname),'[]'::jsonb)::text"
                    + " FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON"
                    + " n.oid=c.relnamespace"
                    + " WHERE n.nspname='public' AND NOT t.tgisinternal",
                String.class)));
    return GuidedContracts.hash(snapshot);
  }

  private static void assertCommitRollback(
      GuidedPublicationMigrationTest.Database db,
      GuidedPublicationRepository writer,
      PublicationContracts.Commit command,
      String original) {
    db.tx.executeWithoutResult(
        t -> {
          assertThat(writer.commit(command, Instant.now())).isNotNull();
          assertThat(
                  db.jdbc.queryForObject(
                      "SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
                      Integer.class,
                      command.sessionId()))
              .isEqualTo(1);
          assertThat(
                  db.jdbc.queryForObject(
                      "SELECT confirmed_revision_id FROM ui_tests WHERE id=?",
                      UUID.class,
                      db.testId))
              .isEqualTo(command.revisionId());
          t.setRollbackOnly();
        });
    assertThat(privateAuthoritySnapshot(db))
        .as("positive publication rollback preserves every original row and trigger")
        .isEqualTo(original);
  }

  private static JsonNode assertStoredPrivateProjection(
      GuidedPublicationMigrationTest.Database db, PublicationContracts.Base base) {
    String id = db.fixtureSession();
    JsonNode raw = db.tx.execute(t -> db.evidence.read(id)).document();
    JsonNode full =
        C.parse(
            db.jdbc.queryForObject(
                "SELECT authored_inputs::text FROM studio_guided_materializations WHERE session_id=?",
                String.class,
                id));
    var rows = db.jdbc.queryForList(PrivateReadBoundary.INPUTS, id);
    JsonNode history = raw.path("materializationEvidence");
    assertThat(history.path("versions").size())
        .as("this lawful parent proves exactly one original version")
        .isEqualTo(1);
    assertThat(rows.size()).isEqualTo(3);
    assertThat(history.path("entries").size()).isEqualTo(rows.size());
    assertThat(full.path("inputs").size()).isEqualTo(rows.size());
    assertThat(
            GuidedContracts.hash(full)
                .equals(history.path("versions").get(0).path("authoredInputsHash").asText()))
        .as("full private envelope is hashed before values are removed")
        .isTrue();
    for (int ordinal = 0; ordinal < rows.size(); ordinal++) {
      JsonNode privateInput = C.parse((String) rows.get(ordinal).get("document"));
      JsonNode entry = history.path("entries").get(ordinal);
      assertThat(((Number) rows.get(ordinal).get("input_ordinal")).intValue()).isEqualTo(ordinal);
      assertThat(((Number) rows.get(ordinal).get("introduced_revision")).intValue()).isEqualTo(1);
      assertThat(privateInput.equals(full.path("inputs").get(ordinal)))
          .as("stored normalized input equals its private envelope member")
          .isTrue();
      assertThat(GuidedContracts.hash(privateInput).equals(entry.path("inputHash").asText()))
          .as("entry hash uses the original private value-bearing input")
          .isTrue();
      ObjectNode safe = PublicationContracts.copy(privateInput);
      safe.remove("value");
      assertThat(entry.path("inputOrdinal").asInt()).isEqualTo(ordinal);
      assertThat(entry.path("introducedContextRevision").asInt()).isEqualTo(1);
      assertThat(safe.equals(entry.path("metadata")))
          .as("metadata is exact original minus value only")
          .isTrue();
      assertThat(entry.path("metadata").has("value")).isFalse();
      assertThat(raw.path("materialization").path("inputs").get(ordinal).has("value")).isFalse();
    }
    var stored = db.jdbc.queryForMap(PrivateReadBoundary.MANIFEST, id);
    ObjectNode manifest = PublicationContracts.copy(C.parse((String) stored.get("manifest")));
    assertThat(GuidedContracts.hash(manifest).equals(stored.get("manifest_hash")))
        .as("stored full private manifest checksum")
        .isTrue();
    assertThat(manifest.has("configurationValues")).isTrue();
    manifest.remove("configurationValues");
    assertThat(manifest.has("authoringSnapshot")).isTrue();
    assertThat(manifest.equals(raw.path("sourceManifest")))
        .as("public manifest removes configurationValues only")
        .isTrue();
    assertThat(
            GuidedContracts.hash(manifest)
                .equals(base.document().path("sourceManifestHash").asText()))
        .as("original start base commits the full authoring snapshot preimage")
        .isTrue();
    manifest.remove("authoringSnapshot");
    assertThat(
            GuidedContracts.hash(manifest)
                .equals(base.document().path("sourceManifestHash").asText()))
        .as("omitting the authoring snapshot changes that original preimage")
        .isFalse();
    return raw;
  }

  @ParameterizedTest(name = "stored private returned history {0}")
  @ValueSource(
      strings = {
        "private-value",
        "private-provenance",
        "input-order",
        "missing-input",
        "introduced-version",
        "header-hash",
        "header-count",
        "header-provenance",
        "current-private-value"
      })
  void storedPrivateHistoryCannotBeSubstitutedAtPublicationBoundary(String mutation)
      throws Exception {
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var db =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b3a-history", fixtures().path("basis").deepCopy())) {
      var base = db.capture();
      db.finalizing();
      var command = prepareStored(db, base);
      JsonNode originalRead = assertStoredPrivateProjection(db, base);
      String original = privateAuthoritySnapshot(db);
      var boundary = new PrivateReadBoundary(db.jdbc, db.fixtureSession());
      var reader = new GuidedPublicationEvidenceRepository(boundary, C);
      var reads = new AtomicInteger();
      var writer =
          new GuidedPublicationRepository(
              db.jdbc,
              C,
              () -> {
                reads.incrementAndGet();
                return reader;
              });
      assertCommitRollback(db, writer, command, original);
      assertThat(reads).hasValue(1);
      boundary.arm(mutation);
      assertThatThrownBy(() -> db.tx.execute(t -> writer.commit(command, Instant.now())))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("EVIDENCE_MISMATCH");
      assertThat(reads)
          .as("the current writer reached the actual private evidence reader")
          .hasValue(2);
      assertThat(boundary.substitutions)
          .as("one exact returned SQL preimage was substituted")
          .isEqualTo(1);
      assertThat(boundary.inputReads).isEqualTo(1);
      assertThat(boundary.versionReads).isEqualTo(mutation.equals("input-order") ? 0 : 1);
      assertThat(boundary.currentReads).isEqualTo(mutation.equals("current-private-value") ? 1 : 0);
      assertThat(privateAuthoritySnapshot(db))
          .as("refused substituted read preserves every original row and trigger")
          .isEqualTo(original);
      boundary.arm(null);
      JsonNode restored = db.tx.execute(t -> reader.read(db.fixtureSession())).document();
      assertThat(restored.equals(originalRead))
          .as("restoring the reader recovers the exact stored evidence")
          .isTrue();
      assertCommitRollback(db, writer, command, original);
      assertThat(reads).hasValue(3);
      assertThat(boundary.substitutions).isZero();
    }
  }

  @ParameterizedTest(name = "stored source returned manifest {0}")
  @ValueSource(
      strings = {
        "manifest-checksum",
        "manifest-private-plain",
        "manifest-missing-plain",
        "manifest-authored-context"
      })
  void storedSourceManifestRequiresOriginalImmutableSourcePreimage(String mutation)
      throws Exception {
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var db =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b3a-manifest", fixtures().path("basis").deepCopy())) {
      var base = db.capture();
      db.finalizing();
      var command = prepareStored(db, base);
      JsonNode originalRead = assertStoredPrivateProjection(db, base);
      String original = privateAuthoritySnapshot(db);
      var boundary = new PrivateReadBoundary(db.jdbc, db.fixtureSession());
      var reader = new GuidedPublicationEvidenceRepository(boundary, C);
      var reads = new AtomicInteger();
      var writer =
          new GuidedPublicationRepository(
              db.jdbc,
              C,
              () -> {
                reads.incrementAndGet();
                return reader;
              });
      assertCommitRollback(db, writer, command, original);
      assertThat(reads).hasValue(1);
      boundary.arm(mutation);
      if (mutation.equals("manifest-authored-context")) {
        // A coherent substituted read passes snapshotEvidence and complete history reconstruction.
        // The original pinned base then rejects its changed public manifest at the builder
        // boundary.
        JsonNode offered = db.tx.execute(t -> reader.read(db.fixtureSession())).document();
        assertThat(boundary.substitutions).isEqualTo(1);
        assertThat(boundary.currentReads).isEqualTo(1);
        assertThat(offered.path("sourceManifest").equals(originalRead.path("sourceManifest")))
            .isFalse();
        assertThat(
                offered
                    .path("snapshotEvidence")
                    .path("current")
                    .path("authoring")
                    .equals(offered.path("sourceManifest").path("authoringSnapshot")))
            .isTrue();
        assertThat(
                GuidedContracts.hash(offered.path("sourceManifest"))
                    .equals(base.document().path("sourceManifestHash").asText()))
            .isFalse();
        assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
        boundary.arm(mutation);
      }
      String code =
          mutation.equals("manifest-missing-plain") ? "MISSING_SOURCE" : "EVIDENCE_MISMATCH";
      assertThatThrownBy(() -> db.tx.execute(t -> writer.commit(command, Instant.now())))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage(code);
      assertThat(reads)
          .as("the current writer reached the actual private evidence reader")
          .hasValue(2);
      assertThat(boundary.substitutions)
          .as("one exact returned manifest preimage was substituted")
          .isEqualTo(1);
      assertThat(boundary.inputReads)
          .as("only the coherent context attack passes the private snapshot reader")
          .isEqualTo(mutation.equals("manifest-authored-context") ? 1 : 0);
      assertThat(boundary.currentReads)
          .isEqualTo(mutation.equals("manifest-authored-context") ? 1 : 0);
      assertThat(privateAuthoritySnapshot(db))
          .as("refused manifest substitution preserves every original row and trigger")
          .isEqualTo(original);
      boundary.arm(null);
      JsonNode restored = db.tx.execute(t -> reader.read(db.fixtureSession())).document();
      assertThat(restored.equals(originalRead))
          .as("restoring the reader recovers the original immutable source preimage")
          .isTrue();
      assertCommitRollback(db, writer, command, original);
      assertThat(reads).hasValue(3);
      assertThat(boundary.substitutions).isZero();
    }
  }

  // ---- STUDIO-OBS-015 B3a design01: offered public basis vs actual stored private authority ----
  // Tier disclosure (authority-tier-ruling01): actual head PostgreSQL, actual current writer and
  // actual stored evidence reader. The parent's upstream rows (actions, preparations,
  // materialization) are inserted by the shared relational fixture, and the validator verdict and
  // publication grant are built here. Those are controlled inputs: not runner-validator, Core,
  // HTTP or native proof, and not production-written private-authority rows in the T3 sense.

  private record B3aGenuine(
      PublicationContracts.Snapshot snapshot,
      PublicationContracts.Candidate candidate,
      JsonNode profile,
      JsonNode build) {}

  private static PublicationContracts.Snapshot b3aReseal(
      JsonNode template,
      ObjectNode basis,
      PublicationContracts.Candidate candidate,
      JsonNode build) {
    ObjectNode identity = template.deepCopy();
    identity
        .put(
            "validationDeadline",
            PublicationContracts.time(
                PublicationContracts.millisecond(Instant.now().plusSeconds(12))))
        .put("basisHash", GuidedContracts.hash(basis))
        .put("validationBuildHash", GuidedContracts.hash(build));
    for (String field :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash")) {
      identity.set(field, candidate.hashes().path(field));
    }
    return new PublicationContracts.Snapshot(identity, basis);
  }

  private static B3aGenuine b3aGenuine(
      GuidedPublicationMigrationTest.Database db, PublicationContracts.Base base) {
    var captured = db.snapshot(base);
    var profile = GuidedPublicationMigrationTest.currentProfile();
    var build = GuidedPublicationMigrationTest.observedBuild(profile);
    ObjectNode basis = (ObjectNode) captured.basis().deepCopy();
    var candidate = new ObservedArtifactLowerer(C).lower(basis.deepCopy(), profile);
    return new B3aGenuine(
        b3aReseal(captured.identity(), basis, candidate, build), candidate, profile, build);
  }

  /** One rolled-back reserve/claim/finish/commit at the actual current writer; returns its code. */
  private static String b3aStaged(
      GuidedPublicationMigrationTest.Database db,
      GuidedPublicationRepository writer,
      PublicationContracts.Base base,
      String label,
      PublicationContracts.Snapshot snapshot,
      PublicationContracts.Candidate candidate,
      JsonNode profile,
      JsonNode build) {
    String id = db.fixtureSession();
    String key = "b3a-" + label;
    String digest = GuidedContracts.hash(C.object().put("b3a", label));
    try {
      db.tx.executeWithoutResult(
          t -> {
            t.setRollbackOnly();
            var attempt =
                writer.reserve(
                    new PublicationContracts.Claim(id, key, digest, snapshot), Instant.now());
            writer.claim(
                id, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
            // Controlled relational-tier verdict: the existing prepareStored shape.
            ObjectNode verdict =
                C.object()
                    .put("schemaVersion", 3)
                    .put("ok", true)
                    .putNull("errorCode")
                    .put("attemptId", attempt.attemptId().toString())
                    .put("claimId", attempt.claimId().toString())
                    .put("snapshotHash", snapshot.hash())
                    .put("basisHash", snapshot.identity().path("basisHash").asText());
            for (String field :
                List.of(
                    "artifactHash",
                    "learnedPlanHash",
                    "referencePolicyHash",
                    "operationEquivalenceHash",
                    "admissionProvenanceHash",
                    "publicationEvidenceHash")) {
              verdict.set(field, candidate.hashes().path(field));
            }
            verdict.set("profile", profile);
            verdict.set("build", build);
            writer.finish(
                id,
                attempt.attemptId(),
                attempt.claimId(),
                snapshot.hash(),
                PublicationContracts.AttemptStatus.VALIDATED,
                verdict,
                null,
                Instant.now());
            // Controlled grant from the stored base; the writer re-checks it.
            var grant =
                new PublicationContracts.Grant(
                    id,
                    base.document().path("originalPrincipalId").asText(),
                    base.document().path("csiId").asText(),
                    snapshot.hash(),
                    attempt.validationDeadline());
            var receipt =
                writer.commit(
                    new PublicationContracts.Commit(
                        id,
                        UUID.randomUUID(),
                        attempt.attemptId(),
                        attempt.claimId(),
                        key,
                        digest,
                        snapshot,
                        candidate,
                        grant),
                    Instant.now());
            assertThat(receipt).isNotNull();
            assertThat(
                    db.jdbc.queryForObject(
                        "SELECT count(*) FROM ui_test_revisions WHERE guided_session_id=?",
                        Integer.class,
                        id))
                .isEqualTo(1);
          });
      return "COMMITTED";
    } catch (GuidedSessionException refused) {
      return refused.getMessage();
    }
  }

  private static String b3aDifferentHash(String hash) {
    String replacement = GuidedContracts.hash(C.object().put("b3a-substitute", hash));
    assertThat(replacement).isNotEqualTo(hash).matches("[a-f0-9]{64}");
    return replacement;
  }

  /** Stage oracle: a lowerer-refused basis never reaches the stored reader; else it refuses. */
  private static String b3aRefused(
      GuidedPublicationMigrationTest.Database db,
      GuidedPublicationRepository writer,
      PublicationContracts.Base base,
      String label,
      ObjectNode offered,
      B3aGenuine genuine,
      AtomicInteger reads,
      String original) {
    assertThat(offered.equals(genuine.snapshot().basis()))
        .as("%s changes the offered basis", label)
        .isFalse();
    PublicationContracts.Candidate candidate = genuine.candidate();
    String pure = null;
    try {
      candidate = new ObservedArtifactLowerer(C).lower(offered.deepCopy(), genuine.profile());
    } catch (GuidedSessionException refused) {
      pure = refused.getMessage();
    }
    var snapshot = b3aReseal(genuine.snapshot().identity(), offered, candidate, genuine.build());
    int before = reads.get();
    String outcome =
        b3aStaged(db, writer, base, label, snapshot, candidate, genuine.profile(), genuine.build());
    assertThat(outcome).as("%s is never adopted", label).isNotEqualTo("COMMITTED");
    if (pure != null) {
      assertThat(outcome)
          .as("%s writer recomputation meets the same pure refusal", label)
          .isEqualTo(pure);
      assertThat(reads.get()).isEqualTo(before);
    } else {
      assertThat(outcome).as("%s stored re-read refusal", label).isEqualTo("PUBLICATION_CONFLICT");
      assertThat(reads.get() - before).isEqualTo(1);
    }
    assertThat(privateAuthoritySnapshot(db))
        .as("%s preserves every row and trigger", label)
        .isEqualTo(original);
    return pure == null ? "STORED" : "PURE:" + pure;
  }

  /**
   * B3A-1 (ledger 31/52/60; private routes 1, 3, 6): exact original offered pointers that only the
   * stored private preimage can refute. Relational tier with controlled inputs (see above).
   */
  @Test
  void offeredBasisOriginalPointersRequireStoredPrivatePreimageAtCurrentCommit() throws Exception {
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var db =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b3a-offered", fixtures().path("basis").deepCopy())) {
      var base = db.capture();
      db.finalizing();
      assertStoredPrivateProjection(db, base);
      String original = privateAuthoritySnapshot(db);
      var reads = new AtomicInteger();
      var writer =
          new GuidedPublicationRepository(
              db.jdbc,
              C,
              () -> {
                reads.incrementAndGet();
                return db.evidence;
              });
      var genuine = b3aGenuine(db, base);
      assertThat(
              b3aStaged(
                  db,
                  writer,
                  base,
                  "positive-0",
                  genuine.snapshot(),
                  genuine.candidate(),
                  genuine.profile(),
                  genuine.build()))
          .as("the genuine stored basis is adoptable at this exact boundary")
          .isEqualTo("COMMITTED");
      assertThat(reads).hasValue(1);
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
      var attacks = new java.util.LinkedHashMap<String, java.util.function.Consumer<ObjectNode>>();
      attacks.put(
          "wrong-private-input-hash",
          basis -> {
            ObjectNode entry =
                (ObjectNode) basis.path("materializationEvidence").path("entries").get(0);
            entry.put("inputHash", b3aDifferentHash(entry.path("inputHash").asText()));
          });
      attacks.put(
          "immutable-source-manifest-hash-is-exact",
          basis ->
              basis.put(
                  "sourceManifestHash",
                  b3aDifferentHash(basis.path("sourceManifestHash").asText())));
      attacks.put(
          "immutable-original-source-cannot-be-replaced",
          basis -> {
            ObjectNode entry =
                (ObjectNode)
                    basis
                        .path("snapshotEvidence")
                        .path("current")
                        .path("authoring")
                        .path("steps")
                        .get(2)
                        .path("context")
                        .path("entries")
                        .get(1);
            assertThat(entry.path("value").isTextual())
                .as("the exact original context-value pointer exists")
                .isTrue();
            entry.put("value", "A different complete source");
          });
      int positives = 0;
      for (var attack : attacks.entrySet()) {
        ObjectNode offered = (ObjectNode) genuine.snapshot().basis().deepCopy();
        attack.getValue().accept(offered);
        String stage =
            b3aRefused(db, writer, base, attack.getKey(), offered, genuine, reads, original);
        assertThat(stage)
            .as("%s: the public basis cannot recompute the private preimage", attack.getKey())
            .isEqualTo("STORED");
        var fresh = b3aGenuine(db, base);
        assertThat(
                b3aStaged(
                    db,
                    writer,
                    base,
                    "positive-" + (++positives),
                    fresh.snapshot(),
                    fresh.candidate(),
                    fresh.profile(),
                    fresh.build()))
            .as("parity after %s", attack.getKey())
            .isEqualTo("COMMITTED");
        assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
      }
    }
  }

  /**
   * B3A-2 (ledger 31): a foreign session/test/CSI basis and foreign admission IDs cannot borrow
   * this session's stored authority. Relational tier with controlled inputs (see above).
   */
  @Test
  void offeredBasisFromAnotherStoredSessionCannotBorrowItsAuthority() throws Exception {
    ObjectNode foreignCanonical = (ObjectNode) fixtures().path("basis").deepCopy();
    // Test-owned before-image; the shared fixture freezes actual source/base under this CSI.
    foreignCanonical.put("csiId", "CSI-B3A-FOREIGN");
    try (var owner = new GuidedPublicationMigrationTest.Database();
        var foreign =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b3a-foreign-a", foreignCanonical);
        var db =
            new GuidedPublicationMigrationTest.Database(
                owner.jdbc, owner.tx, "b3a-foreign-b", fixtures().path("basis").deepCopy())) {
      var foreignBase = foreign.capture();
      foreign.finalizing();
      var base = db.capture();
      db.finalizing();
      assertThat(foreignBase.document().path("csiId")).isNotEqualTo(base.document().path("csiId"));
      assertThat(foreignBase.document().path("testId"))
          .isNotEqualTo(base.document().path("testId"));
      assertThat(foreignBase.document().path("sessionId"))
          .isNotEqualTo(base.document().path("sessionId"));
      String original = privateAuthoritySnapshot(db);
      var reads = new AtomicInteger();
      var writer =
          new GuidedPublicationRepository(
              db.jdbc,
              C,
              () -> {
                reads.incrementAndGet();
                return db.evidence;
              });
      var genuine = b3aGenuine(db, base);
      var foreignGenuine = b3aGenuine(foreign, foreignBase);
      assertThat(
              b3aStaged(
                  db,
                  writer,
                  base,
                  "positive-b",
                  genuine.snapshot(),
                  genuine.candidate(),
                  genuine.profile(),
                  genuine.build()))
          .isEqualTo("COMMITTED");
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);

      // (1) Another session's complete actual stored basis, offered under this session's claim.
      ObjectNode foreignBasis = (ObjectNode) foreignGenuine.snapshot().basis().deepCopy();
      var foreignCandidate =
          new ObservedArtifactLowerer(C).lower(foreignBasis.deepCopy(), genuine.profile());
      var borrowed =
          b3aReseal(genuine.snapshot().identity(), foreignBasis, foreignCandidate, genuine.build());
      int before = reads.get();
      assertThat(
              b3aStaged(
                  db,
                  writer,
                  base,
                  "foreign-session-basis",
                  borrowed,
                  foreignCandidate,
                  genuine.profile(),
                  genuine.build()))
          .as("foreign run authorization cannot join this stored base")
          .isEqualTo("EVIDENCE_MISMATCH");
      assertThat(reads.get())
          .as("refused at the writer's candidate-to-stored-base join")
          .isEqualTo(before);
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);

      // (2) The same foreign basis resealed with this session's run authorization.
      ObjectNode resealed = foreignBasis.deepCopy();
      resealed.set(
          "runAuthorization", genuine.snapshot().basis().path("runAuthorization").deepCopy());
      b3aRefused(
          db,
          writer,
          base,
          "foreign-session-resealed-authorization",
          resealed,
          genuine,
          reads,
          original);

      // (3) This session's basis naming the other session's actual successful admission identity.
      String ownAdmission =
          genuine
              .snapshot()
              .basis()
              .path("actions")
              .get(0)
              .path("ledger")
              .path("admission")
              .path("admissionId")
              .asText();
      assertThat(ownAdmission).startsWith("b3a-foreign-b-");
      String foreignAdmission =
          "b3a-foreign-a-" + ownAdmission.substring("b3a-foreign-b-".length());
      assertThat(
              owner.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_actions WHERE session_id='b3a-foreign-a'"
                      + " AND admission_id=? AND document->>'state'='SUCCEEDED'",
                  Integer.class,
                  foreignAdmission))
          .isEqualTo(1);
      ObjectNode substituted =
          (ObjectNode)
              C.parse(
                  genuine
                      .snapshot()
                      .basis()
                      .toString()
                      .replace("\"" + ownAdmission + "\"", "\"" + foreignAdmission + "\""));
      b3aRefused(
          db,
          writer,
          base,
          "foreign-admission-substitution",
          substituted,
          genuine,
          reads,
          original);

      var fresh = b3aGenuine(db, base);
      assertThat(
              b3aStaged(
                  db,
                  writer,
                  base,
                  "positive-b-after",
                  fresh.snapshot(),
                  fresh.candidate(),
                  fresh.profile(),
                  fresh.build()))
          .isEqualTo("COMMITTED");
      assertThat(privateAuthoritySnapshot(db)).isEqualTo(original);
    }
  }
}
