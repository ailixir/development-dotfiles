package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Fenced validation and atomic adoption; caller owns session/source transaction and fresh grant.
 */
public final class GuidedPublicationRepository {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final GuidedPublicationBaseRepository bases;

  public GuidedPublicationRepository(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.bases = new GuidedPublicationBaseRepository(jdbc, contracts);
  }

  public Optional<PublicationContracts.Receipt> receipt(String id) {
    return jdbc
        .query(
            "SELECT document::text FROM studio_guided_publications WHERE session_id=?",
            (rs, n) -> new PublicationContracts.Receipt(contracts.parse(rs.getString(1))),
            id)
        .stream()
        .findFirst();
  }

  public Optional<PublicationContracts.Receipt> receiptForRevision(UUID id) {
    return jdbc
        .query(
            "SELECT document::text FROM studio_guided_publications WHERE revision_id=?",
            (rs, n) -> new PublicationContracts.Receipt(contracts.parse(rs.getString(1))),
            id)
        .stream()
        .findFirst();
  }

  public PublicationContracts.Attempt reserve(PublicationContracts.Claim claim, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    Instant wall = wall();
    ObjectNode identity = PublicationContracts.copy(claim.snapshot().identity());
    authority(claim.sessionId(), identity, wall);
    require(
        GuidedContracts.hash(claim.snapshot().basis()).equals(identity.path("basisHash").asText()),
        "EVIDENCE_MISMATCH",
        422);
    var prior = attempts(claim.sessionId());
    for (var old : prior) {
      if (old.identity().path("finalizeKey").asText().equals(claim.finalizeKey())) {
        require(
            old.identity().path("finalizeDigest").asText().equals(claim.finalizeDigest()),
            "IDEMPOTENCY_CONFLICT",
            409);
      }
    }
    for (var old : prior) {
      if ((old.status() == PublicationContracts.AttemptStatus.RESERVED
              || old.status() == PublicationContracts.AttemptStatus.VALIDATING)
          && !old.validationDeadline().isAfter(wall)) {
        updateTerminal(old, PublicationContracts.AttemptStatus.UNKNOWN, null, "EXPIRED", wall);
      } else if (old.identity().path("snapshotHash").asText().equals(claim.snapshot().hash())
          && old.identity().path("finalizeDigest").asText().equals(claim.finalizeDigest())
          && old.validationDeadline().isAfter(wall)
          && (old.status() == PublicationContracts.AttemptStatus.RESERVED
              || old.status() == PublicationContracts.AttemptStatus.VALIDATING
              || old.status() == PublicationContracts.AttemptStatus.VALIDATED)) {
        return old;
      } else {
        require(
            old.status() != PublicationContracts.AttemptStatus.RESERVED
                && old.status() != PublicationContracts.AttemptStatus.VALIDATING,
            "IDEMPOTENCY_CONFLICT",
            409);
      }
    }
    require(prior.size() < 3, "BUDGET_EXCEEDED", 429);
    Instant deadline = Instant.parse(identity.path("validationDeadline").asText());
    require(deadline.isAfter(wall) && !deadline.isAfter(now.plusSeconds(15)), "EXPIRED", 409);
    UUID attempt = UUID.randomUUID(), owner = UUID.randomUUID();
    identity
        .put("snapshotHash", claim.snapshot().hash())
        .put("finalizeKey", claim.finalizeKey())
        .put("finalizeDigest", claim.finalizeDigest());
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_publication_attempts(session_id,attempt_id,attempt"
            + "_number,claim_id,finalize_key,finalize_digest,snapshot_hash,basis"
            + "_hash,identity,validation_deadline,status,created_at)"
            + " VALUES (?,?,?,?,?,?,?,?,?::jsonb,?,'RESERVED',?)",
        claim.sessionId(),
        attempt,
        prior.size() + 1,
        owner,
        claim.finalizeKey(),
        claim.finalizeDigest(),
        claim.snapshot().hash(),
        identity.path("basisHash").asText(),
        identity.toString(),
        Timestamp.from(deadline),
        Timestamp.from(PublicationContracts.millisecond(wall)));
    return attempt(claim.sessionId(), attempt);
  }

  public PublicationContracts.Attempt claim(
      String id, UUID attemptId, UUID claimId, String snapshotHash, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    var a = attempt(id, attemptId);
    same(a, claimId, snapshotHash);
    authority(id, a.identity(), wall());
    require(
        jdbc.update(
                "UPDATE studio_guided_publication_attempts SET"
                    + " status='VALIDATING',claimed_at=clock_timestamp() WHERE session_id=? AND"
                    + " attempt_id=? AND claim_id=? AND status='RESERVED' AND"
                    + " validation_deadline>clock_timestamp()",
                id,
                attemptId,
                claimId)
            == 1,
        "IDEMPOTENCY_CONFLICT",
        409);
    return attempt(id, attemptId);
  }

  public PublicationContracts.Attempt finish(
      String id,
      UUID attemptId,
      UUID claimId,
      String hash,
      PublicationContracts.AttemptStatus status,
      JsonNode verdict,
      String failureCode,
      Instant now) {
    GuidedPublicationBaseRepository.transaction();
    var a = attempt(id, attemptId);
    same(a, claimId, hash);
    Instant wall = wall();
    require(
        status != PublicationContracts.AttemptStatus.RESERVED
            && status != PublicationContracts.AttemptStatus.VALIDATING,
        "INVALID_CONTRACT",
        422);
    if (a.status() != PublicationContracts.AttemptStatus.RESERVED
        && a.status() != PublicationContracts.AttemptStatus.VALIDATING) {
      require(
          a.status() == status
              && java.util.Objects.equals(a.verdict(), verdict)
              && java.util.Objects.equals(a.failureCode(), failureCode),
          "IDEMPOTENCY_CONFLICT",
          409);
      return a;
    }
    if (status == PublicationContracts.AttemptStatus.VALIDATED) {
      authority(id, a.identity(), wall);
      require(
          a.status() == PublicationContracts.AttemptStatus.VALIDATING && failureCode == null,
          "INVALID_CONTRACT",
          422);
      verifyVerdict(a, verdict);
    } else {
      require(
          verdict == null && failureCode != null && failureCode.matches("[A-Z_]{1,64}"),
          "INVALID_CONTRACT",
          422);
    }
    updateTerminal(a, status, verdict, failureCode, wall);
    return attempt(id, attemptId);
  }

  public PublicationContracts.Receipt commit(PublicationContracts.Commit commit, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    var old = receipt(commit.sessionId());
    if (old.isPresent()) {
      require(
          old.get().document().path("finalizeDigest").asText().equals(commit.finalizeDigest())
              && old.get()
                  .document()
                  .path("snapshotHash")
                  .asText()
                  .equals(commit.snapshot().hash()),
          "IDEMPOTENCY_CONFLICT",
          409);
      return old.get();
    }
    var a = attempt(commit.sessionId(), commit.attemptId());
    same(a, commit.claimId(), commit.snapshot().hash());
    require(
        a.status() == PublicationContracts.AttemptStatus.VALIDATED
            && a.identity().path("finalizeDigest").asText().equals(commit.finalizeDigest()),
        "PUBLICATION_CONFLICT",
        409);
    Instant wall = wall();
    authority(commit.sessionId(), a.identity(), wall);
    verifyVerdict(a, a.verdict());
    JsonNode base = a.identity().path("base");
    var grant = commit.grant();
    require(
        grant.sessionId().equals(commit.sessionId())
            && grant.snapshotHash().equals(commit.snapshot().hash())
            && grant.principalId().equals(base.path("originalPrincipalId").asText())
            && grant.csiId().equals(base.path("csiId").asText())
            && grant.expiresAt().isAfter(wall)
            && !grant.expiresAt().isAfter(a.validationDeadline()),
        "FORBIDDEN_SCOPE",
        403);
    var candidate = commit.candidate();
    verifyCandidate(commit.snapshot(), candidate, a.verdict());
    JsonNode current = bases.lockCurrent(UUID.fromString(base.path("testId").asText())).document();
    JsonNode basis = commit.snapshot().basis();
    var source = contracts.object().putArray("items");
    for (JsonNode step : basis.path("sourceSteps")) {
      source.add(step.path("source"));
    }
    ObjectNode references = contracts.object();
    var variables = references.putArray("variables");
    references.putArray("secrets");
    var seen = new java.util.TreeSet<String>();
    for (JsonNode ref : basis.path("configurationReferences")) {
      seen.add(ref.path("referenceName").asText());
    }
    seen.forEach(variables::add);
    ObjectNode provenance = PublicationContracts.copy(candidate.hashes());
    provenance.set("profile", candidate.artifact().path("profile"));
    provenance
        .put("guidedSessionId", commit.sessionId())
        .put("publicationKind", "GUIDED_RUN")
        .put("intentDerivationVersion", "observed-1");
    provenance.set("runAuthorization", base.path("runAuthorization"));
    jdbc.update(
        "INSERT INTO"
            + " ui_test_revisions(id,test_id,csi_id,source_revision,configuratio"
            + "n_revision,source,source_hash,artifact,artifact_hash,artifact_sch"
            + "ema_version,configuration,\"references\",provenance,created_by,co"
            + "nfirmed_by,confirmed_at,confirmation_source,reference_policy,inte"
            + "nt_derivation_version,publication_kind,guided_session_id,learned_"
            + "plan_hash,revision_digest)"
            + " VALUES"
            + " (?,?,?,?,?,?::jsonb,?,?::jsonb,?,2,?::jsonb,?::jsonb,?::jsonb,?,"
            + "?,?,'GUIDED_RUN',?::jsonb,'observed-1','GUIDED_RUN',?,?,?)",
        commit.revisionId(),
        UUID.fromString(base.path("testId").asText()),
        base.path("csiId").asText(),
        Long.parseLong(base.path("sourceRevision").asText()),
        Long.parseLong(base.path("configurationRevision").asText()),
        source.toString(),
        candidate.hashes().path("sourceHash").asText(),
        candidate.artifact().toString(),
        candidate.hashes().path("artifactHash").asText(),
        current.path("configuration").toString(),
        references.toString(),
        provenance.toString(),
        grant.principalId(),
        grant.principalId(),
        Timestamp.from(PublicationContracts.millisecond(wall)),
        candidate.policy().toString(),
        commit.sessionId(),
        candidate.hashes().path("learnedPlanHash").asText(),
        candidate.hashes().path("revisionDigest").asText());
    JsonNode inserted =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT authoring::text FROM ui_test_revisions WHERE id=?",
                String.class,
                commit.revisionId()));
    require(inserted.equals(current.path("authoring")), "PUBLICATION_CONFLICT", 409);
    ObjectNode document =
        contracts
            .object()
            .put("sessionId", commit.sessionId())
            .put("revisionId", commit.revisionId().toString())
            .put("testId", base.path("testId").asText())
            .put("csiId", base.path("csiId").asText())
            .put("originalPrincipalId", grant.principalId())
            .put("finalizeKey", a.identity().path("finalizeKey").asText())
            .put("finalizeDigest", commit.finalizeDigest())
            .put("attemptId", commit.attemptId().toString())
            .put("claimId", commit.claimId().toString())
            .put("snapshotHash", commit.snapshot().hash())
            .put("basisHash", a.identity().path("basisHash").asText())
            .put("publishedAt", PublicationContracts.time(wall));
    for (String key :
        List.of(
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash",
            "revisionDigest",
            "profileHash")) {
      document.set(key, candidate.hashes().path(key));
    }
    ObjectNode publicReceipt =
        document
            .putObject("publicReceipt")
            .put("schemaVersion", 3)
            .put("sessionId", commit.sessionId())
            .put("revisionId", commit.revisionId().toString())
            .put("publishedAt", PublicationContracts.time(wall))
            .put("learnedFromThisRun", true)
            .put("replayVerified", false);
    for (String key :
        List.of("revisionDigest", "learnedPlanHash", "artifactHash", "publicationEvidenceHash")) {
      publicReceipt.set(key, candidate.hashes().path(key));
    }
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_publications(session_id,revision_id,test_id,csi_id"
            + ",attempt_id,claim_id,snapshot_hash,basis_hash,document,learned_pl"
            + "an,published_at)"
            + " VALUES (?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?)",
        commit.sessionId(),
        commit.revisionId(),
        UUID.fromString(base.path("testId").asText()),
        base.path("csiId").asText(),
        commit.attemptId(),
        commit.claimId(),
        commit.snapshot().hash(),
        a.identity().path("basisHash").asText(),
        document.toString(),
        candidate.learnedPlan().toString(),
        Timestamp.from(PublicationContracts.millisecond(wall)));
    int changed =
        jdbc.update(
            "UPDATE ui_tests SET"
                + " current_candidate_revision_id=?,confirmed_revision_id=?,compile_"
                + "request_id=NULL,compile_status='READY',compile_started_at=NULL,co"
                + "mpile_error=NULL,compile_diagnostics=NULL"
                + " WHERE id=? AND source_revision=? AND configuration_revision=? AND"
                + " publication_epoch=? AND compile_request_id IS NOT DISTINCT FROM ?::uuid AND"
                + " current_candidate_revision_id IS NOT DISTINCT FROM ?::uuid AND"
                + " confirmed_revision_id IS NOT DISTINCT FROM ?::uuid AND deleted_at IS NULL AND"
                + " quarantined_at IS NULL AND clock_timestamp()<? AND EXISTS(SELECT 1 FROM"
                + " studio_guided_sessions WHERE session_id=? AND state='FINALIZING' AND"
                + " expires_at>clock_timestamp() AND"
                + " (document->'owner'->>'leaseExpiresAt')::timestamptz>clock_timestamp())",
            commit.revisionId(),
            commit.revisionId(),
            UUID.fromString(base.path("testId").asText()),
            Long.parseLong(base.path("sourceRevision").asText()),
            Long.parseLong(base.path("configurationRevision").asText()),
            Long.parseLong(base.path("publicationEpoch").asText()),
            nullable(base.path("compileRequestId")),
            nullable(base.path("candidateRevisionId")),
            nullable(base.path("confirmedRevisionId")),
            Timestamp.from(grant.expiresAt()),
            commit.sessionId());
    require(changed == 1, "PUBLICATION_CONFLICT", 409);
    require(
        jdbc.update(
                "UPDATE studio_guided_sessions SET"
                    + " state='SUCCEEDED',document=jsonb_set(document,'{state}','\"SUCCE"
                    + "EDED\"'),progress=progress||jsonb_build_object('publicationRevisi"
                    + "onId',?::text,'publicationRevisionDigest',?::text)"
                    + " WHERE session_id=? AND state='FINALIZING'",
                commit.revisionId().toString(),
                candidate.hashes().path("revisionDigest").asText(),
                commit.sessionId())
            == 1,
        "PUBLICATION_CONFLICT",
        409);
    return new PublicationContracts.Receipt(document);
  }

  public void conflict(String id, String expectedSnapshotHash, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    if (receipt(id).isPresent()) {
      return;
    }
    ObjectNode s = session(id);
    bases.lockCurrent(UUID.fromString(s.path("testId").asText()));
    if (!s.path("state").asText().equals("FINALIZING")) {
      return;
    }
    require(
        attempts(id).stream()
            .anyMatch(a -> a.identity().path("snapshotHash").asText().equals(expectedSnapshotHash)),
        "IDEMPOTENCY_CONFLICT",
        409);
    jdbc.update(
        "UPDATE studio_guided_sessions SET"
            + " state='PUBLICATION_CONFLICT',document=jsonb_set(document,'{state}','\"PUBLICATION_CONFLICT\"')"
            + " WHERE session_id=? AND state='FINALIZING'",
        id);
  }

  private void verifyCandidate(
      PublicationContracts.Snapshot snapshot, PublicationContracts.Candidate c, JsonNode verdict) {
    JsonNode h = c.hashes(), b = snapshot.basis();
    require(
        GuidedContracts.hash(b).equals(snapshot.identity().path("basisHash").asText())
            && GuidedContracts.hash(c.artifact()).equals(h.path("artifactHash").asText())
            && GuidedContracts.hash(c.learnedPlan()).equals(h.path("learnedPlanHash").asText())
            && GuidedContracts.hash(c.policy()).equals(h.path("referencePolicyHash").asText())
            && c.artifact().path("learnedPlan").equals(c.learnedPlan())
            && c.artifact().path("replayPolicy").equals(c.policy()),
        "EVIDENCE_MISMATCH",
        422);
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      require(
          h.path(key).equals(verdict.path(key))
              && h.path(key).equals(snapshot.identity().path(key)),
          "EVIDENCE_MISMATCH",
          422);
    }
    for (String key :
        List.of("sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
      require(
          h.path(key).equals(snapshot.identity().path("base").path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        h.path("admissionProvenanceHash").equals(verdict.path("admissionProvenanceHash")),
        "EVIDENCE_MISMATCH",
        422);
    require(
        GuidedContracts.hash(c.artifact().path("profile")).equals(h.path("profileHash").asText()),
        "PROFILE_MISMATCH",
        409);
    ObjectNode digest = contracts.object().put("version", 1);
    for (String key : List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
      digest.set(key, b.path(key));
    }
    for (String key :
        List.of(
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash",
            "runAuthorizationHash",
            "profileHash")) {
      digest.set(key, h.path(key));
    }
    require(
        GuidedContracts.hash(digest).equals(h.path("revisionDigest").asText()),
        "EVIDENCE_MISMATCH",
        422);
  }

  private void verifyVerdict(PublicationContracts.Attempt a, JsonNode v) {
    require(
        v != null
            && v.path("ok").isBoolean()
            && v.path("ok").asBoolean()
            && v.path("errorCode").isNull()
            && v.path("attemptId").asText().equals(a.attemptId().toString())
            && v.path("claimId").asText().equals(a.claimId().toString()),
        "EVIDENCE_MISMATCH",
        422);
    for (String key :
        List.of(
            "snapshotHash",
            "basisHash",
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash")) {
      require(v.path(key).equals(a.identity().path(key)), "EVIDENCE_MISMATCH", 422);
    }
    require(
        GuidedContracts.hash(v.path("profile")).equals(a.identity().path("profileHash").asText())
            && GuidedContracts.hash(v.path("build"))
                .equals(a.identity().path("validationBuildHash").asText()),
        "PROFILE_MISMATCH",
        409);
  }

  private void authority(String id, JsonNode identity, Instant wall) {
    ObjectNode s = session(id);
    require(s.path("state").asText().equals("FINALIZING"), "PUBLICATION_CONFLICT", 409);
    var base =
        bases
            .find(id)
            .orElseThrow(
                () ->
                    new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                        "MISSING_SOURCE", 409));
    require(base.document().equals(identity.path("base")), "EVIDENCE_MISMATCH", 422);
    bases.requireCurrent(base, bases.lockCurrent(UUID.fromString(s.path("testId").asText())));
    require(
        s.path("owner").path("workerId").equals(identity.path("ownerWorkerId"))
            && s.path("owner").path("fence").equals(identity.path("ownerFence"))
            && Instant.parse(s.path("owner").path("leaseExpiresAt").asText()).isAfter(wall)
            && Instant.parse(s.path("expiresAt").asText()).isAfter(wall)
            && Instant.parse(identity.path("validationDeadline").asText()).isAfter(wall),
        "EXPIRED",
        409);
    String head =
        jdbc.queryForObject(
            "SELECT p.plan_hash FROM studio_guided_translation_state t JOIN"
                + " studio_guided_translation_plans p USING(session_id,plan_revision) WHERE"
                + " t.session_id=?",
            String.class,
            id);
    require(head.equals(identity.path("translationHash").asText()), "PUBLICATION_CONFLICT", 409);
    require(
        jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND"
                        + " (document->>'state'<>'SUCCEEDED' OR document->>'dispatchCount'<>'1')",
                    Integer.class,
                    id)
                == 0
            && jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND"
                        + " status IN ('RESERVED','CALLING')",
                    Integer.class,
                    id)
                == 0,
        "PUBLICATION_CONFLICT",
        409);
  }

  private ObjectNode session(String id) {
    return PublicationContracts.copy(
        contracts.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id)));
  }

  private Instant wall() {
    return jdbc.queryForObject("SELECT clock_timestamp()", Timestamp.class).toInstant();
  }

  private void same(PublicationContracts.Attempt a, UUID claimId, String hash) {
    require(
        a.claimId().equals(claimId) && a.identity().path("snapshotHash").asText().equals(hash),
        "IDEMPOTENCY_CONFLICT",
        409);
  }

  private void updateTerminal(
      PublicationContracts.Attempt a,
      PublicationContracts.AttemptStatus status,
      JsonNode verdict,
      String failure,
      Instant now) {
    jdbc.update(
        "UPDATE studio_guided_publication_attempts SET"
            + " status=?,validator_receipt=?::jsonb,failure_code=?,completed_at=? WHERE"
            + " session_id=? AND attempt_id=? AND status IN ('RESERVED','VALIDATING')",
        status.name(),
        verdict == null ? null : verdict.toString(),
        failure,
        Timestamp.from(now),
        a.sessionId(),
        a.attemptId());
  }

  private PublicationContracts.Attempt attempt(String id, UUID attempt) {
    return attempts(id).stream()
        .filter(a -> a.attemptId().equals(attempt))
        .findFirst()
        .orElseThrow(
            () ->
                new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                    "MISSING_SOURCE", 409));
  }

  private List<PublicationContracts.Attempt> attempts(String id) {
    return jdbc.query(
        "SELECT"
            + " attempt_id,claim_id,attempt_number,status,validation_deadline,id"
            + "entity::text,validator_receipt::text,failure_code"
            + " FROM studio_guided_publication_attempts WHERE session_id=? ORDER BY attempt_number",
        (rs, n) ->
            new PublicationContracts.Attempt(
                id,
                rs.getObject(1, UUID.class),
                rs.getObject(2, UUID.class),
                rs.getInt(3),
                PublicationContracts.AttemptStatus.valueOf(rs.getString(4)),
                rs.getTimestamp(5).toInstant(),
                contracts.parse(rs.getString(6)),
                rs.getString(7) == null ? null : contracts.parse(rs.getString(7)),
                rs.getString(8)),
        id);
  }

  private static String nullable(JsonNode node) {
    return node.isNull() ? null : node.asText();
  }
}
