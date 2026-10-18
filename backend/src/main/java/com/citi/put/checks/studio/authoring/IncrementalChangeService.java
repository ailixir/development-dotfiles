package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** One consistent semantic comparison shared by detail, execute and incremental start. */
@Service
public final class IncrementalChangeService {
  private static final ObjectMapper MAPPER =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
  private final JdbcTemplate jdbc;

  public IncrementalChangeService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public record Change(
      UUID baseRevisionId,
      int index,
      String firstChangedStepId,
      String reason,
      AuthoringV2Request authoring,
      IncrementalAuthoringIdentity.Identity identity,
      JsonNode configuration,
      JsonNode baseArtifact,
      String baseDigest) {
    public boolean changed() {
      return index >= 0;
    }
  }

  public Change inspect(UUID testId) {
    var rows =
        jdbc.queryForList(
            """
        SELECT t.authoring::text AS current_authoring,t.variables::text AS current_variables,
          jsonb_build_object('environment',t.environment,'browser',t.browser,
            'viewport',jsonb_build_object('width',t.viewport_width,'height',t.viewport_height),
            'timeoutSeconds',t.timeout_seconds,'waitStrategy',t.wait_strategy)::text AS current_config,
          t.confirmed_revision_id,r.authoring::text AS base_authoring,
          r.authoring_revision_inputs::text AS base_inputs,r.configuration::text AS base_config,
          r."references"::text AS base_references,r.artifact::text AS base_artifact,
          r.step_snapshot_hashes::text AS snapshot_hashes,r.step_reuse_provenance::text AS reuse_map,
          r.revision_digest
        FROM ui_tests t LEFT JOIN ui_test_revisions r ON r.id=t.confirmed_revision_id
          AND r.test_id=t.id AND r.csi_id=t.csi_id WHERE t.id=?
        """,
            testId);
    if (rows.isEmpty()) {
      throw new GuidedSessionException("MISSING_SOURCE", 409);
    }
    var row = rows.getFirst();
    UUID baseId = (UUID) row.get("confirmed_revision_id");
    if (row.get("current_authoring") == null) {
      return new Change(baseId, -1, null, null, null, null, null, null, null);
    }
    try {
      AuthoringV2Request current =
          MAPPER.readValue((String) row.get("current_authoring"), AuthoringV2Request.class);
      var identity =
          IncrementalAuthoringIdentity.resolve(
              current, CanonicalStudioCodec.parseVariables((String) row.get("current_variables")));
      JsonNode configuration = MAPPER.readTree((String) row.get("current_config"));
      if (baseId == null) {
        return result(
            null,
            current.steps().isEmpty() ? -1 : 0,
            null,
            current,
            identity,
            configuration,
            null,
            null);
      }
      try {
        AuthoringV2Request base =
            MAPPER.readValue((String) row.get("base_authoring"), AuthoringV2Request.class);
        AuthoringRevisionInputs inputs =
            MAPPER.readValue((String) row.get("base_inputs"), AuthoringRevisionInputs.class);
        JsonNode references = MAPPER.readTree((String) row.get("base_references"));
        var frozen = IncrementalAuthoringIdentity.frozen(base, inputs, references);
        JsonNode baseConfig = MAPPER.readTree((String) row.get("base_config"));
        JsonNode artifact = MAPPER.readTree((String) row.get("base_artifact"));
        ObjectNode expected =
            IncrementalAuthoringIdentity.snapshots(
                base, frozen, baseConfig, artifact.path("learnedPlan"));
        JsonNode snapshots = MAPPER.readTree((String) row.get("snapshot_hashes"));
        JsonNode reused = MAPPER.readTree((String) row.get("reuse_map"));
        if (!expected.equals(snapshots)
            || !expected.equals(artifact.path("learnedPlan").path("stepSnapshotHashes"))
            || !reused.equals(artifact.path("learnedPlan").path("reusedFrom"))) {
          throw IncrementalAuthoringIdentity.incomplete();
        }
        int index =
            IncrementalAuthoringIdentity.boundary(
                current, identity, configuration, base, frozen, baseConfig);
        return result(
            baseId,
            index,
            null,
            current,
            identity,
            configuration,
            artifact,
            (String) row.get("revision_digest"));
      } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException incomplete) {
        return result(
            baseId,
            current.steps().isEmpty() ? -1 : 0,
            "BASE_IDENTITY_INCOMPLETE",
            current,
            identity,
            configuration,
            null,
            (String) row.get("revision_digest"));
      }
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
  }

  private static Change result(
      UUID baseId,
      int index,
      String reason,
      AuthoringV2Request authoring,
      IncrementalAuthoringIdentity.Identity identity,
      JsonNode configuration,
      JsonNode artifact,
      String digest) {
    return new Change(
        baseId,
        index,
        index < 0 ? null : authoring.steps().get(index).id().toString(),
        reason,
        authoring,
        identity,
        configuration,
        artifact,
        digest);
  }
}
