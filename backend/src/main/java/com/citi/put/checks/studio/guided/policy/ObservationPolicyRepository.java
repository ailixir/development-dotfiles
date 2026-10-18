package com.citi.put.checks.studio.guided.policy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * JDBC access to the V19 governed-policy tables (STUDIO-OBS-014 AC-1, ruling AR-2 h). Every
 * integrity rule (dense versions, approver is not the author, approval activates, active version
 * only moves forward, the trigger-only audit chain and the session freeze) is enforced by the V19
 * triggers; this class only reads and writes rows. Callers hold the transaction.
 */
public class ObservationPolicyRepository {

  /** The governed policy in force for one (CSI, application, environment). */
  public record ActivePolicy(
      UUID policyId, int version, JsonNode document, String observationPolicyHash) {}

  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public ObservationPolicyRepository(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  public boolean exists(String csiId, String applicationId, String environmentId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_policies WHERE csi_id=? AND application_id=? AND"
                + " environment_id=?",
            Integer.class,
            csiId,
            applicationId,
            environmentId);
    return count != null && count > 0;
  }

  /**
   * Every application that has a governed policy row for this CSI and environment, whether its
   * latest version is approved, pending or not yet approved (STUDIO-OBS-008 P6). Read only: it
   * names candidates so the real start can still answer {@code POLICY_NOT_APPROVED}.
   */
  public List<String> applicationIds(String csiId, String environmentId) {
    return jdbc.queryForList(
        "SELECT DISTINCT application_id FROM studio_guided_policies WHERE csi_id=? AND"
            + " environment_id=? ORDER BY application_id",
        String.class,
        csiId,
        environmentId);
  }

  public void insertPolicy(
      UUID policyId, String csiId, String applicationId, String environmentId, String createdBy) {
    jdbc.update(
        "INSERT INTO studio_guided_policies(policy_id,csi_id,application_id,environment_id,"
            + "created_by) VALUES (?,?,?,?,?)",
        policyId,
        csiId,
        applicationId,
        environmentId,
        createdBy);
  }

  /** Locks the policy row; empty when unknown. Versions and approvals serialize on it. */
  public Optional<ObjectNode> lock(UUID policyId) {
    List<ObjectNode> rows =
        jdbc.query(
            "SELECT policy_id,csi_id,application_id,environment_id,created_by,active_version FROM"
                + " studio_guided_policies WHERE policy_id=? FOR UPDATE",
            (rs, n) -> policyRow(rs),
            policyId);
    return rows.stream().findFirst();
  }

  public Optional<ObjectNode> find(UUID policyId) {
    List<ObjectNode> rows =
        jdbc.query(
            "SELECT policy_id,csi_id,application_id,environment_id,created_by,active_version FROM"
                + " studio_guided_policies WHERE policy_id=?",
            (rs, n) -> policyRow(rs),
            policyId);
    return rows.stream().findFirst();
  }

  public int latestVersion(UUID policyId) {
    Integer latest =
        jdbc.queryForObject(
            "SELECT COALESCE(max(version),0) FROM studio_guided_policy_versions WHERE policy_id=?",
            Integer.class,
            policyId);
    return latest == null ? 0 : latest;
  }

  public void insertVersion(
      UUID policyId,
      int version,
      JsonNode document,
      String documentHash,
      String observationPolicyHash,
      String createdBy) {
    jdbc.update(
        "INSERT INTO studio_guided_policy_versions(policy_id,version,document,document_hash,"
            + "observation_policy_hash,created_by) VALUES (?,?,?::jsonb,?,?,?)",
        policyId,
        version,
        document.toString(),
        documentHash,
        observationPolicyHash,
        createdBy);
  }

  public Optional<ObjectNode> version(UUID policyId, int version) {
    return versions(policyId, version).stream().findFirst();
  }

  public boolean approved(UUID policyId, int version) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_policy_approvals WHERE policy_id=? AND version=?",
            Integer.class,
            policyId,
            version);
    return count != null && count > 0;
  }

  public void insertApproval(UUID policyId, int version, String approvedBy, String approvalRef) {
    jdbc.update(
        "INSERT INTO studio_guided_policy_approvals(policy_id,version,approved_by,approval_ref)"
            + " VALUES (?,?,?,?)",
        policyId,
        version,
        approvedBy,
        approvalRef);
  }

  /** The approved, active version for a scope, if any. */
  public Optional<ActivePolicy> active(String csiId, String applicationId, String environmentId) {
    List<ActivePolicy> rows =
        jdbc.query(
            "SELECT p.policy_id,v.version,v.document::text,v.observation_policy_hash FROM"
                + " studio_guided_policies p JOIN studio_guided_policy_versions v ON"
                + " v.policy_id=p.policy_id AND v.version=p.active_version JOIN"
                + " studio_guided_policy_approvals a ON a.policy_id=v.policy_id AND"
                + " a.version=v.version WHERE p.csi_id=? AND p.application_id=? AND"
                + " p.environment_id=? FOR SHARE OF p",
            (rs, n) ->
                new ActivePolicy(
                    rs.getObject(1, UUID.class),
                    rs.getInt(2),
                    contracts.parse(rs.getString(3)),
                    rs.getString(4)),
            csiId,
            applicationId,
            environmentId);
    return rows.stream().findFirst();
  }

  /** The policy id and its version state for a scope, if a policy exists. */
  public record ScopeState(UUID policyId, Integer activeVersion, int latestVersion) {}

  public Optional<ScopeState> state(String csiId, String applicationId, String environmentId) {
    List<ScopeState> rows =
        jdbc.query(
            "SELECT p.policy_id,p.active_version,(SELECT COALESCE(max(v.version),0) FROM"
                + " studio_guided_policy_versions v WHERE v.policy_id=p.policy_id) FROM"
                + " studio_guided_policies p WHERE p.csi_id=? AND p.application_id=? AND"
                + " p.environment_id=?",
            (rs, n) -> {
              int active = rs.getInt(2);
              Integer activeVersion = rs.wasNull() ? null : active;
              return new ScopeState(rs.getObject(1, UUID.class), activeVersion, rs.getInt(3));
            },
            csiId,
            applicationId,
            environmentId);
    return rows.stream().findFirst();
  }

  /** The start-time freeze; the V19 trigger re-checks approval, activity, hash and CSI. */
  public void freeze(String sessionId, ActivePolicy policy) {
    jdbc.update(
        "INSERT INTO studio_guided_session_policies(session_id,policy_id,policy_version,"
            + "observation_policy_hash) VALUES (?,?,?,?)",
        sessionId,
        policy.policyId(),
        policy.version(),
        policy.observationPolicyHash());
  }

  /** The policy frozen into a session at start, if any. */
  public Optional<ActivePolicy> frozen(String sessionId) {
    List<ActivePolicy> rows =
        jdbc.query(
            "SELECT s.policy_id,s.policy_version,v.document::text,s.observation_policy_hash FROM"
                + " studio_guided_session_policies s JOIN studio_guided_policy_versions v ON"
                + " v.policy_id=s.policy_id AND v.version=s.policy_version WHERE s.session_id=?",
            (rs, n) ->
                new ActivePolicy(
                    rs.getObject(1, UUID.class),
                    rs.getInt(2),
                    contracts.parse(rs.getString(3)),
                    rs.getString(4)),
            sessionId);
    return rows.stream().findFirst();
  }

  private List<ObjectNode> versions(UUID policyId, Integer only) {
    return jdbc.query(
        "SELECT v.version,v.document::text,v.document_hash,v.observation_policy_hash,v.created_by,"
            + "v.created_at,a.approved_by,a.approval_ref,a.approved_at FROM"
            + " studio_guided_policy_versions v LEFT JOIN studio_guided_policy_approvals a ON"
            + " a.policy_id=v.policy_id AND a.version=v.version WHERE v.policy_id=? AND (?::int IS"
            + " NULL OR v.version=?::int) ORDER BY v.version",
        (rs, n) -> {
          ObjectNode row =
              contracts
                  .object()
                  .put("version", rs.getInt(1))
                  .set("document", contracts.parse(rs.getString(2)));
          row.put("documentHash", rs.getString(3))
              .put("observationPolicyHash", rs.getString(4))
              .put("createdBy", rs.getString(5))
              .put("createdAt", time(rs.getTimestamp(6)));
          if (rs.getString(7) == null) {
            row.set("approval", NullNode.instance);
          } else {
            row.putObject("approval")
                .put("approvedBy", rs.getString(7))
                .put("approvalRef", rs.getString(8))
                .put("approvedAt", time(rs.getTimestamp(9)));
          }
          return row;
        },
        policyId,
        only,
        only);
  }

  private ObjectNode policyRow(ResultSet rs) throws SQLException {
    ObjectNode row =
        contracts
            .object()
            .put("policyId", rs.getObject(1, UUID.class).toString())
            .put("csiId", rs.getString(2))
            .put("applicationId", rs.getString(3))
            .put("environmentId", rs.getString(4))
            .put("createdBy", rs.getString(5));
    int active = rs.getInt(6);
    if (rs.wasNull()) {
      row.putNull("activeVersion");
    } else {
      row.put("activeVersion", active);
    }
    return row;
  }

  private static String time(Timestamp value) {
    return com.citi.put.checks.studio.guided.publication.PublicationContracts.time(
        com.citi.put.checks.studio.guided.publication.PublicationContracts.millisecond(
            value.toInstant()));
  }
}
