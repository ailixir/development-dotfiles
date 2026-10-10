package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Pure immutable revision/receipt verification. It cannot publish, infer, call Core or run a page.
 */
public final class ObservedRevisionVerifier {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;
  private final GuidedPublicationRepository publications;
  private final ObservedReplayPins pins;
  private final ObservedReplayProperties properties;

  public ObservedRevisionVerifier(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      GuidedPublicationRepository publications,
      ObservedReplayPins pins,
      ObservedReplayProperties properties) {
    this.jdbc = jdbc;
    this.contracts = contracts;
    this.publications = publications;
    this.pins = pins;
    this.properties = properties;
  }

  public ObjectNode verify(UUID revisionId) {
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    var rows =
        jdbc.queryForList(
            "SELECT"
                + " id,test_id,csi_id,publication_kind,guided_session_id,compile_req"
                + "uest_id,confirmed_by,confirmed_at,confirmation_source,artifact_sc"
                + "hema_version,artifact::text"
                + " AS artifact,configuration::text AS configuration,reference_policy::text AS"
                + " policy,provenance::text AS"
                + " provenance,source_revision,configuration_revision,source_hash,ar"
                + "tifact_hash,learned_plan_hash,revision_digest"
                + " FROM ui_test_revisions WHERE id=?",
            revisionId);
    require(rows.size() == 1, "MISSING_SOURCE", 409);
    var row = rows.getFirst();
    require(
        "GUIDED_RUN".equals(row.get("publication_kind"))
            && "GUIDED_RUN".equals(row.get("confirmation_source"))
            && row.get("compile_request_id") == null
            && row.get("confirmed_by") != null
            && row.get("confirmed_at") != null
            && ((Number) row.get("artifact_schema_version")).intValue() == 2,
        "EVIDENCE_MISMATCH",
        409);
    var receipt =
        publications
            .receiptForRevision(revisionId)
            .orElseThrow(() -> new GuidedSessionException("MISSING_SOURCE", 409))
            .document();
    require(
        text(receipt, "revisionId").equals(revisionId.toString())
            && text(receipt, "sessionId").equals(row.get("guided_session_id"))
            && text(receipt, "testId").equals(row.get("test_id").toString())
            && text(receipt, "csiId").equals(row.get("csi_id"))
            && text(receipt, "originalPrincipalId").equals(row.get("confirmed_by")),
        "EVIDENCE_MISMATCH",
        409);
    JsonNode artifact = contracts.parse((String) row.get("artifact")),
        policy = contracts.parse((String) row.get("policy")),
        configuration = contracts.parse((String) row.get("configuration")),
        provenance = contracts.parse((String) row.get("provenance"));
    contracts.validate("v2/replay-artifact", artifact);
    contracts.validate("v2/replay-policy", policy);
    contracts.validate("v2/replay-profile#/definitions/Configuration", configuration);
    pins.supported(artifact.path("profile"), null);
    require(
        GuidedContracts.hash(artifact).equals(row.get("artifact_hash"))
            && GuidedContracts.hash(configuration)
                .equals(artifact.path("configurationHash").asText())
            && GuidedContracts.hash(policy).equals(receipt.path("referencePolicyHash").asText())
            && artifact.path("replayPolicy").equals(policy)
            && GuidedContracts.hash(artifact.path("learnedPlan"))
                .equals(row.get("learned_plan_hash"))
            && artifact.path("learnedPlanHash").asText().equals(row.get("learned_plan_hash")),
        "EVIDENCE_MISMATCH",
        409);
    ObjectNode equivalence = contracts.object();
    var operations = equivalence.putArray("operations");
    int index = 0;
    for (JsonNode step : artifact.path("steps")) {
      require(
          step.path("stepIndex").asInt(-1) == index
              && step.path("stepId")
                  .equals(artifact.path("learnedPlan").path("sourceSteps").get(index++)),
          "OPERATION_MISMATCH",
          409);
      for (JsonNode operation : step.path("operations")) {
        int at = operations.size();
        require(
            at < artifact.path("learnedPlan").path("actions").size(), "OPERATION_MISMATCH", 409);
        JsonNode original = artifact.path("learnedPlan").path("actions").get(at);
        JsonNode guard =
            GuidedPlanBuilder.unique(
                artifact.path("guards"), "guardId", text(operation, "guardId"));
        require(
            operation.path("coordinate").equals(original.path("coordinate"))
                && operation.path("operation").equals(original.path("operation"))
                && guard.path("origin").equals(original.path("origin"))
                && (original.path("locator").isNull()
                    ? !guard.path("target").has("locator")
                    : guard.path("target").path("locator").equals(original.path("locator"))),
            "OPERATION_MISMATCH",
            409);
        operations.add(operation);
      }
    }
    require(
        operations.size() == artifact.path("learnedPlan").path("actions").size(),
        "OPERATION_MISMATCH",
        409);
    equivalence.set("guards", artifact.path("guards"));
    equivalence.set("inputRecipes", artifact.path("inputRecipes"));
    equivalence.set("bindings", policy.path("bindings"));
    equivalence.set("transfers", policy.path("transfers"));
    require(
        GuidedContracts.hash(equivalence).equals(text(receipt, "operationEquivalenceHash")),
        "OPERATION_MISMATCH",
        409);
    for (String field :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash",
            "revisionDigest",
            "profileHash")) {
      require(receipt.path(field).equals(provenance.path(field)), "EVIDENCE_MISMATCH", 409);
    }
    ObjectNode identity =
        contracts
            .object()
            .put("version", 1)
            .put("testId", row.get("test_id").toString())
            .put("csiId", row.get("csi_id").toString())
            .put("sourceRevision", row.get("source_revision").toString())
            .put("configurationRevision", row.get("configuration_revision").toString());
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
      identity.set(key, provenance.path(key));
    }
    require(
        GuidedContracts.hash(identity).equals(row.get("revision_digest"))
            && provenance.path("sourceHash").asText().equals(row.get("source_hash")),
        "EVIDENCE_MISMATCH",
        409);
    ObjectNode result = contracts.object().put("revisionId", revisionId.toString());
    result.set("identity", identity);
    result.set("artifact", artifact);
    result.set("configuration", configuration);
    result.set("policy", policy);
    result.set("receipt", receipt);
    return result;
  }
}
