package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;

/** Reads one locked current draft. This private result is never a model projection. */
public final class GuidedSourceSnapshotRepository {
  private final StudioRepository tests;
  private final GuidedContracts contracts;
  private final ObjectMapper mapper =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

  public GuidedSourceSnapshotRepository(StudioRepository tests, GuidedContracts contracts) {
    this.tests = tests;
    this.contracts = contracts;
  }

  public ObjectNode lockCurrent(UUID testId) {
    return lockCurrent(
        testId,
        csi -> {
          /* no authorization hook */
        });
  }

  public ObjectNode lockCurrent(UUID testId, java.util.function.Consumer<String> authorize) {
    GuidedTranslationStore.transaction();
    var test =
        tests
            .findByIdForUpdate(testId)
            .orElseThrow(() -> new GuidedSessionException("FORBIDDEN_SCOPE", 403));
    authorize.accept(test.getCsiId());
    require(test.getAuthoring() != null, "RUNTIME_INCOMPATIBLE", 409);
    try {
      var authoring = contracts.parse(test.getAuthoring());
      var identity =
          com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity.resolve(
              mapper.treeToValue(authoring, AuthoringV2Request.class),
              com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseVariables(
                  test.getVariables()));
      ObjectNode result =
          contracts
              .object()
              .put("testId", testId.toString())
              .put("csiId", test.getCsiId())
              .put("environment", test.getEnvironment())
              .put("sourceRevision", Long.toString(test.getSourceRevision()))
              .put("configurationRevision", Long.toString(test.getConfigurationRevision()));
      result.set("authoring", authoring.deepCopy());
      result.set("authoringRevisionInputs", mapper.valueToTree(identity.inputs()));
      result.put("authoringIdentityVersion", 1);
      result.set("authoredDeclarations", identity.references().path("authoredDeclarations"));
      result.set(
          "variables",
          test.getVariables() == null
              ? mapper.createArrayNode()
              : contracts.parse(test.getVariables()));
      return result;
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new GuidedSessionException("INVALID_CONTRACT", 422);
    }
  }
}
