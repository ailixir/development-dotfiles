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

  public void assertResolvedSecretLiterals(
      JsonNode artifact,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver.Resolved resolved) {
    assertResolvedSecretLiterals(
        artifact, resolved, new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode());
  }

  public void assertResolvedSecretLiterals(
      JsonNode artifact,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver.Resolved resolved,
      JsonNode inputs) {
    var secrets = resolved.secretValues();
    for (JsonNode step : artifact.path("steps")) {
      for (JsonNode action : step.path("operations")) {
        JsonNode operation = action.path("operation");
        if (operation.path("kind").asText().equals("fill")) {
          JsonNode value = operation.path("value");
          if (value.path("kind").asText().equals("authoredLiteral")) {
            for (JsonNode input : inputs) {
              if (input.path("inputId").equals(value.path("sourceInputId"))) {
                require(
                    secrets.values().stream()
                        .noneMatch(secret -> secret.matches(input.path("value").asText())),
                    "REFERENCE_MISMATCH",
                    422);
              }
            }
          }
          if (value.isTextual() || value.path("kind").asText().equals("literal")) {
            String literal = value.isTextual() ? value.textValue() : value.path("value").asText();
            require(
                secrets.values().stream().noneMatch(secret -> secret.matches(literal)),
                "REFERENCE_MISMATCH",
                422);
          }
        }
      }
    }
  }

  public ObjectNode verify(UUID revisionId) {
    require(properties.enabled(), "RUNTIME_INCOMPATIBLE", 409);
    var rows =
        jdbc.queryForList(
            "SELECT"
                + " id,test_id,csi_id,publication_kind,guided_session_id,confirmed_by,"
                + "confirmed_at,confirmation_source,artifact_schema_version,artifact::text"
                + " AS artifact,configuration::text AS configuration,reference_policy::text AS"
                + " policy,provenance::text AS"
                + " provenance,source_revision,configuration_revision,source_hash,ar"
                + "tifact_hash,learned_plan_hash,revision_digest"
                + " FROM ui_test_revisions WHERE id=?",
            revisionId);
    require(rows.size() == 1, "MISSING_SOURCE", 409);
    var row = rows.getFirst();
    require(
        ((Number) row.get("artifact_schema_version")).intValue() == 3, "RUNTIME_INCOMPATIBLE", 409);
    require(
        "GUIDED_RUN".equals(row.get("publication_kind"))
            && "GUIDED_RUN".equals(row.get("confirmation_source"))
            && row.get("confirmed_by") != null
            && row.get("confirmed_at") != null,
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
    contracts.validate("v3/replay-artifact", artifact);
    contracts.validate("v3/replay-policy", policy);
    contracts.validate("v3/replay-profile#/definitions/Configuration", configuration);
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
    JsonNode authoring =
        contracts.parse(
            jdbc.queryForObject(
                "SELECT authoring::text FROM ui_test_revisions WHERE id=?",
                String.class,
                revisionId));
    var metadata =
        jdbc.queryForMap(
            "SELECT authoring_revision_inputs::text,\"references\"::text AS reference_identity,"
                + "step_snapshot_hashes::text,step_reuse_provenance::text FROM ui_test_revisions WHERE id=?",
            revisionId);
    require(
        metadata.get("authoring_revision_inputs") != null
            && metadata.get("reference_identity") != null
            && metadata.get("step_snapshot_hashes") != null
            && metadata.get("step_reuse_provenance") != null,
        "LEARN_REQUIRED",
        409);
    try {
      var mapper =
          new com.fasterxml.jackson.databind.ObjectMapper()
              .findAndRegisterModules()
              .disable(
                  com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
              .disable(
                  com.fasterxml.jackson.databind.DeserializationFeature
                      .ADJUST_DATES_TO_CONTEXT_TIME_ZONE);
      var frozenAuthoring =
          mapper.treeToValue(authoring, com.citi.put.checks.studio.dto.AuthoringV2Request.class);
      var inputs =
          mapper.readValue(
              (String) metadata.get("authoring_revision_inputs"),
              com.citi.put.checks.studio.dto.AuthoringRevisionInputs.class);
      JsonNode references = contracts.parse((String) metadata.get("reference_identity"));
      if (references.path("authoringIdentityVersion").asInt() != 1
          || metadata.get("step_snapshot_hashes") == null
          || metadata.get("step_reuse_provenance") == null) {
        throw new GuidedSessionException("LEARN_REQUIRED", 409);
      }
      var complete =
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.frozen(
              frozenAuthoring, inputs, references);
      JsonNode snapshots =
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.snapshots(
              frozenAuthoring, complete, configuration, artifact.path("learnedPlan"));
      require(
          snapshots.equals(contracts.parse((String) metadata.get("step_snapshot_hashes")))
              && snapshots.equals(artifact.path("learnedPlan").path("stepSnapshotHashes"))
              && contracts
                  .parse((String) metadata.get("step_reuse_provenance"))
                  .equals(artifact.path("learnedPlan").path("reusedFrom")),
          "EVIDENCE_MISMATCH",
          409);
      var plain =
          new java.util.TreeSet<String>(
              com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.UTF8);
      var secrets =
          new java.util.TreeSet<String>(
              com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.UTF8);
      for (JsonNode recipe : artifact.path("inputRecipes")) {
        if (recipe.path("provenance").path("kind").asText().equals("configuration")) {
          (recipe.path("kind").asText().equals("secretRef") ? secrets : plain)
              .add(recipe.path("provenance").path("referenceName").asText());
        }
      }
      require(
          mapper.valueToTree(plain).equals(references.path("variables"))
              && mapper.valueToTree(secrets).equals(references.path("secrets")),
          "EVIDENCE_MISMATCH",
          409);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new GuidedSessionException("EVIDENCE_MISMATCH", 409);
    } catch (GuidedSessionException failure) {
      if (failure.messageCode().equals("BASE_IDENTITY_INCOMPLETE")) {
        throw new GuidedSessionException("LEARN_REQUIRED", 409);
      }
      throw failure;
    }
    for (JsonNode recipe : artifact.path("inputRecipes")) {
      JsonNode recipeProvenance = recipe.path("recipeProvenance");
      if (recipeProvenance.path("kind").asText().equals("sourceSpan")) {
        String source =
            text(
                GuidedPlanBuilder.unique(authoring.path("steps"), "id", text(recipe, "stepId")),
                "text");
        int start = recipeProvenance.path("start").asInt(-1),
            end = recipeProvenance.path("end").asInt(-1);
        require(start >= 0 && end > start && end <= source.length(), "REFERENCE_MISMATCH", 422);
        var token =
            java.util.regex.Pattern.compile("<secret\\s+[A-Za-z0-9_.-]{1,64}>").matcher(source);
        while (token.find()) {
          require(end <= token.start() || start >= token.end(), "REFERENCE_MISMATCH", 422);
        }
      }
    }
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
