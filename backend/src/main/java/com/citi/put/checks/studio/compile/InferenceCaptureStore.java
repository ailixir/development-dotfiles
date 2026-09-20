package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.incremental.CompilationPlanner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** JDBC operations joining the state service's draft-first transaction. */
final class InferenceCaptureStore {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private final JdbcTemplate jdbc;

  InferenceCaptureStore(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  boolean requestIdentityAvailable() {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            """
        SELECT NOT EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ui_test_revisions'::regclass
            AND conname = 'uq_ui_test_revisions_identity')
          AND EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'ui_test_revisions'::regclass
            AND tgname = 'trg_ui_test_revision_require_request' AND NOT tgisinternal)
        """,
            Boolean.class));
  }

  CompileStateService.Capture persist(
      CompileRequest request,
      CompileInputs inputs,
      String fingerprint,
      Duration duration,
      String requestedMode,
      boolean incrementalEnabled) {
    Map<String, Object> metadata =
        jdbc.queryForMap(
            """
        SELECT authoring_snapshot::text, authoring_hash, scope_reviewed_by, scope_reviewed_at
          FROM ui_tests WHERE id = ?
        """,
            inputs.testId());
    String authoring = (String) metadata.get("authoring_snapshot");
    String hash = (String) metadata.get("authoring_hash");
    List<CompilationPlanner.Step> steps = steps(authoring, inputs, request);
    if (!steps.stream()
        .map(CompilationPlanner.Step::text)
        .toList()
        .equals(inputs.orderedSource())) {
      throw new IllegalStateException("Authoring snapshot differs from captured source");
    }
    // Baseline selection is deliberately restricted to retained, revision-linked FULL evidence.
    CompilationPlanner.Baseline baseline = null;
    boolean reviewed =
        authoring != null
            && "STEP_SCOPED".equals(parse(authoring).path("scope").path("declaration").asText())
            && metadata.get("scope_reviewed_at") != null;
    Map<String, Object> evidence = null;
    if (authoring != null && !"FULL".equals(requestedMode)) {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              """
          SELECT r.id, r.compile_request_id, r.authoring_snapshot::text, r.artifact::text,
                 r.compilation_fingerprint, r.scope_reviewed_at, r.provenance::text, r.configuration_revision,
                 e.id AS execution_id, e.started_at AS execution_started_at
            FROM ui_test_revisions r
            LEFT JOIN LATERAL (
              SELECT x.id, x.started_at FROM ui_test_executions x
               WHERE x.revision_id = r.id AND x.ui_test_id = r.test_id AND x.csi_id = r.csi_id
                 AND x.status = 'PASSED' AND x.execution_scope = 'FULL'
                 AND x.configuration_snapshot->>'sourceRevision' = r.source_revision::text
                 AND x.configuration_snapshot->>'configurationRevision' = r.configuration_revision::text
                 AND x.configuration_snapshot->>'artifactHash' = r.artifact_hash
                 AND x.configuration_snapshot->>'browser' = r.configuration->>'browser'
                 AND x.configuration_snapshot->>'viewportWidth' = r.configuration->'viewport'->>'width'
                 AND x.configuration_snapshot->>'viewportHeight' = r.configuration->'viewport'->>'height'
                 AND x.configuration_snapshot->>'timeoutSeconds' = r.configuration->>'timeoutSeconds'
                 AND x.configuration_snapshot->>'waitStrategy' = r.configuration->>'waitStrategy'
                 AND x.configuration_snapshot->>'environment' = r.configuration->>'environment'
                 AND x.runtime_versions->>'validator' = r.provenance->>'validatorSchemaVersion'
                 AND x.runtime_versions->>'executor' = r.provenance->>'executorVersion'
                 AND x.runtime_versions->>'playwright' = r.provenance->>'playwrightVersion'
               ORDER BY x.started_at DESC, x.id DESC LIMIT 1
            ) e ON TRUE
           WHERE r.test_id = ? AND r.csi_id = ? AND r.confirmed_at IS NOT NULL
             AND r.authoring_snapshot IS NOT NULL AND r.compile_request_id IS NOT NULL
             AND r.compilation_fingerprint = ?
             AND r."references" = CAST(? AS jsonb)
             AND (e.id IS NOT NULL OR (r.authoring_snapshot = CAST(? AS jsonb)
               AND r.source_revision = ? AND r.configuration_revision <> ?))
           ORDER BY r.created_at DESC, r.id DESC LIMIT 1
          """,
              inputs.testId(),
              inputs.csiId(),
              fingerprint,
              inputs.referencesJson(),
              authoring,
              request.sourceRevision(),
              request.configurationRevision());
      if (!rows.isEmpty()) {
        evidence = rows.getFirst();
        List<CompilationPlanner.Step> previous =
            steps((String) evidence.get("authoring_snapshot"), inputs, request);
        List<String> code = new ArrayList<>();
        parse((String) evidence.get("artifact"))
            .path("steps")
            .forEach(step -> code.add(step.path("code").asText()));
        baseline =
            new CompilationPlanner.Baseline(
                (UUID) evidence.get("id"),
                (UUID) evidence.get("compile_request_id"),
                previous,
                code,
                fingerprint,
                evidence.get("scope_reviewed_at") != null
                    && "STEP_SCOPED"
                        .equals(
                            parse((String) evidence.get("authoring_snapshot"))
                                .path("scope")
                                .path("declaration")
                                .asText()),
                evidence.get("execution_id") != null,
                true);
      }
    }
    CompilationPlanner.Plan plan =
        CompilationPlanner.plan(
            steps,
            "FULL".equals(requestedMode),
            incrementalEnabled,
            authoring != null,
            reviewed,
            fingerprint,
            baseline);
    if (baseline != null
        && !parse(authoring)
            .path("scope")
            .equals(parse((String) evidence.get("authoring_snapshot")).path("scope"))) {
      plan =
          new CompilationPlanner.Plan(
              CompilationPlanner.Mode.FULL,
              "SCOPE_UNKNOWN",
              steps.stream().map(CompilationPlanner.Step::id).toList(),
              0);
    }
    if (plan.mode() == CompilationPlanner.Mode.REUSE
        && evidence != null
        && ((Number) evidence.get("configuration_revision")).longValue()
            != request.configurationRevision()) {
      plan =
          new CompilationPlanner.Plan(
              CompilationPlanner.Mode.REUSE,
              "CONFIGURATION_ONLY",
              plan.writableIds(),
              plan.reusedPrefix());
    }
    if (plan.mode() == CompilationPlanner.Mode.FULL) {
      baseline = null;
      evidence = null;
    }
    ObjectNode planJson = MAPPER.createObjectNode();
    planJson.put("requestedMode", requestedMode);
    planJson.put("selectedMode", plan.mode().name());
    planJson.put("reason", plan.reason());
    planJson.put("compilationFingerprint", fingerprint);
    planJson.put("baselineRevisionId", baseline == null ? null : baseline.revisionId().toString());
    planJson.put(
        "baselineExecutionId",
        evidence == null || evidence.get("execution_id") == null
            ? null
            : evidence.get("execution_id").toString());
    planJson.put(
        "baselineExecutionStartedAt",
        evidence == null || evidence.get("execution_started_at") == null
            ? null
            : ((java.sql.Timestamp) evidence.get("execution_started_at")).toInstant().toString());
    planJson.set("writableStepIds", MAPPER.valueToTree(plan.writableIds()));
    planJson.set(
        "reusedStepIds",
        MAPPER.valueToTree(
            steps.subList(0, plan.reusedPrefix()).stream()
                .map(CompilationPlanner.Step::id)
                .toList()));
    planJson.put("impactPolicyVersion", "1.0.0");
    String source = ArtifactCanonicalizer.canonicalSource(inputs.orderedSource());
    jdbc.update(
        """
        INSERT INTO ui_test_compile_requests
          (request_id,test_id,csi_id,source_revision,configuration_revision,source,source_hash,
           authoring_snapshot,authoring_hash,scope_reviewed_by,scope_reviewed_at,
           configuration,"references",compilation_fingerprint,compilation_plan,
           baseline_revision_id,created_by,deadline_at)
        VALUES (?,?,?,?,?,CAST(? AS jsonb),?,CAST(? AS jsonb),?,?,?,
                CAST(? AS jsonb),CAST(? AS jsonb),?,CAST(? AS jsonb),?,?,
                NOW() + make_interval(secs => ?))
        """,
        request.requestId(),
        inputs.testId(),
        inputs.csiId(),
        request.sourceRevision(),
        request.configurationRevision(),
        source,
        ArtifactCanonicalizer.hash(source),
        authoring,
        hash,
        metadata.get("scope_reviewed_by"),
        metadata.get("scope_reviewed_at"),
        inputs.configurationJson(),
        inputs.referencesJson(),
        fingerprint,
        planJson.toString(),
        baseline == null ? null : baseline.revisionId(),
        inputs.principal(),
        duration.toMillis() / 1000.0d);
    return new CompileStateService.Capture(
        request,
        inputs,
        steps,
        plan,
        baseline,
        hash,
        fingerprint,
        evidence == null ? null : (String) evidence.get("provenance"));
  }

  private static List<CompilationPlanner.Step> steps(
      String authoring, CompileInputs inputs, CompileRequest request) {
    List<CompilationPlanner.Step> result = new ArrayList<>();
    if (authoring != null) {
      parse(authoring)
          .path("steps")
          .forEach(
              step ->
                  result.add(
                      new CompilationPlanner.Step(
                          UUID.fromString(step.path("id").asText()), step.path("text").asText())));
    } else {
      for (int i = 0; i < inputs.orderedSource().size(); i++) {
        UUID id =
            UUID.nameUUIDFromBytes(
                (request.requestId() + ":" + i).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        result.add(new CompilationPlanner.Step(id, inputs.orderedSource().get(i)));
      }
    }
    return List.copyOf(result);
  }

  private static JsonNode parse(String value) {
    try {
      return MAPPER.readTree(value);
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Invalid stored capture", e);
    }
  }
}
