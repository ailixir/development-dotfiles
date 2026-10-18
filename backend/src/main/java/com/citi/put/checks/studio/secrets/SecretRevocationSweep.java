package com.citi.put.checks.studio.secrets;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Names-only live authority; no provider read, credential cache or secret-bearing message. */
@Service
public final class SecretRevocationSweep {
  private final JdbcTemplate jdbc;
  private final StudioSecretUseAuthorization authorization;
  private final SecretUseAuditRecorder audit;
  private final TransactionTemplate transactions;
  private final Environment environment;
  private final Clock clock = Clock.systemUTC();
  private Consumer<String> guidedStop;

  public SecretRevocationSweep(
      JdbcTemplate jdbc,
      StudioSecretUseAuthorization authorization,
      SecretUseAuditRecorder audit,
      PlatformTransactionManager manager,
      Environment environment) {
    this.jdbc = jdbc;
    this.authorization = authorization;
    this.audit = audit;
    this.transactions = new TransactionTemplate(manager);
    this.environment = environment;
  }

  public void installGuidedStop(Consumer<String> stop) {
    this.guidedStop = stop;
  }

  /** Called synchronously on each progress acknowledgement/control request. */
  public boolean executionRevoked(UUID executionId) {
    return Boolean.TRUE.equals(
        transactions.execute(status -> recheck("OBSERVED_REPLAY", executionId.toString())));
  }

  /** Called synchronously before the owning worker's claim/renewal response. */
  public boolean guidedRevoked(String sessionId) {
    return Boolean.TRUE.equals(transactions.execute(status -> recheck("GUIDED", sessionId)));
  }

  @Scheduled(fixedDelayString = "${studio.secret-revocation.sweep-interval-ms:1000}")
  public void sweep() {
    if (!environment.acceptsProfiles(Profiles.of("worker"))) {
      return;
    }
    for (String id :
        jdbc.queryForList(
            ("SELECT DISTINCT a.execution_id::text FROM studio_secret_use_audit a JOIN studio_dispa"
                + "tch_ledger l ON l.execution_id=a.execution_id WHERE a.outcome='RESOLVED' AND a.decisi"
                + "on_stage='DISPATCH' AND l.state IN ('DISPATCHING','ADMITTED','RUNNING') AND a.attempt"
                + "_id=l.attempt_id::text"),
            String.class)) {
      executionRevoked(UUID.fromString(id));
    }
    for (String id :
        jdbc.queryForList(
            ("SELECT DISTINCT a.session_id FROM studio_secret_use_audit a JOIN studio_guided_sessio"
                + "ns s ON s.session_id=a.session_id WHERE a.outcome='RESOLVED' AND a.decision_stage='DI"
                + "SPATCH' AND s.state NOT IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTC"
                + "OME','CANCELLED','EXPIRED')"),
            String.class)) {
      guidedRevoked(id);
    }
  }

  private boolean recheck(String path, String id) {
    boolean guided = path.equals("GUIDED");
    String table = guided ? "studio_guided_sessions" : "studio_dispatch_ledger";
    String key = guided ? "session_id" : "execution_id";
    Object identity = guided ? id : UUID.fromString(id);
    List<Map<String, Object>> owners =
        guided
            ? jdbc.queryForList(
                "SELECT state,revoked_at FROM studio_guided_sessions WHERE session_id=? FOR UPDATE",
                identity)
            : jdbc.queryForList(
                ("SELECT l.state,l.revoked_at,e.status AS outcome_status FROM studio_dispatch_ledger l "
                    + "JOIN ui_test_executions e ON e.id=l.execution_id AND e.started_at=l.execution_accepte"
                    + "d_at WHERE l.execution_id=? FOR UPDATE OF l,e"),
                identity);
    if (owners.isEmpty()) {
      return false;
    }
    boolean revoked = owners.getFirst().get("revoked_at") != null;
    String state = (String) owners.getFirst().get("state");
    if (guided
        ? List.of(
                "SUCCEEDED",
                "PUBLICATION_CONFLICT",
                "FAILED",
                "UNKNOWN_OUTCOME",
                "CANCELLED",
                "EXPIRED")
            .contains(state)
        : "DONE".equals(state)
            || !List.of("PENDING", "RUNNING").contains(owners.getFirst().get("outcome_status"))) {
      return revoked;
    }
    var releases =
        guided
            ? jdbc.queryForList(
                ("SELECT * FROM studio_secret_use_audit WHERE path='GUIDED' AND session_id=? AND decisi"
                    + "on_stage='DISPATCH' AND outcome='RESOLVED'"),
                identity)
            : jdbc.queryForList(
                ("SELECT a.* FROM studio_secret_use_audit a JOIN studio_dispatch_ledger l ON l.executio"
                    + "n_id=a.execution_id WHERE a.path='OBSERVED_REPLAY' AND a.execution_id=? AND a.decisio"
                    + "n_stage='DISPATCH' AND a.outcome='RESOLVED' AND l.state IN ('DISPATCHING','ADMITTED',"
                    + "'RUNNING') AND a.attempt_id=l.attempt_id::text AND NOT EXISTS(SELECT 1 FROM studio_se"
                    + "cret_use_audit u WHERE u.release_id=a.id AND u.row_kind='USAGE' AND u.usage_outcome I"
                    + "N ('REFUSED','NOT_USED'))"),
                identity);
    Instant now = clock.instant();
    for (var row : releases) {
      if (!authorization.mayUse(
          (String) row.get("principal_id"),
          (String) row.get("csi_id"),
          (String) row.get("environment"),
          (String) row.get("secret_id"))) {
        revoked = true;
        jdbc.update(
            "UPDATE " + table + " SET revoked_at=? WHERE " + key + "=? AND revoked_at IS NULL",
            Timestamp.from(now),
            identity);
        var scope =
            new SecretUseAuditRecorder.Scope(
                SecretUseAuditRecorder.Path.valueOf(path),
                (UUID) row.get("execution_id"),
                (String) row.get("session_id"),
                (String) row.get("admission_id"),
                (String) row.get("principal_id"),
                (String) row.get("csi_id"),
                (String) row.get("environment"),
                (UUID) row.get("test_id"),
                (String) row.get("secret_id"),
                (String) row.get("attempt_id"),
                ((Number) row.get("release_seq")).longValue(),
                (String) row.get("coordinate_step_id"),
                (Integer) row.get("coordinate_ordinal"),
                (String) row.get("source_reference_id"));
        audit.recordLiveRevocation(
            new SecretUseAuditRecorder.Release(
                (UUID) row.get("id"),
                ((Timestamp) row.get("release_occurred_at")).toInstant(),
                scope,
                (String) row.get("vault_version"),
                SecretUseAuditRecorder.ResolutionOutcome.RESOLVED));
      }
    }
    if (guided && !revoked) {
      var declarations =
          jdbc.queryForList(
              ("SELECT s.document::text AS session,m.manifest::text AS manifest FROM studio_guided_se"
                  + "ssions s JOIN studio_guided_source_manifests m ON m.session_id=s.session_id WHERE s.s"
                  + "ession_id=?"),
              id);
      for (var declaration : declarations) {
        var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
        var scope = contracts.parse((String) declaration.get("session")).path("scope");
        for (var reference :
            contracts.parse((String) declaration.get("manifest")).path("configurationReferences")) {
          if (reference.path("kind").asText().equals("secretRef")
              && !authorization.mayUse(
                  scope.path("principalId").asText(),
                  scope.path("csiId").asText(),
                  scope.path("environmentId").asText(),
                  reference.path("referenceName").asText())) {
            revoked = true;
            jdbc.update(
                "UPDATE studio_guided_sessions SET revoked_at=? WHERE session_id=? AND revoked_at IS NULL",
                Timestamp.from(now),
                id);
          }
        }
      }
      // No released value means no fictional LIVE_RECHECK release/audit locator is minted.
    }
    if (revoked && guided && guidedStop != null) {
      guidedStop.accept(id);
    }
    return revoked;
  }
}
