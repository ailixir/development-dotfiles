package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class GuidedTranslationTest {
  private final GuidedContracts c = new GuidedContracts();

  private static GuidedTranslationMigrationTest.Database delayedDb;

  @org.junit.jupiter.api.BeforeAll
  static void startDelayedDatabase() {
    delayedDb = new GuidedTranslationMigrationTest.Database();
  }

  @org.junit.jupiter.api.AfterAll
  static void stopDelayedDatabase() {
    delayedDb.close();
  }

  @Test
  void projectionValidatesMalformedAfterValidAndKeepsBothCopiesIsolated() throws Exception {
    var fixtures =
        c.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json")));
    ObjectNode context = (ObjectNode) fixtures.path("cases").get(1).path("value").deepCopy();
    ObjectNode expected = context.deepCopy();
    var projection = new GuidedModelProjection(context);

    context.put("unexpectedProjectionField", true);
    assertThat(context).isNotEqualTo(expected);
    assertThat(projection.document()).isEqualTo(expected);
    assertThatThrownBy(() -> new GuidedModelProjection(context)).hasMessage("INVALID_CONTRACT");

    ObjectNode returned = projection.document();
    returned.put("schemaVersion", 2);
    assertThat(returned).isNotEqualTo(expected);
    assertThat(projection.document()).isEqualTo(expected);
    assertThat(new GuidedModelProjection(expected.deepCopy()).document()).isEqualTo(expected);
  }

  @Test
  void strictProviderBoundaryRefusesDuplicateTrailingProseAndIdentitySubstitution()
      throws Exception {
    ObjectNode answer =
        c.object()
            .put("schemaVersion", 3)
            .put("kind", "STEP_CODE")
            .put("requestId", "request-1")
            .put("status", "CODE")
            .put("code", "await page.goto('https://example.test');");
    answer.putArray("captures");
    ObjectNode context =
        (ObjectNode)
            c.parse(
                    Files.readString(
                        Path.of(
                            "../docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json")))
                .path("cases")
                .get(1)
                .path("value");
    var assembler =
        new GuidedPromptAssembler(c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    var request =
        new GuidedModelRequest(
            "request-1",
            1,
            GuidedModelRequest.Kind.STEP_CODE,
            new GuidedModelProjection(context),
            "static contract",
            assembler.providerSchema(GuidedModelRequest.Kind.STEP_CODE),
            4096);
    var parser = new GuidedResponseParser(c);
    assertThat(parser.parse(request, answer.toString().getBytes(StandardCharsets.UTF_8)))
        .isEqualTo(answer);
    String actualVersionField = "\"schemaVersion\":" + answer.path("schemaVersion").asInt();
    String duplicateVersion =
        answer
            .toString()
            .replace(actualVersionField, actualVersionField + "," + actualVersionField);
    assertThat(duplicateVersion).isNotEqualTo(answer.toString());
    for (String invalid :
        List.of(
            answer + " {}",
            "```json\n" + answer + "\n```",
            duplicateVersion,
            answer.toString().replace("request-1", "other-request"))) {
      assertThatThrownBy(() -> parser.parse(request, invalid.getBytes(StandardCharsets.UTF_8)))
          .hasMessage("INVALID_CONTRACT");
    }
  }

  @Test
  void providerSchemaIsSelfContainedSupportedAndBothIdentitiesArePinned() {
    var assembler =
        new GuidedPromptAssembler(c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      JsonNode schema = assembler.providerSchema(kind);
      assertThat(schema.toString())
          .doesNotContain(
              "https://",
              "\"const\"",
              "\"pattern\"",
              "\"minLength\"",
              "\"maxLength\"",
              "\"if\"",
              "\"then\"",
              "\"not\"");
      verifyLocalReferences(schema, schema);
      assertThat(
              assembler.schemaProvenance().path("providerSchemaHashes").path(kind.name()).asText())
          .isEqualTo(GuidedContracts.hash(schema));
    }
    assertThat(assembler.schemaProvenance().path("strictSchemaHash").asText()).hasSize(64);
    assertThat(assembler.schemaProvenance().path("sourceSelectionSchemaHash").asText()).hasSize(64);
  }

  @Test
  void startupSchemaEpochReturnsDefensiveCopiesWithoutRebuildingMetadata() {
    GuidedContracts parsing = org.mockito.Mockito.spy(new GuidedContracts());
    var assembler =
        new GuidedPromptAssembler(parsing, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    ObjectNode baselinePins = assembler.schemaProvenance();
    String pinsCanonical = GuidedContracts.canonical(baselinePins);
    var canonicalSchemas =
        new java.util.EnumMap<GuidedModelRequest.Kind, String>(GuidedModelRequest.Kind.class);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      canonicalSchemas.put(kind, GuidedContracts.canonical(assembler.providerSchema(kind)));
    }
    org.mockito.Mockito.clearInvocations(parsing);

    ObjectNode returnedPins = assembler.schemaProvenance();
    returnedPins.withObject("/providerSchemaHashes").put("SOURCE_PLAN", "f".repeat(64));
    returnedPins.removeAll();
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      ObjectNode returnedSchema = (ObjectNode) assembler.providerSchema(kind);
      for (JsonNode typed : returnedSchema.findParents("type")) {
        ((ObjectNode) typed).put("type", "changed-returned-copy");
      }
      returnedSchema.removeAll();
      JsonNode freshSchema = assembler.providerSchema(kind);
      assertThat(freshSchema).isNotSameAs(returnedSchema);
      assertThat(GuidedContracts.canonical(freshSchema)).isEqualTo(canonicalSchemas.get(kind));
      assertThat(
              assembler.schemaProvenance().path("providerSchemaHashes").path(kind.name()).asText())
          .isEqualTo(GuidedContracts.hash(freshSchema));
    }
    ObjectNode freshPins = assembler.schemaProvenance();
    assertThat(freshPins).isNotSameAs(returnedPins);
    assertThat(GuidedContracts.canonical(freshPins)).isEqualTo(pinsCanonical);
    org.mockito.Mockito.verifyNoInteractions(parsing);
  }

  @Test
  void failedStaticSchemaConstructionPublishesNoEpoch() {
    GuidedContracts parsing = org.mockito.Mockito.spy(new GuidedContracts());
    var parsed = new AtomicInteger();
    org.mockito.Mockito.doAnswer(
            invocation -> {
              if (parsed.incrementAndGet() == 2) {
                throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                    "INVALID_CONTRACT", 422);
              }
              return invocation.callRealMethod();
            })
        .when(parsing)
        .parse(org.mockito.ArgumentMatchers.anyString());
    var published = new java.util.concurrent.atomic.AtomicReference<GuidedPromptAssembler>();
    assertThatThrownBy(
            () ->
                published.set(
                    new GuidedPromptAssembler(
                        parsing, com.citi.put.checks.studio.support.TestDomains.FIXTURES)))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    assertThat(parsed.get()).isEqualTo(2);
    assertThat(published.get()).isNull();
  }

  private final class PreparationFixture {
    final ObjectNode session = c.object(), progress = c.object(), state = c.object();
    final JsonNode safeInputs, remaining, selections;
    final List<String> repairs = List.of();
    final GuidedModelRequest.Kind kind = GuidedModelRequest.Kind.SOURCE_PLAN;

    PreparationFixture() throws Exception {
      JsonNode context =
          c.parse(
                  Files.readString(
                      Path.of(
                          "../docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json")))
              .path("cases")
              .get(1)
              .path("value")
              .deepCopy();
      session.set("sessionId", context.path("sessionId"));
      session.set("scopeHash", context.path("scopeHash"));
      session.set("sourceSteps", context.path("sourceSteps"));
      session
          .putObject("scope")
          .setAll(
              java.util.Map.of(
                  "sourceRevision",
                  context.path("sourceRevision"),
                  "configurationRevision",
                  context.path("configurationRevision")));
      progress
          .put("stepIndex", 0)
          .put("translationOrdinal", context.path("coordinate").path("ordinal").asInt());
      for (String key :
          List.of("observation", "executionEvidence", "authoredInputsHash", "contextRevision")) {
        progress.set(key, context.path(key));
      }
      ObjectNode manifest = state.putObject("manifest");
      for (String key : List.of("sourceSteps", "configurationReferences", "authoringContext")) {
        manifest.set(key, context.path(key));
      }
      state.putObject("plan").set("needs", context.path("needs"));
      safeInputs = context.path("inputs");
      remaining = context.path("obligations");
      selections = context.path("clarificationSelections");
    }

    ObjectNode context(GuidedPromptAssembler assembler) {
      return assembler.buildPositiveContext(
          kind, session, progress, state, safeInputs, remaining, selections, repairs);
    }

    GuidedModelRequest complete(
        GuidedPromptAssembler assembler,
        GuidedPromptAssembler.PreparedProjection prepared,
        String key,
        int cap) {
      return assembler.completePreparedOrOriginal(
          assembler.preparationCapability(),
          prepared,
          key,
          1,
          kind,
          session,
          progress,
          state,
          safeInputs,
          remaining,
          selections,
          repairs,
          cap);
    }
  }

  @Test
  void projectionPreparationIsPrivateFactoryAndSameOwnerOnly() throws Exception {
    var fixture = new PreparationFixture();
    var manual =
        new GuidedPromptAssembler(c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    var first =
        GuidedPromptAssembler.createForProductionFactory(
            c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    var other =
        GuidedPromptAssembler.createForProductionFactory(
            c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    ObjectNode context = fixture.context(first);
    assertThat(manual.preparationCapability()).isNull();
    assertThat(
            manual.preparePure(
                first.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isNull();
    assertThat(
            other.preparePure(
                first.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isNull();
    var prepared =
        first.preparePure(first.preparationCapability(), context, "prepare", 1, fixture.kind, 2048);
    assertThat(prepared).isNotNull();
    GuidedModelRequest foreign = fixture.complete(other, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(foreign)).isNull();
    assertThat(foreign.projection().document()).isEqualTo(context);
  }

  @Test
  void projectionPreparationRequiresFreshCutKeyAndOutputMetadata() throws Exception {
    var fixture = new PreparationFixture();
    var assembler =
        GuidedPromptAssembler.createForProductionFactory(
            c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    ObjectNode original = fixture.context(assembler);
    var prepared =
        assembler.preparePure(
            assembler.preparationCapability(), original, "prepare", 1, fixture.kind, 2048);
    GuidedModelRequest exact = fixture.complete(assembler, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(exact)).isPositive();
    GuidedModelRequest recovered = fixture.complete(assembler, prepared, "prepare-recovery", 2048);
    assertThat(prepared.bytesFor(recovered)).isNull();
    assertThat(recovered.requestId()).isEqualTo("prepare-recovery");
    GuidedModelRequest newCap = fixture.complete(assembler, prepared, "prepare", 2049);
    assertThat(prepared.bytesFor(newCap)).isNull();
    assertThat(newCap.maxOutputTokens()).isEqualTo(2049);
    ((ObjectNode) fixture.state.path("manifest").path("sourceSteps").get(0))
        .put("text", "Fresh changed source");
    GuidedModelRequest changed = fixture.complete(assembler, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(changed)).isNull();
    assertThat(changed.projection().document().path("sourceSteps").get(0).path("text").asText())
        .isEqualTo("Fresh changed source");
    assertThat(exact.projection().document()).isEqualTo(original);
  }

  @Test
  void typedPreparationFailureRequiresSameFreshValidationInput() throws Exception {
    var fixture = new PreparationFixture();
    var assembler =
        GuidedPromptAssembler.createForProductionFactory(
            c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    JsonNode validHash = fixture.session.path("scopeHash").deepCopy();
    fixture.session.put("scopeHash", "invalid");
    var prepared =
        assembler.preparePure(
            assembler.preparationCapability(),
            fixture.context(assembler),
            "prepare",
            1,
            fixture.kind,
            2048);
    assertThat(prepared).isNotNull();
    assertThatThrownBy(() -> fixture.complete(assembler, prepared, "prepare", 2048))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    fixture.session.set("scopeHash", validHash);
    GuidedModelRequest current = fixture.complete(assembler, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(current)).isNull();
    assertThat(current.projection().document().path("scopeHash")).isEqualTo(validHash);
  }

  @Test
  void nonfatalPreparationIsUnavailableAndFatalErrorPropagates() throws Exception {
    var fixture = new PreparationFixture();
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    var assembler =
        GuidedPromptAssembler.createForProductionFactory(
            controlled, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    ObjectNode context = fixture.context(assembler);
    org.mockito.Mockito.doThrow(new IllegalStateException("controlled preparation failure"))
        .when(controlled)
        .object();
    assertThat(
            assembler.preparePure(
                assembler.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isNull();
    org.mockito.Mockito.doCallRealMethod().when(controlled).object();
    assertThat(fixture.complete(assembler, null, "prepare", 2048).projection().document())
        .isEqualTo(context);
    AssertionError fatal = new AssertionError("controlled fatal preparation");
    org.mockito.Mockito.doThrow(fatal).when(controlled).object();
    assertThatThrownBy(
            () ->
                assembler.preparePure(
                    assembler.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isSameAs(fatal);
  }

  private static void verifyLocalReferences(JsonNode node, JsonNode root) {
    if (node.has("$ref")) {
      String reference = node.path("$ref").asText();
      assertThat(reference).startsWith("#/$defs/");
      assertThat(root.at(reference.substring(1)).isMissingNode()).isFalse();
    }
    node.elements().forEachRemaining(child -> verifyLocalReferences(child, root));
  }

  @Test
  void currentManifestMatchesFullStateAndReturnsFreshPersistedProvenance() throws Exception {
    ObjectNode document = delayedDb.seed(java.util.UUID.randomUUID().toString());
    delayedDb.init(document);
    String id = document.path("sessionId").asText();
    delayedDb.tx.executeWithoutResult(
        tx -> {
          JsonNode manifest = delayedDb.store.currentManifest(id);
          assertThat(manifest).isEqualTo(delayedDb.store.state(id).path("manifest"));
          ((ObjectNode) manifest).put("policy", "caller-mutated-copy");
          assertThat(delayedDb.store.currentManifest(id).path("policy").asText())
              .isEqualTo("INPUT-POLICY-01-A");
        });
  }

  @Test
  void currentManifestWithoutJoinedStateRefusesAndRequiresCallerTransaction() {
    ObjectNode document = delayedDb.seed(java.util.UUID.randomUUID().toString());
    String id = document.path("sessionId").asText();
    assertThatThrownBy(() -> delayedDb.tx.execute(tx -> delayedDb.store.currentManifest(id)))
        .hasMessage("MISSING_SOURCE");
    assertThatThrownBy(() -> delayedDb.tx.execute(tx -> delayedDb.store.state(id)))
        .hasMessage("MISSING_SOURCE");
    assertThatThrownBy(() -> delayedDb.store.currentManifest(id))
        .hasMessage("RUNTIME_INCOMPATIBLE");
  }

  @Test
  void cancellationAndAbsoluteDeadlineNeverRenewAProviderCall() throws Exception {
    Instant now = Instant.parse("2026-10-08T00:00:00Z");
    var budget = new GuidedCallBudget(now.plusSeconds(5), Clock.fixed(now, ZoneOffset.UTC));
    AtomicInteger cancelled = new AtomicInteger();
    var registration = budget.onCancel(cancelled::incrementAndGet);
    assertThat(budget.remaining()).isEqualTo(Duration.ofSeconds(5));
    budget.cancel();
    budget.cancel();
    assertThat(cancelled.get()).isEqualTo(1);
    assertThatThrownBy(budget::remaining)
        .isInstanceOf(java.util.concurrent.CancellationException.class);
    registration.close();
    assertThatThrownBy(
            () -> new GuidedCallBudget(now, Clock.fixed(now, ZoneOffset.UTC)).remaining())
        .isInstanceOf(java.util.concurrent.CancellationException.class);
  }
}

/** Actual application configuration: no copied service/source/gateway bean constructors. */
@org.springframework.boot.test.context.SpringBootTest(
    classes = com.citi.put.checks.ChecksApplication.class,
    properties = {
      "studio.guided-authoring.translation.enabled=true",
      "studio.guided-authoring.runner-origin=https://localhost:1",
      "studio.guided-authoring.translation.controller-origin=https://localhost:1",
      "studio.guided-authoring.controller-token-file=/tmp/obs005-unused-wiring-token",
      "studio.gateway.provider=vertex",
      "studio.gateway.endpoint=http://127.0.0.1:1",
      "studio.gateway.project=synthetic-project",
      "studio.gateway.location=global",
      "studio.gateway.model=synthetic-model",
      "studio.gateway.credentials.mode=none"
    })
@org.springframework.test.context.ActiveProfiles("local")
class GuidedProductionWiringTest {
  @org.springframework.beans.factory.annotation.Autowired
  org.springframework.context.ApplicationContext context;

  @org.junit.jupiter.api.Test
  void enabledConfigurationInstallsConcreteSourceVerifierProviderAndCoordinator() {
    Object access =
        context.getBean(com.citi.put.checks.studio.guided.session.GuidedSessionAccess.class);
    org.assertj.core.api.Assertions.assertThat(access)
        .isInstanceOf(GuidedProductionSessionAccess.class)
        .isInstanceOf(
            com.citi.put.checks.studio.guided.session.GuidedSessionService.StepVerifier.class);
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedLlmGatewayClient.class))
        .isInstanceOf(GenAiGuidedLlmGatewayClient.class);
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedTranslationService.class))
        .isNotNull();
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedTranslationCoordinator.class))
        .isNotNull();
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedPlanningController.class))
        .isNotNull();
  }
}

@org.springframework.boot.test.context.SpringBootTest(
    classes = com.citi.put.checks.ChecksApplication.class,
    properties = {
      "studio.guided-authoring.translation.enabled=false",
      "studio.gateway.provider=disabled"
    })
@org.springframework.test.context.ActiveProfiles("local")
class GuidedDisabledWiringTest {
  @org.springframework.beans.factory.annotation.Autowired
  org.springframework.context.ApplicationContext context;

  @org.junit.jupiter.api.Test
  void disabledConfigurationHasNoCoordinatorOrImplicitGuidedExecution() {
    org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(GuidedTranslationService.class))
        .isEmpty();
    org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(GuidedTranslationCoordinator.class))
        .isEmpty();
    org.assertj.core.api.Assertions.assertThat(
            context.getBean(GuidedLlmGatewayClient.class).propose(null, null).code())
        .isEqualTo(GuidedModelResponse.Code.DISABLED);
  }
}
