package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.Test;

class GuidedWireContractTest {
  private final GuidedContracts contracts = new GuidedContracts();

  private static final java.util.Set<String> ORIGINAL_SESSION_PROPERTIES =
      java.util.Set.of(
          "schemaVersion",
          "sessionId",
          "testId",
          "state",
          "scope",
          "scopeHash",
          "runAuthorization",
          "versions",
          "owner",
          "createdAt",
          "expiresAt",
          "limits",
          "counters",
          "sourceSteps");
  private static final java.util.Set<String> ADDED_SESSION_PROPERTIES =
      java.util.Set.of("baseRevisionId", "firstLearnStepId");
  private static final java.util.Set<String> ORIGINAL_LEDGER_PROPERTIES =
      java.util.Set.of(
          "schemaVersion",
          "sessionId",
          "coordinate",
          "idempotencyKey",
          "requestDigest",
          "scopeHash",
          "operationHash",
          "generation",
          "documentId",
          "ownerFence",
          "admission",
          "state",
          "dispatchCount",
          "outcomeCode",
          "assertionPassed",
          "executionEvidence",
          "evidenceHash",
          "authoredInputsHash",
          "contextRevision",
          "preparationId");
  private static final java.util.Set<String> ADDED_LEDGER_PROPERTIES =
      java.util.Set.of("attemptOrdinal");
  private static final java.util.Set<String> ORIGINAL_BASIS_PROPERTIES =
      java.util.Set.of(
          "schemaVersion",
          "sessionId",
          "testId",
          "csiId",
          "sourceRevision",
          "configurationRevision",
          "sourceHash",
          "configurationHash",
          "authoringHash",
          "sourceManifestHash",
          "authoredInputsHash",
          "configuration",
          "learningProvenance",
          "sourceSteps",
          "scope",
          "runAuthorization",
          "replayRequirements",
          "bootstrap",
          "translationRevision",
          "translationHash",
          "translationPlan",
          "sourceSelections",
          "obligationAssociations",
          "inputs",
          "configurationReferences",
          "observations",
          "preparations",
          "actions",
          "allocations",
          "producers",
          "consumerEdges",
          "bindings",
          "transfers");
  private static final java.util.Set<String> ADDED_BASIS_PROPERTIES =
      java.util.Set.of("materializationEvidence", "incrementalEvidence", "snapshotEvidence");

  private static final java.util.Set<String> ORIGINAL_SESSION_STATES =
      java.util.Set.of(
          "PREPARING",
          "OBSERVING",
          "PROPOSING",
          "ACTING",
          "AWAITING_CLARIFICATION",
          "FINALIZING",
          "SUCCEEDED",
          "PUBLICATION_CONFLICT",
          "FAILED",
          "UNKNOWN_OUTCOME",
          "CANCELLED",
          "EXPIRED");

  private record CurrentCase(String id, String name, JsonNode value, boolean accepted) {}

  @Test
  void currentEpochsPreserveNamedOriginalPropertySetsAndExactApprovedAdditions() throws Exception {
    org.assertj.core.api.Assertions.assertThat(ORIGINAL_SESSION_PROPERTIES.size()).isEqualTo(14);
    org.assertj.core.api.Assertions.assertThat(ORIGINAL_LEDGER_PROPERTIES.size()).isEqualTo(20);
    org.assertj.core.api.Assertions.assertThat(ORIGINAL_BASIS_PROPERTIES.size()).isEqualTo(33);
    org.assertj.core.api.Assertions.assertThat(ADDED_SESSION_PROPERTIES.size()).isEqualTo(2);
    org.assertj.core.api.Assertions.assertThat(ADDED_LEDGER_PROPERTIES.size()).isEqualTo(1);
    org.assertj.core.api.Assertions.assertThat(ADDED_BASIS_PROPERTIES.size()).isEqualTo(3);
    // ADR-SC-007: an observation is validated natively (no expanded root oracle), so only these
    // three roots keep a compiled plan.
    for (String name : List.of("v3/session", "v3/ledger", "v3/replay-validation")) {
      JsonSchema original = originalSchema(name);
      Object plan = compiledSchema(name, original);
      assertFinitePlan(name, plan);
      assertCurrentNodeIdentity(plan, original);
      if (name.equals("v3/session")) {
        assertCurrentPropertyUnion(
            plan,
            original.getSchemaNode(),
            ORIGINAL_SESSION_PROPERTIES,
            ADDED_SESSION_PROPERTIES,
            16);
        org.assertj.core.api.Assertions.assertThat(ORIGINAL_SESSION_STATES.size()).isEqualTo(12);
        var states = new java.util.HashSet<String>();
        original
            .getSchemaNode()
            .at("/properties/state/enum")
            .forEach(value -> states.add(value.asText()));
        var expectedStates = new java.util.HashSet<>(ORIGINAL_SESSION_STATES);
        expectedStates.add("REPLAYING_PREFIX");
        org.assertj.core.api.Assertions.assertThat(states).isEqualTo(expectedStates);
      } else if (name.equals("v3/ledger")) {
        assertCurrentPropertyUnion(
            plan,
            original.getSchemaNode(),
            ORIGINAL_LEDGER_PROPERTIES,
            ADDED_LEDGER_PROPERTIES,
            21);
      } else if (name.equals("v3/replay-validation")) {
        Object basis = compiledObjects(plan).get("validationBasis");
        assertCurrentPropertyUnion(
            basis,
            original.getSchemaNode().path("properties").path("validationBasis"),
            ORIGINAL_BASIS_PROPERTIES,
            ADDED_BASIS_PROPERTIES,
            36);
        Object preparations = compiledArrays(basis).get("preparations");
        JsonSchema item = (JsonSchema) currentRecordField(preparations, "item");
        org.assertj.core.api.Assertions.assertThat(item.getSchemaNode().path("properties").size())
            .isEqualTo(7);
        org.assertj.core.api.Assertions.assertThat(compiledItemObject(preparations)).isNull();
        // The observation inside the basis is a finite plan of its 12 properties; its facts are
        // one property, not a compiled array.
        assertFinitePlan(
            "v3/observation",
            compiledObjects(compiledItemObject(compiledArrays(basis).get("observations")))
                .get("observation"));
      }
      JsonSchema unavailable = org.mockito.Mockito.spy(original);
      org.mockito.Mockito.doReturn(List.of()).when(unavailable).getValidators();
      assertOutcomeNativeFallback(compiledSchema(name, unavailable), unavailable);
    }
  }

  private void assertCurrentPropertyUnion(
      Object plan,
      JsonNode original,
      java.util.Set<String> baseline,
      java.util.Set<String> added,
      int expectedCount)
      throws Exception {
    var expected = new java.util.HashSet<>(baseline);
    expected.addAll(added);
    org.assertj.core.api.Assertions.assertThat(expected.size()).isEqualTo(expectedCount);
    var actual = new java.util.HashSet<String>();
    original.path("properties").fieldNames().forEachRemaining(actual::add);
    org.assertj.core.api.Assertions.assertThat(actual).isEqualTo(expected);
    org.assertj.core.api.Assertions.assertThat(currentProperties(plan).keySet())
        .isEqualTo(expected);
    org.assertj.core.api.Assertions.assertThat(compiledPropertyCount(plan))
        .isEqualTo(expectedCount);
    var required = new java.util.HashSet<String>();
    original.path("required").forEach(value -> required.add(value.asText()));
    org.assertj.core.api.Assertions.assertThat(required)
        .isEqualTo(baseline == ORIGINAL_SESSION_PROPERTIES ? baseline : expected);
  }

  private void assertCurrentNodeIdentity(Object plan, JsonSchema original) throws Exception {
    org.assertj.core.api.Assertions.assertThat(compiledAlternatives(plan)).isEmpty();
    for (var entry : currentProperties(plan).entrySet()) {
      org.assertj.core.api.Assertions.assertThat(
              entry
                  .getValue()
                  .getSchemaNode()
                  .equals(original.getSchemaNode().path("properties").path(entry.getKey())))
          .isTrue();
      org.assertj.core.api.Assertions.assertThat(
              entry.getValue().getValidationContext().getConfig()
                  == original.getValidationContext().getConfig())
          .isTrue();
      if (compiledObjects(plan).containsKey(entry.getKey())) {
        assertCurrentNodeIdentity(compiledObjects(plan).get(entry.getKey()), entry.getValue());
      }
      if (compiledArrays(plan).containsKey(entry.getKey())) {
        Object array = compiledArrays(plan).get(entry.getKey());
        JsonSchema item = (JsonSchema) currentRecordField(array, "item");
        org.assertj.core.api.Assertions.assertThat(
                item.getSchemaNode().equals(entry.getValue().getSchemaNode().path("items")))
            .isTrue();
        org.assertj.core.api.Assertions.assertThat(
                item.getValidationContext().getConfig()
                    == original.getValidationContext().getConfig())
            .isTrue();
        if (compiledItemObject(array) != null) {
          assertCurrentNodeIdentity(compiledItemObject(array), item);
        }
      }
    }
  }

  @Test
  void currentClausePositiveAndNegativeCasesMatchCompleteNativeAndBothPublicPaths()
      throws Exception {
    for (CurrentCase row : currentCases()) {
      currentPublicCase(contracts, row);
    }
    for (String name :
        List.of("v3/session", "v3/ledger", "v3/replay-validation", "v3/observation")) {
      JsonSchema original = originalSchema(name);
      ObjectNode document = fixtureRoot(name);
      var fields = new ArrayList<String>();
      original.getSchemaNode().path("properties").fieldNames().forEachRemaining(fields::add);
      for (String field : fields) {
        ObjectNode presentNull = document.deepCopy();
        presentNull.putNull(field);
        currentPublicCase(
            contracts,
            new CurrentCase(
                "EACH-PRESENT-NULL/" + name + "/" + field,
                name,
                presentNull,
                originalAccepts(original, presentNull)));
      }
    }
    currentPublicCase(
        contracts,
        new CurrentCase("CANONICAL-IMMUTABLE/bare-session", "session", fixtureSession(), true));
  }

  private void currentPublicCase(GuidedContracts subject, CurrentCase row) throws Exception {
    String bytes = row.value().toString();
    JsonSchema original =
        originalSchema(row.name().startsWith("v3/") ? row.name() : "v3/" + row.name());
    String schemaBytes = GuidedContracts.canonical(original.getSchemaNode());
    org.assertj.core.api.Assertions.assertThat(originalAccepts(original, row.value()))
        .as(row.id() + " original native")
        .isEqualTo(row.accepted());
    if (row.accepted()) {
      subject.validate(row.name(), row.value());
      org.assertj.core.api.Assertions.assertThat(
              subject
                  .validateAndCanonical(row.name(), row.value())
                  .equals(GuidedContracts.canonical(row.value())))
          .as(row.id())
          .isTrue();
    } else {
      outcomeRefused(() -> subject.validate(row.name(), row.value()), row.id());
      outcomeRefused(() -> subject.validateAndCanonical(row.name(), row.value()), row.id());
    }
    org.assertj.core.api.Assertions.assertThat(bytes.equals(row.value().toString()))
        .as(row.id() + " immutable input")
        .isTrue();
    org.assertj.core.api.Assertions.assertThat(
            schemaBytes.equals(GuidedContracts.canonical(original.getSchemaNode())))
        .isTrue();
  }

  private List<CurrentCase> currentCases() throws Exception {
    var cases = new ArrayList<CurrentCase>();
    ObjectNode session = fixtureSession();
    org.assertj.core.api.Assertions.assertThat(
            session.has("baseRevisionId") || session.has("firstLearnStepId"))
        .isFalse();
    org.assertj.core.api.Assertions.assertThat(session.size()).isEqualTo(14);
    cases.add(new CurrentCase("SESSION-PAIR-ABSENT", "v3/session", session, true));
    ObjectNode paired =
        session
            .deepCopy()
            .put("baseRevisionId", "00000000-0000-4000-8000-000000000011")
            .put("firstLearnStepId", "00000000-0000-4000-8000-000000000012")
            .put("state", "REPLAYING_PREFIX");
    cases.add(new CurrentCase("SESSION-PAIR-PRESENT", "v3/session", paired, true));
    for (String field : List.of("baseRevisionId", "firstLearnStepId")) {
      ObjectNode half = paired.deepCopy();
      half.remove(field);
      cases.add(new CurrentCase("SESSION-HALF-" + field, "v3/session", half, false));
      for (var delta :
          java.util.Map.of(
                  "null",
                  "null",
                  "badUUID",
                  "\"not-a-uuid\"",
                  "uppercaseUUID",
                  "\"00000000-0000-4000-8000-00000000000A\"",
                  "wrongtype",
                  "1")
              .entrySet()) {
        ObjectNode changed = paired.deepCopy();
        changed.set(field, contracts.parse(delta.getValue()));
        cases.add(
            new CurrentCase(
                "SESSION-" + field + "-" + delta.getKey(), "v3/session", changed, false));
      }
    }
    for (String state :
        List.of(
            "PREPARING",
            "OBSERVING",
            "PROPOSING",
            "ACTING",
            "AWAITING_CLARIFICATION",
            "FINALIZING",
            "SUCCEEDED",
            "PUBLICATION_CONFLICT",
            "FAILED",
            "UNKNOWN_OUTCOME",
            "CANCELLED",
            "EXPIRED",
            "REPLAYING_PREFIX")) {
      cases.add(
          new CurrentCase(
              "SESSION-STATE/" + state,
              "v3/session",
              session.deepCopy().put("state", state),
              true));
    }
    cases.add(
        new CurrentCase(
            "SESSION-STATE/unsupported",
            "v3/session",
            session.deepCopy().put("state", "UNSUPPORTED"),
            false));
    ObjectNode ledger = fixtureRoot("v3/ledger");
    for (int ordinal : new int[] {0, 1}) {
      cases.add(
          new CurrentCase(
              "ATTEMPT-POSITIVE-" + ordinal,
              "v3/ledger",
              ledger.deepCopy().put("attemptOrdinal", ordinal),
              true));
    }
    ObjectNode missing = ledger.deepCopy();
    missing.remove("attemptOrdinal");
    cases.add(new CurrentCase("ATTEMPT-NEGATIVE-missing", "v3/ledger", missing, false));
    for (var delta :
        java.util.Map.of(
                "null", "null", "string", "\"0\"", "fraction", "0.5", "negative", "-1", "over", "2")
            .entrySet()) {
      ObjectNode changed = ledger.deepCopy();
      changed.set("attemptOrdinal", contracts.parse(delta.getValue()));
      cases.add(new CurrentCase("ATTEMPT-NEGATIVE-" + delta.getKey(), "v3/ledger", changed, false));
    }
    ObjectNode request = fixtureValidationRequest();
    for (String field :
        List.of("materializationEvidence", "incrementalEvidence", "snapshotEvidence")) {
      ObjectNode absent = request.deepCopy();
      absent.withObject("/validationBasis").remove(field);
      cases.add(new CurrentCase("BASIS-MISSING-" + field, "v3/replay-validation", absent, false));
      for (String wrong : List.of("[]", "1")) {
        cases.add(
            new CurrentCase(
                "BASIS-TYPE-" + field + "/" + wrong,
                "v3/replay-validation",
                outcomeChange(request, "/validationBasis/" + field, contracts.parse(wrong)),
                false));
      }
    }
    cases.add(
        new CurrentCase(
            "INCREMENTAL-NULL",
            "v3/replay-validation",
            outcomeChange(request, "/validationBasis/incrementalEvidence", contracts.parse("null")),
            true));
    for (String field : List.of("materializationEvidence", "snapshotEvidence")) {
      cases.add(
          new CurrentCase(
              "BASIS-NULL-" + field,
              "v3/replay-validation",
              outcomeChange(request, "/validationBasis/" + field, contracts.parse("null")),
              false));
    }
    for (int revision : new int[] {1, 2}) {
      for (boolean previous : new boolean[] {false, true}) {
        ObjectNode changed = request.deepCopy();
        changed
            .withObject("/validationBasis/materializationEvidence/versions/0")
            .put("contextRevision", revision)
            .set(
                "previousInputsHash",
                previous ? contracts.parse("\"" + "a".repeat(64) + "\"") : contracts.parse("null"));
        cases.add(
            new CurrentCase(
                revision == 1
                    ? previous ? "HISTORY-first-hash" : "HISTORY-first"
                    : previous ? "HISTORY-later" : "HISTORY-later-null",
                "v3/replay-validation",
                changed,
                revision == 1 ? !previous : previous));
      }
    }
    for (String field : List.of("versions", "entries")) {
      ObjectNode changed = request.deepCopy();
      var items = changed.withObject("/validationBasis/materializationEvidence").putArray(field);
      int over = field.equals("versions") ? 202 : 201;
      JsonNode sample = request.at("/validationBasis/materializationEvidence/" + field + "/0");
      for (int at = 0; at < over; at++) {
        items.add(sample.deepCopy());
      }
      cases.add(
          new CurrentCase(
              "HISTORY-LEAFS/" + field + "-over", "v3/replay-validation", changed, false));
    }
    ObjectNode emptyVersions = request.deepCopy();
    emptyVersions.withObject("/validationBasis/materializationEvidence").putArray("versions");
    cases.add(
        new CurrentCase(
            "HISTORY-LEAFS/empty-versions", "v3/replay-validation", emptyVersions, false));
    for (String pointer :
        List.of(
            "/validationBasis/materializationEvidence/versions/0/authoredInputsHash",
            "/validationBasis/materializationEvidence/entries/0/metadata")) {
      ObjectNode changed = request.deepCopy();
      int slash = pointer.lastIndexOf('/');
      ((ObjectNode) changed.at(pointer.substring(0, slash))).remove(pointer.substring(slash + 1));
      cases.add(
          new CurrentCase(
              "HISTORY-LEAFS/missing" + pointer, "v3/replay-validation", changed, false));
    }
    cases.add(
        new CurrentCase(
            "HISTORY-LEAFS/unknown-raw-value",
            "v3/replay-validation",
            outcomeChange(
                request,
                "/validationBasis/materializationEvidence/entries/0/metadata/value",
                contracts.parse("\"controlled-not-history-metadata\"")),
            false));
    ObjectNode prep = request.deepCopy();
    prep.withObject("/validationBasis/preparations/0")
        .put("materializationRevision", 1)
        .remove("observedChoice");
    cases.add(
        new CurrentCase(
            "PREP-REVISION/present-one-optional-choice-absent",
            "v3/replay-validation",
            prep,
            true));
    ObjectNode absentRevision = prep.deepCopy();
    absentRevision.withObject("/validationBasis/preparations/0").remove("materializationRevision");
    cases.add(
        new CurrentCase("PREP-REVISION/missing", "v3/replay-validation", absentRevision, false));
    for (String value : List.of("null", "\"1\"", "0", "2147483648")) {
      cases.add(
          new CurrentCase(
              "PREP-REVISION/" + value,
              "v3/replay-validation",
              outcomeChange(
                  prep,
                  "/validationBasis/preparations/0/materializationRevision",
                  contracts.parse(value)),
              false));
    }
    JsonNode publication =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    ObjectNode boundary = null;
    for (JsonNode row : publication.at("/incrementalContracts/basisCases")) {
      if (!List.of("ordinary", "boundary", "emptyPrefix").contains(row.path("name").asText())) {
        continue;
      }
      ObjectNode complete = currentRequestFor(request, row);
      cases.add(
          new CurrentCase(
              "SNAPSHOT-COMPLETE/" + row.path("name").asText(),
              "v3/replay-validation",
              complete,
              true));
      if (row.path("name").asText().equals("boundary")) {
        boundary = complete;
      }
    }
    java.util.Objects.requireNonNull(boundary);
    for (String pointer :
        List.of(
            "/validationBasis/snapshotEvidence/schemaVersion",
            "/validationBasis/snapshotEvidence/current",
            "/validationBasis/snapshotEvidence/pinnedBase",
            "/validationBasis/snapshotEvidence/baseProof",
            "/validationBasis/snapshotEvidence/current/authoring/globalContext",
            "/validationBasis/snapshotEvidence/current/authoring/globalContext/entries",
            "/validationBasis/snapshotEvidence/current/authoring/steps/0/context",
            "/validationBasis/snapshotEvidence/current/authoredDeclarations")) {
      ObjectNode changed = boundary.deepCopy();
      int slash = pointer.lastIndexOf('/');
      ((ObjectNode) changed.at(pointer.substring(0, slash))).remove(pointer.substring(slash + 1));
      cases.add(
          new CurrentCase(
              "SNAPSHOT-LEAFS/missing" + pointer, "v3/replay-validation", changed, false));
    }
    cases.add(
        new CurrentCase(
            "SNAPSHOT-LEAFS/null-current",
            "v3/replay-validation",
            outcomeChange(
                boundary, "/validationBasis/snapshotEvidence/current", contracts.parse("null")),
            false));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-LEAFS/bad-version",
            "v3/replay-validation",
            outcomeChange(
                boundary, "/validationBasis/snapshotEvidence/schemaVersion", contracts.parse("99")),
            false));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-LEAFS/bad-hash",
            "v3/replay-validation",
            outcomeChange(
                boundary,
                "/validationBasis/snapshotEvidence/baseProof/revision/revisionDigest",
                contracts.parse("\"bad-hash\"")),
            false));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-LEAFS/extra-claimed-step-input",
            "v3/replay-validation",
            outcomeChange(
                boundary,
                "/validationBasis/snapshotEvidence/current/claimedStepInput",
                contracts.object()),
            false));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-AUTHORITY-LIMIT/nullable-independent-pin",
            "v3/replay-validation",
            outcomeChange(
                boundary, "/validationBasis/snapshotEvidence/pinnedBase", contracts.parse("null")),
            true));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-AUTHORITY-LIMIT/wellformed-digest",
            "v3/replay-validation",
            outcomeChange(
                boundary,
                "/validationBasis/snapshotEvidence/baseProof/revision/revisionDigest",
                contracts.parse("\"" + "f".repeat(64) + "\"")),
            true));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-AUTHORITY-LIMIT/wellformed-other-base-id",
            "v3/replay-validation",
            outcomeChange(
                boundary,
                "/validationBasis/snapshotEvidence/pinnedBase/revisionId",
                contracts.parse("\"00000000-0000-4000-8000-000000000099\"")),
            true));
    cases.add(
        new CurrentCase(
            "SNAPSHOT-AUTHORITY-LIMIT/nullable-independent-proof",
            "v3/replay-validation",
            outcomeChange(
                boundary, "/validationBasis/snapshotEvidence/baseProof", contracts.parse("null")),
            true));
    for (JsonNode row : publication.at("/graphTimingConformance/graphCases")) {
      if (!row.path("name").asText().equals("admitted-binding-replacement")) {
        continue;
      }
      org.assertj.core.api.Assertions.assertThat(row.path("expected").asText()).isEqualTo("ACCEPT");
      org.assertj.core.api.Assertions.assertThat(
              row.at("/basis/translationPlan/needs/0/consumers").size())
          .isZero();
      cases.add(
          new CurrentCase(
              "TRUSTED-EMPTY-CONSUMER",
              "v3/replay-validation",
              currentRequestFor(request, row),
              true));
    }
    return List.copyOf(cases);
  }

  private ObjectNode currentRequestFor(ObjectNode template, JsonNode row) {
    ObjectNode result = template.deepCopy();
    result.set("validationBasis", row.path("basis").deepCopy());
    result.set("artifact", row.path("expectedArtifact").deepCopy());
    result.set("requiredProfile", row.path("expectedArtifact").path("profile").deepCopy());
    result
        .withObject("/requiredBuild")
        .put("profileHash", GuidedContracts.hash(result.path("requiredProfile")));
    result.put("basisHash", GuidedContracts.hash(result.path("validationBasis")));
    return result;
  }

  @Test
  void currentFourPlansKeepEveryExistingExcludedConfigAsNativeFallback() throws Exception {
    var settings =
        new java.util.LinkedHashMap<
            String, java.util.function.Consumer<com.networknt.schema.SchemaValidatorsConfig>>();
    settings.put("typeLoose", config -> config.setTypeLoose(true));
    settings.put(
        "propertyDefaults",
        config ->
            config.setApplyDefaultsStrategy(
                new com.networknt.schema.ApplyDefaultsStrategy(true, false, false)));
    // The native API requires property-defaults enabled when null-property defaults are enabled.
    settings.put(
        "nullDefaults",
        config ->
            config.setApplyDefaultsStrategy(
                new com.networknt.schema.ApplyDefaultsStrategy(true, true, false)));
    settings.put(
        "arrayDefaults",
        config ->
            config.setApplyDefaultsStrategy(
                new com.networknt.schema.ApplyDefaultsStrategy(false, false, true)));
    settings.put(
        "executionContextCustomizer",
        config ->
            config.setExecutionContextCustomizer(
                (execution, validation) -> {
                  // intentionally empty
                }));
    settings.put(
        "keywordWalkListener",
        config ->
            config.addKeywordWalkListener(
                "type",
                org.mockito.Mockito.mock(com.networknt.schema.walk.JsonSchemaWalkListener.class)));
    settings.put(
        "propertyWalkListener",
        config ->
            config.addPropertyWalkListener(
                org.mockito.Mockito.mock(com.networknt.schema.walk.JsonSchemaWalkListener.class)));
    settings.put(
        "arrayItemWalkListener",
        config ->
            config.addItemWalkListener(
                org.mockito.Mockito.mock(com.networknt.schema.walk.JsonSchemaWalkListener.class)));
    settings.put("OpenAPIDiscriminator", config -> config.setOpenAPI3StyleDiscriminators(true));
    // ADR-SC-007: an observation has no root plan of its own (it is native), so three roots remain.
    for (String name : List.of("v3/session", "v3/ledger", "v3/replay-validation")) {
      JsonNode root = originalSchema(name).getSchemaNode();
      for (var setting : settings.entrySet()) {
        var config = new com.networknt.schema.SchemaValidatorsConfig();
        setting.getValue().accept(config);
        JsonSchema original =
            JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(root, config);
        String settingsBefore = outcomeConfig(config),
            schemaBefore = GuidedContracts.canonical(root);
        Object plan = compiledSchema(name, original);
        assertOutcomeNativeFallback(plan, original);
        for (JsonNode value : List.of(fixtureRoot(name), contracts.parse("null"))) {
          // Default-enabled originals may mutate; give each complete native path its own copy.
          org.assertj.core.api.Assertions.assertThat(outcomePlanDisposition(plan, value.deepCopy()))
              .as(name + "/CONFIG-FALLBACK-" + setting.getKey())
              .isEqualTo(outcomeNativeDisposition(original, value.deepCopy()));
        }
        org.assertj.core.api.Assertions.assertThat(settingsBefore.equals(outcomeConfig(config)))
            .isTrue();
        org.assertj.core.api.Assertions.assertThat(
                schemaBefore.equals(GuidedContracts.canonical(root)))
            .isTrue();
      }
      // Fail-fast is NOT a new eligibility exclusion on these original four paths.
      var failFast = new com.networknt.schema.SchemaValidatorsConfig();
      failFast.setFailFast(true);
      assertFinitePlan(
          name,
          compiledSchema(
              name,
              JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(root, failFast)));
    }
  }

  @Test
  void currentPlansEvaluateLaterPresentNullAndEveryNativeItemAfterEarlierRefusal()
      throws Exception {
    JsonSchema sessionOriginal = originalSchema("v3/session");
    Object sessionPlan = compiledSchema("v3/session", sessionOriginal);
    var sessionProperties = new java.util.LinkedHashMap<>(currentProperties(sessionPlan));
    JsonSchema lateLeaf = org.mockito.Mockito.spy(sessionProperties.get("sourceSteps"));
    sessionProperties.put("sourceSteps", lateLeaf);
    Object sessionCopy =
        currentPlanCopy(
            sessionPlan,
            sessionProperties,
            compiledObjects(sessionPlan),
            compiledArrays(sessionPlan));
    ObjectNode session = fixtureSession().put("schemaVersion", 2).putNull("sourceSteps");
    String sessionBytes = session.toString();
    org.assertj.core.api.Assertions.assertThat(outcomePlanAccepts(sessionCopy, session)).isFalse();
    org.mockito.Mockito.verify(lateLeaf)
        .validate(com.fasterxml.jackson.databind.node.NullNode.instance);
    org.assertj.core.api.Assertions.assertThat(sessionBytes.equals(session.toString())).isTrue();

    JsonSchema requestOriginal = originalSchema("v3/replay-validation");
    Object requestPlan = compiledSchema("v3/replay-validation", requestOriginal);
    Object basis = compiledObjects(requestPlan).get("validationBasis");
    var arrays = new java.util.LinkedHashMap<Object, Object>();
    arrays.putAll(compiledArrays(basis));
    Object actions = arrays.get("actions"), actionObject = compiledItemObject(actions);
    var nativeActionProperties = new java.util.LinkedHashMap<>(currentProperties(actionObject));
    JsonSchema ledger = org.mockito.Mockito.spy(nativeActionProperties.get("ledger"));
    var actionObjects = new java.util.LinkedHashMap<Object, Object>();
    actionObjects.putAll(compiledObjects(actionObject));
    actionObjects.put("ledger", compiledSchema("v3/publication", ledger));
    Object actionCopy =
        currentPlanCopy(
            actionObject, nativeActionProperties, actionObjects, compiledArrays(actionObject));
    arrays.put(
        "actions",
        currentArrayCopy(actions, (JsonSchema) currentRecordField(actions, "item"), actionCopy));
    Object preparations = arrays.get("preparations");
    JsonSchema nativePreparation =
        org.mockito.Mockito.spy((JsonSchema) currentRecordField(preparations, "item"));
    arrays.put("preparations", currentArrayCopy(preparations, nativePreparation, null));
    Object basisCopy =
        currentPlanCopy(basis, currentProperties(basis), compiledObjects(basis), arrays);
    var requestObjects = new java.util.LinkedHashMap<Object, Object>();
    requestObjects.putAll(compiledObjects(requestPlan));
    requestObjects.put("validationBasis", basisCopy);
    Object requestCopy =
        currentPlanCopy(
            requestPlan,
            currentProperties(requestPlan),
            requestObjects,
            compiledArrays(requestPlan));
    ObjectNode request = fixtureValidationRequest().put("snapshotHash", "not-a-hash");
    JsonNode action = request.at("/validationBasis/actions/0").deepCopy();
    ((ObjectNode) action).putNull("ledger");
    request
        .withObject("/validationBasis")
        .putArray("actions")
        .add(action.deepCopy())
        .add(action.deepCopy());
    request.withObject("/validationBasis").putArray("preparations").addNull().addNull();
    String requestBytes = request.toString();
    org.assertj.core.api.Assertions.assertThat(outcomePlanAccepts(requestCopy, request)).isFalse();
    org.mockito.Mockito.verify(ledger, org.mockito.Mockito.times(2))
        .validate(com.fasterxml.jackson.databind.node.NullNode.instance);
    org.mockito.Mockito.verify(nativePreparation, org.mockito.Mockito.times(2))
        .validate(com.fasterxml.jackson.databind.node.NullNode.instance);
    org.assertj.core.api.Assertions.assertThat(requestBytes.equals(request.toString())).isTrue();
    // Duplicated rows are solely array-evaluation probes, never valid publication history.
  }

  @Test
  void currentNewClauseCallsRemainStableUnderRepeatedAndParallelInterleaving() throws Exception {
    var cases = currentCases();
    for (int repeat = 0; repeat < 2; repeat++) {
      for (CurrentCase row : cases) {
        currentPublicCase(contracts, row);
      }
    }
    var workers = java.util.concurrent.Executors.newFixedThreadPool(4);
    try {
      var tasks = new ArrayList<java.util.concurrent.Callable<Void>>();
      for (int worker = 0; worker < 4; worker++) {
        final int offset = worker;
        tasks.add(
            () -> {
              GuidedContracts separate = new GuidedContracts();
              for (int index = 0; index < 12; index++) {
                CurrentCase row = cases.get((index * 7 + offset) % cases.size());
                currentPublicCase(index % 2 == 0 ? contracts : separate, row);
              }
              return null;
            });
      }
      for (var result : workers.invokeAll(tasks)) {
        result.get();
      }
    } finally {
      workers.shutdownNow();
    }
  }

  private Object currentRecordField(Object record, String name) throws Exception {
    var field = record.getClass().getDeclaredMethod(name);
    field.setAccessible(true);
    return field.invoke(record);
  }

  @SuppressWarnings("unchecked")
  private java.util.Map<String, JsonSchema> currentProperties(Object plan) throws Exception {
    return (java.util.Map<String, JsonSchema>) currentRecordField(plan, "properties");
  }

  private Object currentPlanCopy(
      Object original,
      java.util.Map<?, ?> properties,
      java.util.Map<?, ?> objects,
      java.util.Map<?, ?> arrays)
      throws Exception {
    var constructor =
        original
            .getClass()
            .getDeclaredConstructor(
                JsonSchema.class,
                java.util.Map.class,
                java.util.Map.class,
                java.util.Map.class,
                List.class);
    constructor.setAccessible(true);
    return constructor.newInstance(
        currentRecordField(original, "shape"),
        properties,
        objects,
        arrays,
        compiledAlternatives(original));
  }

  private Object currentArrayCopy(Object original, JsonSchema item, Object itemObject)
      throws Exception {
    Object plan = compiledSchema("v3/publication", originalSchema("v3/publication"));
    var constructor =
        original
            .getClass()
            .getDeclaredConstructor(JsonSchema.class, JsonSchema.class, plan.getClass());
    constructor.setAccessible(true);
    return constructor.newInstance(currentRecordField(original, "shape"), item, itemObject);
  }

  private static final String OUTCOME = "v3/bridge#/definitions/outcome";

  private record OutcomeCase(String id, JsonNode value, boolean ordinary, boolean prefix) {}

  @Test
  void outcomeFullNativeBranchesRetainEveryFrozenConstraint() throws Exception {
    JsonSchema original = originalSchema(OUTCOME);
    String schemaBefore = GuidedContracts.canonical(original.getSchemaNode());
    Object plan = compiledSchema(OUTCOME, original);
    var alternatives = compiledAlternatives(plan);
    org.assertj.core.api.Assertions.assertThat(alternatives.size()).isEqualTo(2);
    for (int index = 0; index < 2; index++) {
      org.assertj.core.api.Assertions.assertThat(
              alternatives
                  .get(index)
                  .getSchemaNode()
                  .equals(original.getSchemaNode().path("oneOf").get(index)))
          .as("complete unchanged native outcome branch")
          .isTrue();
      org.assertj.core.api.Assertions.assertThat(
              alternatives.get(index).getValidationContext().getConfig()
                  == original.getValidationContext().getConfig())
          .isTrue();
    }
    for (OutcomeCase row : outcomeCases()) {
      org.assertj.core.api.Assertions.assertThat(
              alternatives.get(0).validate(row.value()).isEmpty())
          .as(row.id() + " complete ordinary")
          .isEqualTo(row.ordinary());
      org.assertj.core.api.Assertions.assertThat(
              alternatives.get(1).validate(row.value()).isEmpty())
          .as(row.id() + " complete prefix")
          .isEqualTo(row.prefix());
      outcomePublicCase(contracts, OUTCOME, row);
    }
    org.assertj.core.api.Assertions.assertThat(
            schemaBefore.equals(GuidedContracts.canonical(original.getSchemaNode())))
        .as("complete original schema unchanged")
        .isTrue();
    // Public normalization selects exactly the same pinned mode; no alternate schema generation.
    outcomePublicCase(contracts, "bridge#/definitions/outcome", outcomeCases().getFirst());
    for (String name :
        List.of("v3/session", "v3/replay-validation", "v3/ledger", "v3/observation")) {
      org.assertj.core.api.Assertions.assertThat(
              compiledAlternatives(compiledSchema(name, originalSchema(name))))
          .as(name + " has no outcome union mode")
          .isEmpty();
    }
  }

  private void outcomePublicCase(GuidedContracts subject, String name, OutcomeCase row) {
    String before = GuidedContracts.canonical(row.value());
    boolean accepted = row.ordinary() != row.prefix();
    if (accepted) {
      subject.validate(name, row.value());
      org.assertj.core.api.Assertions.assertThat(
              before.equals(subject.validateAndCanonical(name, row.value())))
          .as(row.id() + " canonical public entry point")
          .isTrue();
    } else {
      outcomeRefused(() -> subject.validate(name, row.value()), row.id() + " validate");
      outcomeRefused(
          () -> subject.validateAndCanonical(name, row.value()), row.id() + " canonical");
    }
    org.assertj.core.api.Assertions.assertThat(
            before.equals(GuidedContracts.canonical(row.value())))
        .as(row.id() + " original input bytes unchanged")
        .isTrue();
  }

  private void outcomeRefused(Runnable operation, String id) {
    org.assertj.core.api.Assertions.assertThatThrownBy(operation::run)
        .as(id)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              org.assertj.core.api.Assertions.assertThat(refusal.getMessage())
                  .isEqualTo("INVALID_CONTRACT");
              org.assertj.core.api.Assertions.assertThat(refusal.status()).isEqualTo(422);
            });
  }

  private ObjectNode outcomeChange(ObjectNode source, String pointer, JsonNode value) {
    ObjectNode copy = source.deepCopy();
    int slash = pointer.lastIndexOf('/');
    ((ObjectNode) copy.at(pointer.substring(0, slash))).set(pointer.substring(slash + 1), value);
    return copy;
  }

  private void addAbsentFieldCase(
      List<OutcomeCase> cases,
      java.util.Map<String, ObjectNode> controls,
      String control,
      String pointer,
      String field,
      String id) {
    ObjectNode value = controls.get(control).deepCopy();
    ((ObjectNode) value.at(pointer)).remove(field);
    cases.add(new OutcomeCase(id, value, false, false));
  }

  private void addDiagnosticLedgerCase(
      List<OutcomeCase> cases,
      java.util.Map<String, ObjectNode> controls,
      String id,
      String state,
      String outcomeCode,
      int dispatchCount) {
    ObjectNode value = controls.get("ORD-BLANK").deepCopy();
    value.put("errorMessage", "already-redacted message");
    value
        .withObject("/ledger")
        .put("state", state)
        .put("outcomeCode", outcomeCode)
        .put("dispatchCount", dispatchCount);
    cases.add(new OutcomeCase(id, value, false, false));
  }

  private void addHybridCase(List<OutcomeCase> cases, java.util.Map<String, ObjectNode> controls) {
    ObjectNode hybrid = controls.get("ORD-BLANK").deepCopy().put("kind", "prefixDrift");
    hybrid.set("receipt", controls.get("PRE-NULL").path("receipt").deepCopy());
    cases.add(new OutcomeCase("HYBRID", hybrid, false, false));
  }

  private List<OutcomeCase> outcomeCases() throws Exception {
    JsonNode fixtures =
        contracts.parse(
            Files.readString(
                Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    JsonNode fixtureBefore = fixtures.deepCopy();
    var controls = new java.util.LinkedHashMap<String, ObjectNode>();
    controls.put("ORD-BLANK", fixtures.at("/documents/flow/outcomes/0").deepCopy());
    controls.put("ORD-OBS-READ", fixtures.at("/documents/flow/outcomes/1").deepCopy());
    controls.put("ORD-OBS-NULL", fixtures.at("/documents/flow/outcomes/2").deepCopy());
    controls.put("ORD-FAIL-DIAG", fixtures.at("/documents/redactedFailureDiagnostic").deepCopy());
    controls.put(
        "ORD-UNKNOWN-DIAG", fixtures.at("/documents/redactedUnknownDiagnostic").deepCopy());
    JsonNode publications =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
    JsonNode publicationBefore = publications.deepCopy();
    for (String name : List.of("preAdmissionDrift", "admittedDrift")) {
      JsonNode basisCase =
          java.util.stream.StreamSupport.stream(
                  publications.at("/incrementalContracts/basisCases").spliterator(), false)
              .filter(row -> row.path("name").asText().equals(name))
              .findFirst()
              .orElseThrow();
      JsonNode incremental = basisCase.at("/basis/incrementalEvidence");
      ObjectNode envelope = contracts.object().put("kind", "prefixDrift");
      envelope.set("receipt", incremental.path("driftReceipt").deepCopy());
      envelope.set(
          "ledger",
          name.equals("preAdmissionDrift")
              ? com.fasterxml.jackson.databind.node.NullNode.instance
              : incremental.at("/excludedAttempts/0/action/ledger").deepCopy());
      controls.put(name.equals("preAdmissionDrift") ? "PRE-NULL" : "ADMITTED-LEDGER", envelope);
    }
    // Whole catalogues intentionally retain invalid vectors; deep-copy equality preserves code
    // units.
    // Each selected lawful parent still has its own exact canonical-byte and hash witness.
    var controlBytesBefore = new java.util.LinkedHashMap<String, String>();
    var controlHashesBefore = new java.util.LinkedHashMap<String, String>();
    controls.forEach(
        (id, value) -> {
          controlBytesBefore.put(id, GuidedContracts.canonical(value));
          controlHashesBefore.put(id, GuidedContracts.hash(value));
        });
    var cases = new ArrayList<OutcomeCase>();
    for (var entry : controls.entrySet()) {
      boolean ordinary = entry.getKey().startsWith("ORD-");
      cases.add(new OutcomeCase(entry.getKey(), entry.getValue().deepCopy(), ordinary, !ordinary));
    }
    addDiagnosticLedgerCase(cases, controls, "DIAG-success", "SUCCEEDED", "OK", 1);
    addDiagnosticLedgerCase(cases, controls, "DIAG-pending", "DISPATCHING", "PENDING", 1);
    addDiagnosticLedgerCase(cases, controls, "DIAG-dispatch-zero", "FAILED", "TARGET_CHANGED", 0);
    addDiagnosticLedgerCase(cases, controls, "DIAG-other-state", "REVOKED", "CANCELLED", 1);
    cases.add(
        new OutcomeCase(
            "DIAG-TYPE-nonstring",
            outcomeChange(controls.get("ORD-FAIL-DIAG"), "/errorMessage", contracts.parse("7")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "DIAG-TYPE-null",
            outcomeChange(controls.get("ORD-FAIL-DIAG"), "/errorMessage", contracts.parse("null")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "DIAG-TYPE-empty",
            outcomeChange(controls.get("ORD-FAIL-DIAG"), "/errorMessage", contracts.parse("\"\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "DIAG-TYPE-oversize",
            outcomeChange(
                controls.get("ORD-FAIL-DIAG"),
                "/errorMessage",
                com.fasterxml.jackson.databind.node.TextNode.valueOf("x".repeat(2049))),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "DIAG-EXACT2048",
            outcomeChange(
                controls.get("ORD-FAIL-DIAG"),
                "/errorMessage",
                com.fasterxml.jackson.databind.node.TextNode.valueOf("x".repeat(2048))),
            true,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-blank-url",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/executionEvidence/url",
                contracts.parse("\"https://not-blank.test\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-blank-origin",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/executionEvidence/origin",
                contracts.parse("\"https://orders.example.test\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-blank-generation",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/executionEvidence/generation",
                contracts.parse("1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-obs-kind",
            outcomeChange(
                controls.get("ORD-OBS-NULL"),
                "/ledger/executionEvidence/kind",
                contracts.parse("\"unsupported\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-obs-origin",
            outcomeChange(
                controls.get("ORD-OBS-NULL"),
                "/ledger/executionEvidence/origin",
                contracts.parse("null")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-hash-length",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/scopeHash",
                contracts.parse(
                    "\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-hash-charset",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/evidenceHash",
                contracts.parse(
                    "\"gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-negative-owner",
            outcomeChange(controls.get("ORD-BLANK"), "/ownerFence", contracts.parse("-1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-negative-context",
            outcomeChange(controls.get("ORD-BLANK"), "/contextRevision", contracts.parse("-1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-dispatch-over",
            outcomeChange(controls.get("ORD-BLANK"), "/ledger/dispatchCount", contracts.parse("2")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-attempt-over",
            outcomeChange(
                controls.get("ORD-BLANK"), "/ledger/attemptOrdinal", contracts.parse("2")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-old-version",
            outcomeChange(controls.get("ORD-BLANK"), "/versions/contract", contracts.parse("2")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-tuple-extra",
            outcomeChange(controls.get("ORD-BLANK"), "/versions/legacy", contracts.parse("1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-invalid-time",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/admission/admittedAt",
                contracts.parse("\"2026-02-30T03:00:10Z\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-numeric-time",
            outcomeChange(
                controls.get("ORD-BLANK"), "/ledger/admission/admittedAt", contracts.parse("1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "LEAF-offset-time",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/admission/admittedAt",
                contracts.parse("\"2026-10-08T03:00:10+00:00\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "TIME-NANO",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/admission/admittedAt",
                contracts.parse("\"2026-10-08T03:00:10.123456789Z\"")),
            true,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-ORD-BLANK:root",
            outcomeChange(controls.get("ORD-BLANK"), "/unexpected", contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-ORD-BLANK:/ledger",
            outcomeChange(controls.get("ORD-BLANK"), "/ledger/unexpected", contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-ORD-BLANK:/ledger/admission",
            outcomeChange(
                controls.get("ORD-BLANK"), "/ledger/admission/unexpected", contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-ORD-BLANK:/ledger/executionEvidence",
            outcomeChange(
                controls.get("ORD-BLANK"),
                "/ledger/executionEvidence/unexpected",
                contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-ORD-OBS-READ:/availability",
            outcomeChange(
                controls.get("ORD-OBS-READ"), "/availability/unexpected", contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-PRE-NULL:/receipt",
            outcomeChange(controls.get("PRE-NULL"), "/receipt/unexpected", contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "CLOSED-PRE-NULL:root",
            outcomeChange(controls.get("PRE-NULL"), "/unexpected", contracts.parse("true")),
            false,
            false));
    addAbsentFieldCase(
        cases, controls, "ORD-BLANK", "", "versions", "REQUIRED-ORD-BLANK:/versions");
    addAbsentFieldCase(cases, controls, "ORD-BLANK", "", "ledger", "REQUIRED-ORD-BLANK:/ledger");
    addAbsentFieldCase(
        cases, controls, "ORD-BLANK", "", "availability", "REQUIRED-ORD-BLANK:/availability");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-BLANK",
        "/versions",
        "contract",
        "REQUIRED-ORD-BLANK:/versions/contract");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-BLANK",
        "/ledger",
        "preparationId",
        "REQUIRED-ORD-BLANK:/ledger/preparationId");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-BLANK",
        "/ledger",
        "assertionPassed",
        "REQUIRED-ORD-BLANK:/ledger/assertionPassed");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-BLANK",
        "/ledger/admission",
        "admittedAt",
        "REQUIRED-ORD-BLANK:/ledger/admission/admittedAt");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-BLANK",
        "/ledger/executionEvidence",
        "creationId",
        "REQUIRED-ORD-BLANK:/ledger/executionEvidence/creationId");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-BLANK",
        "/ledger/executionEvidence",
        "bootstrapId",
        "REQUIRED-ORD-BLANK:/ledger/executionEvidence/bootstrapId");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-OBS-NULL",
        "/ledger/executionEvidence",
        "observationHash",
        "REQUIRED-ORD-OBS-NULL:/ledger/executionEvidence/observationHash");
    addAbsentFieldCase(
        cases,
        controls,
        "ORD-OBS-READ",
        "/availability",
        "producerAdmissionId",
        "REQUIRED-ORD-OBS-READ:/availability/producerAdmissionId");
    addAbsentFieldCase(
        cases,
        controls,
        "PRE-NULL",
        "/receipt",
        "requestDigest",
        "REQUIRED-PRE-NULL:/receipt/requestDigest");
    addAbsentFieldCase(
        cases,
        controls,
        "ADMITTED-LEDGER",
        "/receipt",
        "preparationId",
        "REQUIRED-ADMITTED-LEDGER:/receipt/preparationId");
    cases.add(
        new OutcomeCase(
            "AVAIL-MALFORMED/object",
            outcomeChange(controls.get("ORD-OBS-READ"), "/availability", contracts.parse("{}")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "AVAIL-MALFORMED/scalar",
            outcomeChange(controls.get("ORD-OBS-READ"), "/availability", contracts.parse("1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "AVAIL-MALFORMED/array",
            outcomeChange(controls.get("ORD-OBS-READ"), "/availability", contracts.parse("[]")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-pre-nonnull",
            outcomeChange(
                controls.get("PRE-NULL"),
                "/ledger",
                controls.get("ADMITTED-LEDGER").path("ledger").deepCopy()),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-admitted-null",
            outcomeChange(controls.get("ADMITTED-LEDGER"), "/ledger", contracts.parse("null")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-admitted-malformed",
            outcomeChange(controls.get("ADMITTED-LEDGER"), "/ledger", contracts.parse("{}")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-bad-envelopekind",
            outcomeChange(controls.get("PRE-NULL"), "/kind", contracts.parse("\"ordinary\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-bad-phase",
            outcomeChange(
                controls.get("PRE-NULL"), "/receipt/phase", contracts.parse("\"UNKNOWN\"")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-native-started",
            outcomeChange(
                controls.get("ADMITTED-LEDGER"),
                "/receipt/nativeInvocationStarted",
                contracts.parse("true")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-receipt-attempt",
            outcomeChange(
                controls.get("ADMITTED-LEDGER"), "/receipt/attemptOrdinal", contracts.parse("1")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-receipt-fence",
            outcomeChange(controls.get("PRE-NULL"), "/receipt/ownerFence", contracts.parse("0")),
            false,
            false));
    cases.add(
        new OutcomeCase(
            "PHASE-receipt-context",
            outcomeChange(
                controls.get("PRE-NULL"), "/receipt/contextRevision", contracts.parse("202")),
            false,
            false));
    addHybridCase(cases, controls);
    cases.add(new OutcomeCase("ROOT-null", contracts.parse("null"), false, false));
    cases.add(new OutcomeCase("ROOT-[]", contracts.parse("[]"), false, false));
    cases.add(new OutcomeCase("ROOT-1", contracts.parse("1"), false, false));
    cases.add(new OutcomeCase("ROOT-{}", contracts.parse("{}"), false, false));
    controls.forEach(
        (id, value) -> {
          org.assertj.core.api.Assertions.assertThat(
                  controlBytesBefore.get(id).equals(GuidedContracts.canonical(value)))
              .as(id + " lawful original control canonical bytes unchanged")
              .isTrue();
          org.assertj.core.api.Assertions.assertThat(
                  controlHashesBefore.get(id).equals(GuidedContracts.hash(value)))
              .as(id + " lawful original control canonical hash unchanged")
              .isTrue();
        });
    org.assertj.core.api.Assertions.assertThat(fixtureBefore.equals(fixtures)).isTrue();
    org.assertj.core.api.Assertions.assertThat(publicationBefore.equals(publications)).isTrue();
    return List.copyOf(cases);
  }

  @Test
  void outcomePrivateAggregationIsExactOneAndUsesFreshRealNativeContexts() throws Exception {
    JsonSchema root = originalSchema(OUTCOME);
    JsonNode value = outcomeCases().getFirst().value();
    String schemaBefore = GuidedContracts.canonical(root.getSchemaNode());
    for (String truth : List.of("TT", "TF", "FT", "FF")) {
      var contexts = new ArrayList<com.networknt.schema.ExecutionContext>();
      var branches = new ArrayList<JsonSchema>();
      for (int index = 0; index < 2; index++) {
        JsonNode node = root.getSchemaNode().path("oneOf").get(truth.charAt(index) == 'T' ? 0 : 1);
        JsonSchema real =
            JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
                .getSchema(node, root.getValidationContext().getConfig());
        JsonSchema spy = org.mockito.Mockito.spy(real);
        org.mockito.Mockito.doAnswer(
                invocation -> {
                  var fresh = (com.networknt.schema.ExecutionContext) invocation.callRealMethod();
                  contexts.add(fresh);
                  return fresh;
                })
            .when(spy)
            .createExecutionContext();
        branches.add(spy);
      }
      Object plan = outcomePrivatePlan(root, branches);
      boolean expected = truth.equals("TF") || truth.equals("FT");
      for (int repetition = 0; repetition < 2; repetition++) {
        org.assertj.core.api.Assertions.assertThat(outcomePlanAccepts(plan, value))
            .as("XOR-" + truth)
            .isEqualTo(expected);
      }
      for (JsonSchema branch : branches) {
        org.mockito.Mockito.verify(branch, org.mockito.Mockito.times(2)).validate(value);
        org.mockito.Mockito.verify(branch, org.mockito.Mockito.times(2)).createExecutionContext();
      }
      var distinct =
          new java.util.IdentityHashMap<com.networknt.schema.ExecutionContext, Boolean>();
      contexts.forEach(context -> distinct.put(context, true));
      org.assertj.core.api.Assertions.assertThat(contexts.size())
          .as("two native calls per normal evaluation")
          .isEqualTo(4);
      org.assertj.core.api.Assertions.assertThat(distinct.size())
          .as("no reused native context")
          .isEqualTo(4);
    }
    JsonSchema throwing =
        org.mockito.Mockito.spy(
            JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
                .getSchema(
                    root.getSchemaNode().path("oneOf").get(0),
                    root.getValidationContext().getConfig()));
    JsonSchema other =
        org.mockito.Mockito.spy(
            JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
                .getSchema(
                    root.getSchemaNode().path("oneOf").get(1),
                    root.getValidationContext().getConfig()));
    org.mockito.Mockito.doThrow(new IllegalStateException("bounded-native-control"))
        .when(throwing)
        .validate(value);
    Object throwingPlan = outcomePrivatePlan(root, List.of(throwing, other));
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> outcomePlanAccepts(throwingPlan, value))
        .as("EXCEPTION cannot become a match")
        .hasCauseInstanceOf(IllegalStateException.class);
    org.mockito.Mockito.verify(throwing).validate(value);
    org.assertj.core.api.Assertions.assertThat(
            schemaBefore.equals(GuidedContracts.canonical(root.getSchemaNode())))
        .isTrue();
  }

  @Test
  void outcomeCachedSchemasSupportRepeatedAndInterleavedPublicCalls() throws Exception {
    List<OutcomeCase> cases = outcomeCases();
    String schemaBefore = GuidedContracts.canonical(originalSchema(OUTCOME).getSchemaNode());
    for (int repeat = 0; repeat < 3; repeat++) {
      for (OutcomeCase row : cases) {
        outcomePublicCase(contracts, OUTCOME, row);
      }
    }
    var workers = java.util.concurrent.Executors.newFixedThreadPool(4);
    try {
      var tasks = new ArrayList<java.util.concurrent.Callable<Void>>();
      for (int worker = 0; worker < 4; worker++) {
        final int offset = worker;
        tasks.add(
            () -> {
              GuidedContracts separate = new GuidedContracts();
              for (int index = 0; index < 16; index++) {
                OutcomeCase row = cases.get((index * 5 + offset) % cases.size());
                outcomePublicCase(index % 2 == 0 ? contracts : separate, OUTCOME, row);
              }
              return null;
            });
      }
      for (var future : workers.invokeAll(tasks)) {
        future.get();
      }
    } finally {
      workers.shutdownNow();
    }
    org.assertj.core.api.Assertions.assertThat(
            schemaBefore.equals(GuidedContracts.canonical(originalSchema(OUTCOME).getSchemaNode())))
        .isTrue();
  }

  @Test
  void outcomeEligibilityRetainsCompleteNativeFallbackForEveryExcludedConfiguration()
      throws Exception {
    JsonNode root = originalSchema(OUTCOME).getSchemaNode();
    var settings =
        new java.util.LinkedHashMap<
            String, java.util.function.Consumer<com.networknt.schema.SchemaValidatorsConfig>>();
    settings.put("CONFIG-type-loose", config -> config.setTypeLoose(true));
    settings.put("CONFIG-fail-fast", config -> config.setFailFast(true));
    settings.put(
        "CONFIG-property-defaults",
        config ->
            config.setApplyDefaultsStrategy(
                new com.networknt.schema.ApplyDefaultsStrategy(true, false, false)));
    // Null-property defaults are a coupled native setting, not a legal independent false/true
    // tuple.
    settings.put(
        "CONFIG-null-defaults",
        config ->
            config.setApplyDefaultsStrategy(
                new com.networknt.schema.ApplyDefaultsStrategy(true, true, false)));
    settings.put(
        "CONFIG-array-defaults",
        config ->
            config.setApplyDefaultsStrategy(
                new com.networknt.schema.ApplyDefaultsStrategy(false, false, true)));
    settings.put(
        "CONFIG-context-customizer",
        config ->
            config.setExecutionContextCustomizer(
                (execution, validation) -> {
                  // intentionally empty
                }));
    settings.put(
        "CONFIG-keyword-listener",
        config ->
            config.addKeywordWalkListener(
                "type",
                org.mockito.Mockito.mock(com.networknt.schema.walk.JsonSchemaWalkListener.class)));
    settings.put(
        "CONFIG-property-listener",
        config ->
            config.addPropertyWalkListener(
                org.mockito.Mockito.mock(com.networknt.schema.walk.JsonSchemaWalkListener.class)));
    settings.put(
        "CONFIG-array-listener",
        config ->
            config.addItemWalkListener(
                org.mockito.Mockito.mock(com.networknt.schema.walk.JsonSchemaWalkListener.class)));
    settings.put("CONFIG-discriminator", config -> config.setOpenAPI3StyleDiscriminators(true));
    JsonNode prefix =
        outcomeCases().stream()
            .filter(row -> row.id().equals("PRE-NULL"))
            .findFirst()
            .orElseThrow()
            .value();
    for (var setting : settings.entrySet()) {
      var config = new com.networknt.schema.SchemaValidatorsConfig();
      setting.getValue().accept(config);
      JsonSchema original =
          JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(root, config);
      String configBefore = outcomeConfig(config),
          schemaBefore = GuidedContracts.canonical(original.getSchemaNode());
      Object plan = compiledSchema(OUTCOME, original);
      assertOutcomeNativeFallback(plan, original);
      for (JsonNode value : List.of(prefix, contracts.parse("null"))) {
        org.assertj.core.api.Assertions.assertThat(outcomePlanDisposition(plan, value))
            .as(setting.getKey() + " retains original refusal/exception behavior")
            .isEqualTo(outcomeNativeDisposition(original, value));
      }
      org.assertj.core.api.Assertions.assertThat(configBefore.equals(outcomeConfig(config)))
          .as(setting.getKey())
          .isTrue();
      org.assertj.core.api.Assertions.assertThat(
              schemaBefore.equals(GuidedContracts.canonical(original.getSchemaNode())))
          .isTrue();
    }
  }

  @Test
  void outcomeUnknownNameEpochSiblingBranchesAndDialectKeepOriginalNativeRoot() throws Exception {
    JsonSchema root = originalSchema(OUTCOME);
    JsonSchema ordinary = originalSchema("v3/bridge#/definitions/ordinaryOutcome");
    assertOutcomeNativeFallback(
        compiledSchema("v3/bridge#/definitions/ordinaryOutcome", ordinary), ordinary);
    assertOutcomeNativeFallback(compiledSchema("bridge#/definitions/outcome", root), root);
    ObjectNode pre =
        (ObjectNode)
            outcomeCases().stream()
                .filter(row -> row.id().equals("PRE-NULL"))
                .findFirst()
                .orElseThrow()
                .value();
    ObjectNode sibling = root.getSchemaNode().deepCopy();
    sibling.putObject("properties").putObject("kind").put("const", "prefixDrift");
    JsonSchema withSibling =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(sibling);
    Object siblingPlan = compiledSchema(OUTCOME, withSibling);
    assertOutcomeNativeFallback(siblingPlan, withSibling);
    org.assertj.core.api.Assertions.assertThat(originalAccepts(withSibling, pre))
        .as("SIBLING positive full prefix")
        .isTrue();
    org.assertj.core.api.Assertions.assertThat(outcomePlanAccepts(siblingPlan, pre)).isTrue();
    ObjectNode badKind = pre.deepCopy().put("kind", "other");
    org.assertj.core.api.Assertions.assertThat(originalAccepts(withSibling, badKind)).isFalse();
    org.assertj.core.api.Assertions.assertThat(outcomePlanAccepts(siblingPlan, badKind)).isFalse();

    ObjectNode overlap = contracts.object();
    var alternatives = overlap.putArray("oneOf");
    for (int index = 0; index < 2; index++) {
      ObjectNode branch =
          contracts.object().put("type", "object").put("additionalProperties", false);
      branch.putObject("properties").putObject("kind").put("const", "controlled");
      branch.putArray("required").add("kind");
      alternatives.add(branch);
    }
    JsonSchema overlapping =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(overlap);
    Object overlapPlan = compiledSchema(OUTCOME, overlapping);
    assertOutcomeNativeFallback(overlapPlan, overlapping);
    JsonNode matchesBoth = contracts.object().put("kind", "controlled");
    org.assertj.core.api.Assertions.assertThat(originalAccepts(overlapping, matchesBoth))
        .as("OVERLAP-UNKNOWN exact-one")
        .isFalse();
    org.assertj.core.api.Assertions.assertThat(outcomePlanAccepts(overlapPlan, matchesBoth))
        .isFalse();

    var changedRoots = new ArrayList<ObjectNode>();
    ObjectNode changedLeaf = root.getSchemaNode().deepCopy();
    changedLeaf.withObject("/oneOf/1/properties/kind").put("const", "other");
    changedRoots.add(changedLeaf);
    ObjectNode changedConditional = root.getSchemaNode().deepCopy();
    changedConditional
        .withObject("/oneOf/1/allOf/0/then/properties")
        .putObject("ledger")
        .put("type", "string");
    changedRoots.add(changedConditional);
    ObjectNode removed = root.getSchemaNode().deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) removed.path("oneOf")).remove(1);
    changedRoots.add(removed);
    ObjectNode appended = root.getSchemaNode().deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) appended.path("oneOf"))
        .add(root.getSchemaNode().path("oneOf").get(0).deepCopy());
    changedRoots.add(appended);
    ObjectNode reversed = root.getSchemaNode().deepCopy();
    reversed
        .putArray("oneOf")
        .add(root.getSchemaNode().path("oneOf").get(1))
        .add(root.getSchemaNode().path("oneOf").get(0));
    changedRoots.add(reversed);
    for (ObjectNode changed : changedRoots) {
      JsonSchema original =
          JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(changed);
      String before = GuidedContracts.canonical(changed);
      Object plan = compiledSchema(OUTCOME, original);
      assertOutcomeNativeFallback(plan, original);
      for (JsonNode value : List.of(pre, contracts.parse("null"))) {
        org.assertj.core.api.Assertions.assertThat(outcomePlanDisposition(plan, value))
            .as("CHANGED-BRANCH")
            .isEqualTo(outcomeNativeDisposition(original, value));
      }
      org.assertj.core.api.Assertions.assertThat(before.equals(GuidedContracts.canonical(changed)))
          .isTrue();
    }
    JsonSchema wrongDialect =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V6).getSchema(root.getSchemaNode());
    assertOutcomeNativeFallback(compiledSchema(OUTCOME, wrongDialect), wrongDialect);
  }

  private String outcomeConfig(com.networknt.schema.SchemaValidatorsConfig config) {
    var defaults = config.getApplyDefaultsStrategy();
    return List.of(
            config.isTypeLoose(),
            config.isFailFast(),
            defaults.shouldApplyPropertyDefaults(),
            defaults.shouldApplyPropertyDefaultsIfNull(),
            defaults.shouldApplyArrayDefaults(),
            config.getExecutionContextCustomizer() != null,
            config.getKeywordWalkListenersMap().size(),
            config.getPropertyWalkListeners().size(),
            config.getArrayItemWalkListeners().size(),
            config.isOpenAPI3StyleDiscriminators())
        .toString();
  }

  private void assertOutcomeNativeFallback(Object plan, JsonSchema original) throws Exception {
    assertNativePlan(plan);
    var shape = plan.getClass().getDeclaredMethod("shape");
    shape.setAccessible(true);
    org.assertj.core.api.Assertions.assertThat(shape.invoke(plan) == original)
        .as("complete original native schema, not permissive substitute")
        .isTrue();
  }

  @SuppressWarnings("unchecked")
  private List<JsonSchema> compiledAlternatives(Object plan) throws Exception {
    var alternatives = plan.getClass().getDeclaredMethod("alternatives");
    alternatives.setAccessible(true);
    return (List<JsonSchema>) alternatives.invoke(plan);
  }

  private Object outcomePrivatePlan(JsonSchema original, List<JsonSchema> branches)
      throws Exception {
    Object baseline = compiledSchema("v3/publication", original);
    var constructor =
        baseline
            .getClass()
            .getDeclaredConstructor(
                JsonSchema.class,
                java.util.Map.class,
                java.util.Map.class,
                java.util.Map.class,
                List.class);
    constructor.setAccessible(true);
    return constructor.newInstance(
        original, java.util.Map.of(), java.util.Map.of(), java.util.Map.of(), branches);
  }

  private boolean outcomePlanAccepts(Object plan, JsonNode value) throws Exception {
    var method = plan.getClass().getDeclaredMethod("valid", JsonNode.class);
    method.setAccessible(true);
    return (boolean) method.invoke(plan, value);
  }

  private String outcomeNativeDisposition(JsonSchema original, JsonNode value) {
    try {
      return original.validate(value).isEmpty() ? "ACCEPT" : "REFUSE";
    } catch (RuntimeException refusal) {
      return "THREW:" + refusal.getClass().getName();
    }
  }

  private String outcomePlanDisposition(Object plan, JsonNode value) throws Exception {
    try {
      return outcomePlanAccepts(plan, value) ? "ACCEPT" : "REFUSE";
    } catch (java.lang.reflect.InvocationTargetException failure) {
      return "THREW:" + failure.getCause().getClass().getName();
    }
  }

  // This control deliberately tests the unchanged ORIGINAL native engine, not a repaired wrapper.
  @Test
  void originalNativeOutcomeUnionRejectsLegalOrdinaryWhileFreshFullBranchAccepts(
      org.junit.jupiter.api.TestReporter report) throws Exception {
    JsonNode fixture =
        contracts
            .parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .at("/documents/flow/outcomes/0");
    String inputBefore = GuidedContracts.canonical(fixture);
    String fixtureHash = GuidedContracts.hash(fixture);
    org.assertj.core.api.Assertions.assertThat(fixtureHash)
        // ADR-SC-007: the ledger operationHash of this fixture is over the reported target.
        .isEqualTo("d255a81445bb0af6d93f64970227f34e2186d0abf27ae1438ff1f9538753ddbd");
    org.assertj.core.api.Assertions.assertThat(fixture.path("ledger").path("state").asText())
        .isEqualTo("SUCCEEDED");
    org.assertj.core.api.Assertions.assertThat(fixture.path("ledger").path("outcomeCode").asText())
        .isEqualTo("OK");
    org.assertj.core.api.Assertions.assertThat(fixture.path("availability").isNull()).isTrue();
    org.assertj.core.api.Assertions.assertThat(fixture.has("errorMessage")).isFalse();
    JsonNode evidence = fixture.path("ledger").path("executionEvidence");
    org.assertj.core.api.Assertions.assertThat(evidence.path("kind").asText())
        .isEqualTo("initialBlank");
    org.assertj.core.api.Assertions.assertThat(evidence.path("url").asText())
        .isEqualTo("about:blank");
    org.assertj.core.api.Assertions.assertThat(evidence.path("origin").isNull()).isTrue();
    org.assertj.core.api.Assertions.assertThat(evidence.path("generation").asInt(-1)).isZero();

    // Read the actual loaded class location, then its own Maven metadata and bytes.
    var codeSource = JsonSchema.class.getProtectionDomain().getCodeSource();
    org.assertj.core.api.Assertions.assertThat(codeSource)
        .as("loaded native dependency provenance")
        .isNotNull();
    var loadedLocation = codeSource.getLocation();
    org.assertj.core.api.Assertions.assertThat(loadedLocation.getProtocol()).isEqualTo("file");
    Path loadedJar = Path.of(loadedLocation.toURI()).toRealPath();
    org.assertj.core.api.Assertions.assertThat(Files.isRegularFile(loadedJar))
        .as("loaded native dependency is a JAR file")
        .isTrue();
    org.assertj.core.api.Assertions.assertThat(
            JsonSchemaFactory.class
                .getProtectionDomain()
                .getCodeSource()
                .getLocation()
                .equals(loadedLocation))
        .as("native schema and factory loaded from the same dependency")
        .isTrue();
    String jarHash =
        java.util.HexFormat.of()
            .formatHex(
                java.security.MessageDigest.getInstance("SHA-256")
                    .digest(Files.readAllBytes(loadedJar)));
    var dependency = new java.util.Properties();
    try (var jar = new java.util.jar.JarFile(loadedJar.toFile())) {
      var entry =
          jar.getJarEntry("META-INF/maven/com.networknt/json-schema-validator/pom.properties");
      org.assertj.core.api.Assertions.assertThat(entry)
          .as("loaded JAR Maven provenance")
          .isNotNull();
      try (var metadata = jar.getInputStream(entry)) {
        dependency.load(metadata);
      }
    }
    org.assertj.core.api.Assertions.assertThat(dependency.getProperty("groupId"))
        .isEqualTo("com.networknt");
    org.assertj.core.api.Assertions.assertThat(dependency.getProperty("artifactId"))
        .isEqualTo("json-schema-validator");
    org.assertj.core.api.Assertions.assertThat(dependency.getProperty("version"))
        .isEqualTo("1.4.0");
    org.assertj.core.api.Assertions.assertThat(jarHash)
        .isEqualTo("5d7b6ce4c7b2a3ed189511cbaa913808c7cd2b570d70b923426352785bffbdd0");

    // schema() expands frozen resources and compiles V7 with its ORIGINAL default configuration.
    // Every public validate(JsonNode) below creates its own native execution context.
    JsonSchema whole = originalSchema("v3/bridge#/definitions/outcome");
    JsonNode expanded = whole.getSchemaNode();
    String rootHash = GuidedContracts.hash(expanded);
    org.assertj.core.api.Assertions.assertThat(expanded.isObject()).isTrue();
    org.assertj.core.api.Assertions.assertThat(expanded.size()).isEqualTo(1);
    org.assertj.core.api.Assertions.assertThat(expanded.has("oneOf")).isTrue();
    org.assertj.core.api.Assertions.assertThat(expanded.path("oneOf").isArray()).isTrue();
    org.assertj.core.api.Assertions.assertThat(expanded.path("oneOf").size()).isEqualTo(2);
    org.assertj.core.api.Assertions.assertThat(rootHash)
        .isEqualTo("95f7878408ce7d089646898aef3d528bc2e3c62d7f2bf8f228134556dfe451e8");
    JsonNode ordinaryNode = expanded.path("oneOf").get(0);
    JsonNode prefixNode = expanded.path("oneOf").get(1);
    org.assertj.core.api.Assertions.assertThat(GuidedContracts.hash(ordinaryNode))
        .isEqualTo("be738fd98792fed35821849ce6e9e50abbad334a03de282df3261494192497f1");
    org.assertj.core.api.Assertions.assertThat(GuidedContracts.hash(prefixNode))
        .isEqualTo("3547f2fbe5f29e0197f7fa326eaa5a2e3da92bbe164a2deb9a74043751a872c0");
    var originalConfig = whole.getValidationContext().getConfig();
    JsonSchema ordinary =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
            .getSchema(ordinaryNode, originalConfig);
    JsonSchema prefix =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7)
            .getSchema(prefixNode, originalConfig);
    org.assertj.core.api.Assertions.assertThat(
            ordinary.getValidationContext().getConfig() == originalConfig)
        .isTrue();
    org.assertj.core.api.Assertions.assertThat(
            prefix.getValidationContext().getConfig() == originalConfig)
        .isTrue();
    int wholeErrors = whole.validate(fixture).size();
    int ordinaryErrors = ordinary.validate(fixture).size();
    int prefixErrors = prefix.validate(fixture).size();
    String inputAfter = GuidedContracts.canonical(fixture);
    ObjectNode metadata =
        contracts
            .object()
            .put("control", "unchanged-fixtures-flow-outcomes-0")
            .put("rootSha256", rootHash)
            .put("fixtureSha256", fixtureHash)
            .put("loadedJarSha256", jarHash)
            .put("loadedJarVersion", dependency.getProperty("version"))
            .put("wholeAccepted", wholeErrors == 0)
            .put("ordinaryAccepted", ordinaryErrors == 0)
            .put("prefixAccepted", prefixErrors == 0)
            .put("wholeErrorCount", wholeErrors)
            .put("ordinaryErrorCount", ordinaryErrors)
            .put("prefixErrorCount", prefixErrors)
            .put("inputCanonicalBytesUnchanged", inputBefore.equals(inputAfter));
    report.publishEntry("obs015OriginalNativeOutcomeControl", GuidedContracts.canonical(metadata));
    var softly = new SoftAssertions();
    softly
        .assertThat(wholeErrors)
        .as("original whole native union reproduces rejection")
        .isGreaterThan(0);
    softly
        .assertThat(ordinaryErrors)
        .as("fresh complete original ordinary branch accepts")
        .isZero();
    softly
        .assertThat(prefixErrors)
        .as("fresh complete original prefix branch refuses ordinary")
        .isGreaterThan(0);
    softly
        .assertThat(inputBefore.equals(inputAfter))
        .as("unchanged fixture canonical bytes")
        .isTrue();
    softly.assertAll();
  }

  @Test
  void frozenDateTimeOracleMatchesOnEnforcedAssignmentSchema() throws Exception {
    var fixtures =
        contracts.parse(
            Files.readString(
                Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    var parity =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json")));
    var softly = new SoftAssertions();
    for (var vector : parity.path("dateTimes")) {
      ObjectNode assignment = fixtures.path("documents").path("assignment").deepCopy();
      assignment.put("expiresAt", vector.path("value").asText());
      boolean accepted;
      try {
        contracts.validate("v3/assignment", assignment);
        accepted = true;
      } catch (GuidedSessionException failure) {
        accepted = false;
      }
      softly
          .assertThat(accepted)
          .as(vector.path("value").asText())
          .isEqualTo(vector.path("accepted").asBoolean());
    }
    softly.assertAll();
  }

  @Test
  void rawByteVectorsRejectAmbiguityBeforeParsingCanDiscardIt() throws Exception {
    var vectors =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json")));
    var softly = new SoftAssertions();
    for (var vector : vectors.path("rawJson")) {
      boolean accepted;
      try {
        contracts.parseWire(java.util.Base64.getDecoder().decode(vector.path("base64").asText()));
        accepted = true;
      } catch (GuidedSessionException failure) {
        accepted = false;
      }
      softly
          .assertThat(accepted)
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("accepted").asBoolean());
    }
    softly.assertAll();
  }

  @Test
  void textualPersistenceParserAlsoRejectsDuplicatesAndTrailingObjects() {
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> contracts.parse("{\"a\":1,\"a\":2}"))
        .hasMessage("INVALID_CONTRACT");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> contracts.parse("{} {}"))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void absentSchemaDefinitionNeverBecomesAnEmptyPermissiveSchema() {
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> contracts.validate("v3/bridge#/definitions/missing", contracts.object()))
        .hasMessage("RUNTIME_INCOMPATIBLE");
  }

  @Test
  void rootValidationMatchesOriginalNativeSchemaWithoutApplyingDefaults() throws Exception {
    for (String name : List.of("v3/session", "v3/replay-validation", "v3/ledger")) {
      boolean replay = name.equals("v3/replay-validation");
      ObjectNode document = fixtureRoot(name);
      JsonSchema original = originalSchema(name);
      org.assertj.core.api.Assertions.assertThat(originalAccepts(original, document)).isTrue();
      assertFinitePlan(name, compiledSchema(name, original));
      List<JsonNode> cases = new ArrayList<>();
      cases.add(document);
      collectMutations(document, "", document, cases, name.equals("v3/session"));
      cases.add(contracts.parse("null"));
      cases.add(contracts.parse("[]"));
      cases.add(contracts.parse("1"));
      if (replay) {
        requestArrayCases(document, original, cases);
        ObjectNode conditional = document.deepCopy();
        conditional
            .withObject("/validationBasis/inputs/0")
            .put("kind", "secretRef")
            .put("intendedSlot", "assert.expected");
        org.assertj.core.api.Assertions.assertThat(originalAccepts(original, conditional))
            .isFalse();
        cases.add(conditional);
        ObjectNode allowedConditional = conditional.deepCopy();
        allowedConditional
            .withObject("/validationBasis/inputs/0")
            .put("intendedSlot", "fill.value");
        org.assertj.core.api.Assertions.assertThat(originalAccepts(original, allowedConditional))
            .isTrue();
        cases.add(allowedConditional);
        ObjectNode unknownOperation = document.deepCopy();
        unknownOperation
            .withObject("/artifact/steps/0/operations/0/operation")
            .put("kind", "unsupported-operation");
        org.assertj.core.api.Assertions.assertThat(originalAccepts(original, unknownOperation))
            .isFalse();
        cases.add(unknownOperation);
        ObjectNode duplicate = document.deepCopy();
        var sourceSteps =
            (com.fasterxml.jackson.databind.node.ArrayNode)
                duplicate.at("/artifact/learnedPlan/sourceSteps");
        sourceSteps.add(sourceSteps.get(0).deepCopy());
        org.assertj.core.api.Assertions.assertThat(originalAccepts(original, duplicate)).isFalse();
        cases.add(duplicate);
        ObjectNode nestedExtra = document.deepCopy();
        nestedExtra.withObject("/validationBasis/inputs/0").put("unexpected", true);
        org.assertj.core.api.Assertions.assertThat(originalAccepts(original, nestedExtra))
            .isFalse();
        cases.add(nestedExtra);
      } else if (name.equals("v3/session")) {
        ObjectNode malformedDate = document.deepCopy();
        malformedDate.withObject("/owner").put("leaseExpiresAt", "not-a-date");
        cases.add(malformedDate);
      } else {
        ObjectNode malformedDate = document.deepCopy();
        malformedDate.withObject("/admission").put("admittedAt", "not-a-date");
        addNativeCase(original, cases, malformedDate, false);
        ObjectNode unknownEvidence = document.deepCopy();
        unknownEvidence.withObject("/executionEvidence").put("kind", "unsupported-evidence");
        addNativeCase(original, cases, unknownEvidence, false);
      }
      ObjectNode malformedUnicode = document.deepCopy();
      malformedUnicode.put(replay ? "claimId" : "sessionId", Character.toString((char) 0xd800));
      cases.add(malformedUnicode);
      ObjectNode unsafeNumber = document.deepCopy();
      if (name.equals("v3/session")) {
        unsafeNumber.withObject("/counters").put("actions", 9007199254740992L);
      } else {
        unsafeNumber.put("schemaVersion", 9007199254740992L);
      }
      cases.add(unsafeNumber);
      var softly = new SoftAssertions();
      int index = 0;
      for (JsonNode value : cases) {
        String before = value.toString();
        boolean expected = originalAccepts(original, value);
        boolean accepted;
        try {
          String canonical = contracts.validateAndCanonical(name, value);
          softly.assertThat(canonical.equals(GuidedContracts.canonical(value))).isTrue();
          accepted = true;
        } catch (GuidedSessionException refusal) {
          softly.assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
          softly.assertThat(refusal.status()).isEqualTo(422);
          accepted = false;
        }
        softly.assertThat(accepted).as("%s mutation %s", name, index++).isEqualTo(expected);
        softly.assertThat(before.equals(value.toString())).as("input unchanged").isTrue();
      }
      softly.assertAll();
    }
  }

  // STUDIO-OBS-012A: the v1/v2 session contracts are deleted. A bare schema name now resolves to
  // the one contracts/v3 generation and keeps the original native validation.
  @Test
  void bareSessionNameResolvesToTheOneV3ContractWithNativeValidation() throws Exception {
    var softly = new SoftAssertions();
    for (String version : List.of("", "v3/")) {
      ObjectNode session = fixtureSession();
      ObjectNode legacy = session.deepCopy().put("schemaVersion", 1);
      softly.assertThat(originalAccepts(originalSchema("v3/session"), legacy)).isFalse();
      JsonSchema original = originalSchema("v3/session");
      List<JsonNode> cases = new ArrayList<>();
      cases.add(session);
      cases.add(session.deepCopy().put("unexpected", true));
      ObjectNode missing = session.deepCopy();
      missing.remove("owner");
      cases.add(missing);
      cases.add(legacy);
      for (JsonNode value : cases) {
        boolean accepted;
        try {
          contracts.validate(version + "session", value);
          accepted = true;
        } catch (GuidedSessionException refusal) {
          accepted = false;
          softly.assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
          softly.assertThat(refusal.status()).isEqualTo(422);
        }
        softly.assertThat(accepted).isEqualTo(originalAccepts(original, value));
      }
    }
    softly.assertAll();
  }

  @Test
  void unknownRootEpochPreservesNativeCrossPropertyRefusal() throws Exception {
    for (String name :
        List.of("v3/session", "v3/replay-validation", "v3/ledger", "v3/observation")) {
      boolean replay = name.equals("v3/replay-validation");
      boolean session = name.equals("v3/session");
      String field = replay ? "snapshotHash" : session ? "state" : "sessionId";
      String accepted = replay ? "a".repeat(64) : session ? "FAILED" : "accepted-component";
      String rejected = replay ? "b".repeat(64) : session ? "OBSERVING" : "rejected-component";
      ObjectNode changed = originalSchema(name).getSchemaNode().deepCopy();
      changed
          .putArray("allOf")
          .addObject()
          .putObject("properties")
          .putObject(field)
          .put("const", accepted);
      JsonSchema original =
          JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(changed);
      assertNativePlan(compiledSchema(name, original));
      ObjectNode document = fixtureRoot(name);
      document.put(field, rejected);
      org.assertj.core.api.Assertions.assertThat(originalAccepts(original, document)).isFalse();
      org.assertj.core.api.Assertions.assertThat(compiledAccepts(name, original, document))
          .isFalse();
      document.put(field, accepted);
      org.assertj.core.api.Assertions.assertThat(originalAccepts(original, document)).isTrue();
      org.assertj.core.api.Assertions.assertThat(compiledAccepts(name, original, document))
          .isTrue();
    }
    for (String name :
        List.of("v3/session", "v3/replay-validation", "v3/ledger", "v3/observation")) {
      JsonSchema configured = originalSchema(name);
      var config = configured.getValidationContext().getConfig();
      config.setTypeLoose(true);
      try {
        assertNativePlan(compiledSchema(name, configured));
        ObjectNode document = fixtureRoot(name);
        org.assertj.core.api.Assertions.assertThat(compiledAccepts(name, configured, document))
            .isEqualTo(originalAccepts(configured, document));
      } finally {
        config.setTypeLoose(false);
      }
    }
    assertNativePlan(compiledSchema("v3/publication", originalSchema("v3/publication")));
    // An observation root with a changed outline bound is an unknown epoch: native validation.
    ObjectNode narrowedRoot = originalSchema("v3/observation").getSchemaNode().deepCopy();
    narrowedRoot.withObject("/properties/outline").put("maxLength", 40);
    JsonSchema narrowed =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7).getSchema(narrowedRoot);
    assertNativePlan(compiledSchema("v3/observation", narrowed));
    ObjectNode shortOutline = fixtureRoot("v3/observation");
    shortOutline.put("outline", "- document");
    org.assertj.core.api.Assertions.assertThat(originalAccepts(narrowed, shortOutline)).isTrue();
    org.assertj.core.api.Assertions.assertThat(
            compiledAccepts("v3/observation", narrowed, shortOutline))
        .isTrue();
    ObjectNode longOutline = fixtureRoot("v3/observation");
    org.assertj.core.api.Assertions.assertThat(longOutline.path("outline").asText().length())
        .isGreaterThan(40);
    org.assertj.core.api.Assertions.assertThat(originalAccepts(narrowed, longOutline)).isFalse();
    org.assertj.core.api.Assertions.assertThat(
            compiledAccepts("v3/observation", narrowed, longOutline))
        .isFalse();
    String fragment = "v3/replay-validation#/definitions/ValidationBasis";
    JsonSchema original = originalSchema(fragment);
    assertNativePlan(compiledSchema(fragment, original));
    ObjectNode basis = fixtureValidationRequest().withObject("/validationBasis");
    org.assertj.core.api.Assertions.assertThat(originalAccepts(original, basis)).isTrue();
    contracts.validate(fragment, basis);
    basis.put("unexpected", true);
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> contracts.validate(fragment, basis))
        .hasMessage("INVALID_CONTRACT");
  }

  private void assertNativePlan(Object plan) throws Exception {
    org.assertj.core.api.Assertions.assertThat(compiledAlternatives(plan)).isEmpty();
    org.assertj.core.api.Assertions.assertThat(compiledPropertyCount(plan)).isZero();
    org.assertj.core.api.Assertions.assertThat(compiledObjects(plan)).isEmpty();
    org.assertj.core.api.Assertions.assertThat(compiledArrays(plan)).isEmpty();
    org.assertj.core.api.Assertions.assertThat(compiledNodes(plan)).isNull();
  }

  private void assertFinitePlan(String name, Object plan) throws Exception {
    org.assertj.core.api.Assertions.assertThat(compiledAlternatives(plan)).isEmpty();
    // ADR-SC-007: an observation has 12 properties (the node array became outline + facts).
    int expected =
        name.equals("v3/session")
            ? 16
            : name.equals("v3/ledger") ? 21 : name.equals("v3/observation") ? 12 : 9;
    org.assertj.core.api.Assertions.assertThat(compiledPropertyCount(plan)).isEqualTo(expected);
    var objects = compiledObjects(plan);
    if (name.equals("v3/replay-validation")) {
      org.assertj.core.api.Assertions.assertThat(
              objects.keySet().equals(java.util.Set.of("artifact", "validationBasis")))
          .isTrue();
      org.assertj.core.api.Assertions.assertThat(compiledPropertyCount(objects.get("artifact")))
          .isEqualTo(12);
      org.assertj.core.api.Assertions.assertThat(
              compiledPropertyCount(objects.get("validationBasis")))
          .isEqualTo(36);
      for (Object child : objects.values()) {
        org.assertj.core.api.Assertions.assertThat(compiledObjects(child)).isEmpty();
        org.assertj.core.api.Assertions.assertThat(compiledNodes(child)).isNull();
      }
      org.assertj.core.api.Assertions.assertThat(compiledArrays(objects.get("artifact"))).isEmpty();
      var arrays = compiledArrays(objects.get("validationBasis"));
      org.assertj.core.api.Assertions.assertThat(
              arrays.keySet().equals(java.util.Set.of("observations", "actions", "preparations")))
          .isTrue();
      Object observationFact = compiledItemObject(arrays.get("observations"));
      Object actionFact = compiledItemObject(arrays.get("actions"));
      org.assertj.core.api.Assertions.assertThat(compiledPropertyCount(observationFact))
          .isEqualTo(2);
      org.assertj.core.api.Assertions.assertThat(compiledPropertyCount(actionFact)).isEqualTo(3);
      org.assertj.core.api.Assertions.assertThat(
              compiledObjects(observationFact).keySet().equals(java.util.Set.of("observation")))
          .isTrue();
      org.assertj.core.api.Assertions.assertThat(
              compiledObjects(actionFact).keySet().equals(java.util.Set.of("ledger")))
          .isTrue();
      assertFinitePlan("v3/observation", compiledObjects(observationFact).get("observation"));
      assertFinitePlan("v3/ledger", compiledObjects(actionFact).get("ledger"));
      org.assertj.core.api.Assertions.assertThat(compiledItemObject(arrays.get("preparations")))
          .isNull();
    } else {
      org.assertj.core.api.Assertions.assertThat(objects).isEmpty();
    }
    org.assertj.core.api.Assertions.assertThat(compiledArrays(plan)).isEmpty();
    org.assertj.core.api.Assertions.assertThat(compiledNodes(plan)).isNull();
  }

  private java.util.Map<?, ?> compiledObjects(Object compiled) throws Exception {
    var objects = compiled.getClass().getDeclaredMethod("objects");
    objects.setAccessible(true);
    return (java.util.Map<?, ?>) objects.invoke(compiled);
  }

  private java.util.Map<?, ?> compiledArrays(Object compiled) throws Exception {
    var arrays = compiled.getClass().getDeclaredMethod("arrays");
    arrays.setAccessible(true);
    return (java.util.Map<?, ?>) arrays.invoke(compiled);
  }

  private Object compiledNodes(Object compiled) throws Exception {
    return compiledArrays(compiled).get("nodes");
  }

  private Object compiledItemObject(Object array) throws Exception {
    var item = array.getClass().getDeclaredMethod("itemObject");
    item.setAccessible(true);
    return item.invoke(array);
  }

  private ObjectNode fixtureRoot(String name) throws Exception {
    if (name.equals("v3/replay-validation")) {
      return fixtureValidationRequest();
    }
    JsonNode documents =
        contracts
            .parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    String key = name.substring("v3/".length());
    return name.equals("v3/observation")
        ? documents.path(key).path("observation").deepCopy()
        : documents.path(key).deepCopy();
  }

  private void addNativeCase(
      JsonSchema original, List<JsonNode> cases, ObjectNode value, boolean accepted) {
    org.assertj.core.api.Assertions.assertThat(originalAccepts(original, value))
        .isEqualTo(accepted);
    cases.add(value);
  }

  private void requestArrayCases(ObjectNode document, JsonSchema original, List<JsonNode> cases) {
    for (String field : List.of("observations", "actions", "preparations")) {
      String pointer = "/validationBasis/" + field;
      int maximum = field.equals("observations") ? 400 : 200;
      for (int size : new int[] {0, maximum, maximum + 1}) {
        ObjectNode changed = document.deepCopy();
        var array = changed.withObject("/validationBasis").putArray(field);
        for (int index = 0; index < size; index++) {
          array.add(document.at(pointer + "/0").deepCopy());
        }
        addNativeCase(
            original,
            cases,
            changed,
            size <= maximum && (size > 0 || field.equals("observations")));
      }
      ObjectNode absentArray = document.deepCopy();
      absentArray.withObject("/validationBasis").putNull(field);
      addNativeCase(original, cases, absentArray, false);
      ObjectNode nonArray = document.deepCopy();
      nonArray.withObject("/validationBasis").put(field, "invalid-array");
      addNativeCase(original, cases, nonArray, false);
      ObjectNode nullItem = document.deepCopy();
      nullItem.withArray(pointer).set(0, com.fasterxml.jackson.databind.node.NullNode.instance);
      addNativeCase(original, cases, nullItem, false);
      ObjectNode missing = document.deepCopy();
      missing
          .withObject(pointer + "/0")
          .remove(
              field.equals("observations")
                  ? "observationHash"
                  : field.equals("actions") ? "ledger" : "proposal");
      addNativeCase(original, cases, missing, false);
    }
    ObjectNode badObservation = document.deepCopy();
    badObservation
        .withObject("/validationBasis/observations/0/observation")
        .put("observedAt", "not-a-date");
    addNativeCase(original, cases, badObservation, false);
    ObjectNode badLedger = document.deepCopy();
    badLedger.withObject("/validationBasis/actions/0/ledger").put("dispatchCount", -1);
    addNativeCase(original, cases, badLedger, false);
    ObjectNode badPreparation = document.deepCopy();
    badPreparation.withObject("/validationBasis/preparations/0/proof").remove("workerId");
    addNativeCase(original, cases, badPreparation, false);
    ObjectNode badProposal = document.deepCopy();
    badProposal
        .withObject("/validationBasis/preparations/0/proposal/operation")
        .put("kind", "unsupported-operation");
    addNativeCase(original, cases, badProposal, false);
  }

  private ObjectNode fixtureValidationRequest() throws Exception {
    JsonNode independent =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../studio-runner/fixtures/observed-reference/fresh-order-reference.json")));
    ObjectNode request =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("attemptId", "00000000-0000-4000-8000-000000000001")
            .put("claimId", "00000000-0000-4000-8000-000000000002")
            .put("snapshotHash", "a".repeat(64))
            .put("basisHash", GuidedContracts.hash(independent.path("basis")));
    request.set("requiredProfile", independent.path("artifact").path("profile").deepCopy());
    request.set(
        "requiredBuild",
        contracts
            .object()
            .put("profileHash", GuidedContracts.hash(request.path("requiredProfile")))
            .put("schemaBundleHash", "b".repeat(64))
            .put("referenceBundleHash", "c".repeat(64))
            .put("executableImageDigest", "d".repeat(64))
            .put("chromiumBuild", "synthetic-component"));
    request.set("artifact", independent.path("artifact").deepCopy());
    request.set("validationBasis", independent.path("basis").deepCopy());
    return request;
  }

  private ObjectNode fixtureSession() throws Exception {
    return contracts
        .parse(
            Files.readString(
                Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
        .path("documents")
        .path("session")
        .deepCopy();
  }

  // Compile the unchanged native resource path, not a second call to the optimized validation.
  private JsonSchema originalSchema(String name) throws Exception {
    var method = GuidedContracts.class.getDeclaredMethod("schema", String.class);
    method.setAccessible(true);
    return (JsonSchema) method.invoke(new GuidedContracts(), name);
  }

  private Object compiledSchema(String name, JsonSchema original) throws Exception {
    var compile =
        GuidedContracts.class.getDeclaredMethod("compileSchema", String.class, JsonSchema.class);
    compile.setAccessible(true);
    return compile.invoke(contracts, name, original);
  }

  private int compiledPropertyCount(Object compiled) throws Exception {
    var properties = compiled.getClass().getDeclaredMethod("properties");
    properties.setAccessible(true);
    return ((java.util.Map<?, ?>) properties.invoke(compiled)).size();
  }

  private boolean compiledAccepts(String name, JsonSchema original, JsonNode value)
      throws Exception {
    Object compiled = compiledSchema(name, original);
    var validate = compiled.getClass().getDeclaredMethod("valid", JsonNode.class);
    validate.setAccessible(true);
    return (boolean) validate.invoke(compiled, value);
  }

  private boolean originalAccepts(JsonSchema original, JsonNode value) {
    try {
      GuidedContracts.canonical(value);
      return original.validate(value).isEmpty();
    } catch (GuidedSessionException refusal) {
      return false;
    }
  }

  private void collectMutations(
      ObjectNode original, String pointer, JsonNode node, List<JsonNode> cases, boolean recursive) {
    if (node.isObject()) {
      ObjectNode extra = original.deepCopy();
      ((ObjectNode) extra.at(pointer)).put("unexpected", true);
      cases.add(extra);
      for (var fields = node.fields(); fields.hasNext(); ) {
        var field = fields.next();
        String name = field.getKey();
        ObjectNode absent = original.deepCopy();
        ((ObjectNode) absent.at(pointer)).remove(name);
        cases.add(absent);
        ObjectNode explicitNull = original.deepCopy();
        ((ObjectNode) explicitNull.at(pointer)).putNull(name);
        cases.add(explicitNull);
        ObjectNode wrongType = original.deepCopy();
        ((ObjectNode) wrongType.at(pointer)).putArray(name);
        cases.add(wrongType);
        if (!recursive) {
          continue; // Bound the larger replay corpus to the three root-field mutations.
        }
        if (field.getValue().isTextual()) {
          ObjectNode empty = original.deepCopy();
          ((ObjectNode) empty.at(pointer)).put(name, "");
          cases.add(empty);
          ObjectNode longText = original.deepCopy();
          ((ObjectNode) longText.at(pointer)).put(name, "x".repeat(257));
          cases.add(longText);
        }
        if (field.getValue().isIntegralNumber()) {
          for (long number : new long[] {-1, 0, 2147483648L}) {
            ObjectNode changed = original.deepCopy();
            ((ObjectNode) changed.at(pointer)).put(name, number);
            cases.add(changed);
          }
        }
        collectMutations(original, pointer + "/" + name, field.getValue(), cases, true);
      }
    } else if (node.isArray()) {
      ObjectNode empty = original.deepCopy();
      ((com.fasterxml.jackson.databind.node.ArrayNode) empty.at(pointer)).removeAll();
      cases.add(empty);
      if (!node.isEmpty()) {
        ObjectNode oversized = original.deepCopy();
        var items = (com.fasterxml.jackson.databind.node.ArrayNode) oversized.at(pointer);
        while (items.size() <= 100) {
          items.add(node.get(0).deepCopy());
        }
        cases.add(oversized);
      }
      for (int index = 0; index < node.size(); index++) {
        collectMutations(original, pointer + "/" + index, node.get(index), cases, true);
      }
    }
  }
}
