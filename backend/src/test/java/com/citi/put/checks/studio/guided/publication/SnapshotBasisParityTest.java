package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.IncrementalAuthoringIdentity;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.StudioAuthoringValidation;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Validation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Real constructor results versus permanent independent envelopes; no SQL/browser execution credit.
 */
class SnapshotBasisParityTest {
  static final GuidedContracts C = new GuidedContracts();
  static final ObjectMapper M =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
          .disable(
              com.fasterxml.jackson.databind.DeserializationFeature
                  .ADJUST_DATES_TO_CONTEXT_TIME_ZONE);
  static final String ALTERED = "b".repeat(64);

  static JsonNode document() throws Exception {
    return C.parse(
        Files.readString(
            Path.of(
                "../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json")));
  }

  static JsonNode at(JsonNode node, String path) {
    JsonNode value = path.isEmpty() ? node : node.at("/" + path);
    if (value.isMissingNode()) {
      throw new AssertionError("Missing fixture fact " + path);
    }
    return value;
  }

  static void put(JsonNode node, String path, JsonNode value) {
    int slash = path.lastIndexOf('/');
    JsonNode parent = slash < 0 ? node : at(node, path.substring(0, slash));
    String key = path.substring(slash + 1);
    if (parent.isArray()) {
      ((ArrayNode) parent).set(Integer.parseInt(key), value);
    } else {
      ((ObjectNode) parent).set(key, value);
    }
  }

  static void put(JsonNode node, String path, String value) {
    put(node, path, M.valueToTree(value));
  }

  static void remove(JsonNode node, String path) {
    int slash = path.lastIndexOf('/');
    JsonNode parent = slash < 0 ? node : at(node, path.substring(0, slash));
    String key = path.substring(slash + 1);
    if (parent.isArray()) {
      ((ArrayNode) parent).remove(Integer.parseInt(key));
    } else {
      ((ObjectNode) parent).remove(key);
    }
  }

  static JsonNode ordinary(JsonNode doc) {
    return at(doc, "snapshotCorrection/positives/0");
  }

  static ObjectNode current(JsonNode doc) {
    return at(ordinary(doc), "basis/snapshotEvidence/current").deepCopy();
  }

  static ObjectNode configuration(JsonNode doc) {
    return at(ordinary(doc), "basis/configuration").deepCopy();
  }

  static ObjectNode learned(JsonNode doc) {
    return at(ordinary(doc), "expectedArtifact/learnedPlan").deepCopy();
  }

  static ObjectNode computation(JsonNode doc) {
    return at(ordinary(doc), "snapshotComputation").deepCopy();
  }

  static List<String> chains(JsonNode identity, JsonNode configuration) {
    var source = IncrementalAuthoringIdentity.snapshot(identity);
    return IncrementalAuthoringIdentity.chains(
        source.authoring(), source.identity(), configuration);
  }

  /** Expected scope/projection facts come from frozen rows, never the constructor under test. */
  static ObjectNode construction(
      String label, JsonNode identity, JsonNode configuration, JsonNode plan, JsonNode expected) {
    JsonNode originalIdentity = identity.deepCopy(),
        originalConfiguration = configuration.deepCopy();
    JsonNode originalPlan = plan.deepCopy();
    var source = IncrementalAuthoringIdentity.snapshot(identity);
    List<String> actualChains =
        IncrementalAuthoringIdentity.chains(source.authoring(), source.identity(), configuration);
    ObjectNode actual =
        IncrementalAuthoringIdentity.snapshots(
            source.authoring(), source.identity(), configuration, plan);
    ObjectNode snapshots = C.object();
    String previous = GuidedContracts.hash(at(expected, "testConfig"));
    int index = 0;
    for (JsonNode row : at(expected, "rows")) {
      JsonNode input = at(row, "stepInput");
      String id = at(input, "stepId").asText();
      assertThat(source.identity().stepReferences().path(id))
          .as(label + ": exact local union")
          .isEqualTo(input.path("references"));
      ObjectNode chain =
          C.object()
              .put("domain", "studio.step-chain")
              .put("version", 1)
              .put("stepId", id)
              .put("stepInputHash", GuidedContracts.hash(input))
              .put("previous", previous);
      previous = GuidedContracts.hash(chain);
      assertThat(actualChains.get(index++)).as(label + ": predecessor").isEqualTo(previous);
      String contentHash = GuidedContracts.hash(at(row, "learnedContent"));
      assertThat(IncrementalAuthoringIdentity.learnedStepHash(plan, id))
          .as(label + ": learned projection")
          .isEqualTo(contentHash);
      snapshots.put(
          id,
          GuidedContracts.hash(
              C.object()
                  .put("domain", "studio.step-snapshot")
                  .put("version", 1)
                  .put("stepId", id)
                  .put("inputChain", previous)
                  .put("learnedStepHash", contentHash)));
    }
    assertThat(source.identity().globalReferences())
        .as(label + ": global-only union")
        .isEqualTo(at(expected, "testConfig/globalReferences"));
    assertThat(actual).as(label + ": exact snapshots").isEqualTo(snapshots);
    assertThat(identity).as(label + ": source preserved").isEqualTo(originalIdentity);
    assertThat(configuration).isEqualTo(originalConfiguration);
    assertThat(plan).as(label + ": graph preserved").isEqualTo(originalPlan);
    return actual;
  }

  static ObjectNode normalizedComputation(JsonNode doc) {
    ObjectNode expected = computation(doc);
    JsonNode identity = at(doc, "snapshotCorrection/normalization/identity");
    put(
        expected,
        "testConfig/globalContextHash",
        GuidedContracts.hash(at(identity, "authoring/globalContext")));
    for (int index = 0; index < at(identity, "authoring/steps").size(); index++) {
      put(
          expected,
          "rows/" + index + "/stepInput/context",
          at(identity, "authoring/steps/" + index + "/context").deepCopy());
    }
    return expected;
  }

  @Test
  void reconstructsAllFiveHashEnvelopesFromCompleteSource() throws Exception {
    JsonNode doc = document();
    for (JsonNode row : at(doc, "snapshotCorrection/positives")) {
      String label =
          "57/config/base;57/snapshot/source-graph-preserved;57/chain/all-golden-rows;57/learned/"
              + "all-golden-rows;57/snapshot/golden-all-steps:"
              + row.path("name").asText();
      JsonNode identity = at(row, "basis/snapshotEvidence/current"),
          config = at(row, "basis/configuration");
      JsonNode expected = at(row, "snapshotComputation"),
          plan = at(row, "expectedArtifact/learnedPlan");
      ObjectNode actual = construction(label, identity, config, plan, expected);
      String previous = GuidedContracts.hash(at(expected, "testConfig"));
      int index = 0;
      for (JsonNode step : at(expected, "rows")) {
        assertThat(at(step, "stepChain/previous").asText())
            .as("57/chain/predecessor")
            .isEqualTo(previous);
        assertThat(at(step, "stepChain/stepInputHash").asText())
            .isEqualTo(GuidedContracts.hash(at(step, "stepInput")));
        previous = GuidedContracts.hash(at(step, "stepChain"));
        assertThat(chains(identity, config).get(index++)).isEqualTo(previous);
        assertThat(actual.path(at(step, "stepInput/stepId").asText()))
            .isEqualTo(step.path("snapshotHash"));
      }
      if (!at(row, "basis/snapshotEvidence/baseProof").isNull()) {
        JsonNode base = at(row, "basis/snapshotEvidence/baseProof"),
            historical = at(doc, "snapshotCorrection/positives/3");
        assertThat(at(base, "authoringIdentity"))
            .isEqualTo(at(historical, "basis/snapshotEvidence/current"));
        ObjectNode oldMaps =
            construction(
                "57/snapshot/independent-base",
                at(base, "authoringIdentity"),
                at(base, "configuration"),
                at(base, "artifact/learnedPlan"),
                at(historical, "snapshotComputation"));
        assertThat(oldMaps).isEqualTo(at(base, "revision/stepSnapshotHashes"));
      }
      ObjectNode derived = plan.deepCopy();
      new GuidedSnapshotDeriver(C).apply(at(row, "basis"), derived);
      assertThat(derived.path("stepSnapshotHashes")).isEqualTo(actual);
      assertThat(
              new ObservedArtifactLowerer(C)
                  .lower(at(row, "basis"), at(row, "expectedArtifact/profile"))
                  .artifact())
          .isEqualTo(row.path("expectedArtifact"));
    }
    configurationAndInputMutations(doc);
    scopedReferencesAndEmptyValues(doc);
    normalizationAndEvidence(doc);
    scopeOrderAndCoordinates(doc);
    learnedProjection(doc);
  }

  private static void configurationAndInputMutations(JsonNode doc) {
    for (var mutation :
        List.of(
            new Mutation("57/config/environment", "environment", M.valueToTree("other")),
            new Mutation("57/config/viewport-width", "viewport/width", M.valueToTree(1281)),
            new Mutation("57/config/viewport-height", "viewport/height", M.valueToTree(721)),
            new Mutation("57/config/timeout", "timeoutSeconds", M.valueToTree(11)),
            new Mutation("57/config/wait", "waitStrategy", M.valueToTree("networkidle")))) {
      var config = configuration(doc);
      var expected = computation(doc);
      var identity = current(doc);
      put(config, mutation.path(), mutation.value());
      put(expected, "testConfig/" + mutation.path(), mutation.value());
      construction(mutation.label(), identity, config, learned(doc), expected);
      changedFrom(
          chains(current(doc), configuration(doc)), chains(identity, config), 0, mutation.label());
    }
    JsonNode expected = computation(doc), input = at(expected, "rows/0/stepInput");
    String first = chains(current(doc), configuration(doc)).getFirst();
    ObjectNode missing = at(expected, "testConfig").deepCopy();
    missing.remove("browser");
    assertThat(at(expected, "testConfig/browser").asText())
        .as("57/config/browser-included")
        .isEqualTo("chromium");
    for (JsonNode previous :
        List.of(
            M.valueToTree(GuidedContracts.hash(missing)),
            M.valueToTree(
                GuidedContracts.hash(C.object().set("config", at(expected, "testConfig")))),
            at(expected, "testConfig"))) {
      ObjectNode wrong =
          C.object()
              .put("domain", "studio.step-chain")
              .put("version", 1)
              .put("stepId", input.path("stepId").asText())
              .put("stepInputHash", GuidedContracts.hash(input));
      wrong.set("previous", previous);
      assertThat(first).as("57/chain/wrong-wrapper").isNotEqualTo(GuidedContracts.hash(wrong));
    }
    for (JsonNode row : at(expected, "rows")) {
      assertThat(GuidedContracts.hash(C.object().set("chain", row.path("stepChain"))))
          .isNotEqualTo(GuidedContracts.hash(row.path("stepChain")));
      assertThat(GuidedContracts.hash(M.createArrayNode().add(row.path("stepChain"))))
          .isNotEqualTo(GuidedContracts.hash(row.path("stepChain")));
    }
    ObjectNode skipped = at(expected, "rows/2/stepChain").deepCopy();
    skipped.put("previous", GuidedContracts.hash(at(expected, "rows/0/stepChain")));
    assertThat(chains(current(doc), configuration(doc)).get(2))
        .isNotEqualTo(GuidedContracts.hash(skipped));
    for (var mutation :
        List.of(
            new Mutation(
                "57/input/text",
                "authoring/steps/1/text",
                M.valueToTree("Read  the reference\nCafé é 🧪\u0001")),
            new Mutation(
                "57/input/context-literal",
                "authoring/steps/2/context/entries/1/value",
                M.valueToTree("  é Café\t\n\u0001  ")))) {
      ObjectNode identity = current(doc), exp = computation(doc);
      int index = mutation.path().contains("steps/1") ? 1 : 2;
      put(identity, mutation.path(), mutation.value());
      put(
          exp,
          "rows/" + index + "/stepInput/" + (index == 1 ? "text" : "context/entries/1/value"),
          mutation.value());
      construction(mutation.label(), identity, configuration(doc), learned(doc), exp);
      changedFrom(
          chains(current(doc), configuration(doc)),
          chains(identity, configuration(doc)),
          index,
          "57/chain/mutate-j");
    }
    for (String kind : List.of("literal", "evidence")) {
      ObjectNode identity = current(doc),
          exp = computation(doc),
          context = at(identity, "authoring/globalContext").deepCopy();
      put(
          context,
          kind.equals("literal") ? "entries" : "evidenceReferences",
          kind.equals("literal")
              ? C.parse("[{\"kind\":\"text\",\"value\":\"  é Café\\u0001\\n🧪 \"}]")
              : at(
                  doc,
                  "snapshotCorrection/normalization/identity/authoring/steps/1/context/evidenceReferences"));
      put(identity, "authoring/globalContext", context);
      put(exp, "testConfig/globalContextHash", GuidedContracts.hash(context));
      construction("57/config/global-" + kind, identity, configuration(doc), learned(doc), exp);
      changedFrom(
          chains(current(doc), configuration(doc)),
          chains(identity, configuration(doc)),
          0,
          "57/config/global-" + kind);
    }
  }

  private static void changedFrom(
      List<String> before, List<String> after, int boundary, String label) {
    for (int index = 0; index < before.size(); index++) {
      if (index < boundary) {
        assertThat(after.get(index)).as(label).isEqualTo(before.get(index));
      } else {
        assertThat(after.get(index)).as(label).isNotEqualTo(before.get(index));
      }
    }
  }

  private static void scopedReferencesAndEmptyValues(JsonNode doc) throws Exception {
    ObjectNode identity = current(doc), expected = computation(doc);
    put(identity, "authoredDeclarations/0/valueHash", ALTERED);
    put(expected, "rows/2/stepInput/references/0/valueHash", ALTERED);
    construction("57/input/scoped-reference", identity, configuration(doc), learned(doc), expected);
    changedFrom(
        chains(current(doc), configuration(doc)),
        chains(identity, configuration(doc)),
        2,
        "57/input/scoped-reference");
    identity = current(doc);
    expected = computation(doc);
    ObjectNode low =
        C.object()
            .put("referenceId", "\uE000")
            .put("kind", "plain")
            .put("valueHash", GuidedContracts.hash(M.valueToTree("")));
    ObjectNode high =
        C.object()
            .put("referenceId", "\uD800\uDC00")
            .put("kind", "plain")
            .put("valueHash", GuidedContracts.hash(M.valueToTree(" ")));
    ObjectNode context = C.object();
    var entries = context.putArray("entries");
    context.putArray("evidenceReferences");
    entries
        .addObject()
        .put("kind", "default")
        .put("name", "high-first")
        .putObject("value")
        .put("kind", "variableRef")
        .put("referenceId", "\uD800\uDC00");
    ObjectNode defaultEntry = entries.addObject().put("kind", "default").put("name", "one");
    defaultEntry.putObject("value").put("kind", "variableRef").put("referenceId", "\uE000");
    entries
        .addObject()
        .put("kind", "default")
        .put("name", "high-repeat")
        .putObject("value")
        .put("kind", "variableRef")
        .put("referenceId", "\uD800\uDC00");
    put(identity, "authoring/globalContext", context);
    ((ArrayNode) identity.path("authoredDeclarations")).add(low).add(high);
    put(expected, "testConfig/globalContextHash", GuidedContracts.hash(context));
    put(expected, "testConfig/globalReferences", M.createArrayNode().add(low).add(high));
    construction(
        "57/config/global-declaration;57/normalize/unicode-order",
        identity,
        configuration(doc),
        learned(doc),
        expected);
    ObjectNode changed = identity.deepCopy(), changedExpected = expected.deepCopy();
    put(changed, "authoredDeclarations/1/valueHash", ALTERED);
    put(changedExpected, "testConfig/globalReferences/0/valueHash", ALTERED);
    construction(
        "57/config/global-declaration: changed",
        changed,
        configuration(doc),
        learned(doc),
        changedExpected);
    changedFrom(
        chains(identity, configuration(doc)),
        chains(changed, configuration(doc)),
        0,
        "57/config/global-declaration");
    for (String value : List.of("", " ")) {
      var authoring = M.treeToValue(at(current(doc), "authoring"), AuthoringV2Request.class);
      var resolved =
          IncrementalAuthoringIdentity.resolve(
              authoring,
              List.of(
                  StudioVariable.plain("saved-label", value),
                  StudioVariable.plain("unused", "ignored")));
      String hash = GuidedContracts.hash(M.valueToTree(value));
      if (value.isEmpty()) {
        assertThat(hash)
            .as("57/value/empty")
            .isEqualTo("12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126");
      }
      assertThat(hash)
          .isNotEqualTo(
              GuidedContracts.hash(com.fasterxml.jackson.databind.node.NullNode.getInstance()))
          .isNotEqualTo(GuidedContracts.hash(M.valueToTree(value.isEmpty() ? " " : "")));
      assertThat(resolved.references().path("authoredDeclarations")).hasSize(1);
      assertThat(
              resolved.references().path("authoredDeclarations").get(0).path("valueHash").asText())
          .isEqualTo(hash);
      ObjectNode frozen = current(doc), exp = computation(doc);
      put(frozen, "authoredDeclarations/0/valueHash", hash);
      put(exp, "rows/2/stepInput/references/0/valueHash", hash);
      construction(
          value.isEmpty() ? "57/value/empty" : "57/value/whitespace",
          frozen,
          configuration(doc),
          learned(doc),
          exp);
      assertThat(IncrementalAuthoringIdentity.chains(authoring, resolved, configuration(doc)))
          .isEqualTo(chains(frozen, configuration(doc)));
      assertThatThrownBy(() -> IncrementalAuthoringIdentity.resolve(authoring, List.of()))
          .as("57/value/missing")
          .isInstanceOf(GuidedSessionException.class);
      assertThatThrownBy(
              () ->
                  IncrementalAuthoringIdentity.resolve(
                      authoring, List.of(StudioVariable.plain("saved-label", null))))
          .as("57/value/null")
          .isInstanceOf(GuidedSessionException.class);
    }
    for (String mutation :
        List.of("wrong-kind", "duplicate", "missing-hash", "direct-secret-collision")) {
      ObjectNode invalid = current(doc);
      switch (mutation) {
        case "wrong-kind" ->
            put(
                invalid,
                "authoredDeclarations/0",
                C.parse(
                    "{\"referenceId\":\"saved-label\",\"kind\":\"secretRef\",\"secretId\":\"saved-label\"}"));
        case "duplicate" ->
            ((ArrayNode) invalid.path("authoredDeclarations"))
                .add(invalid.path("authoredDeclarations").get(0));
        case "missing-hash" -> remove(invalid, "authoredDeclarations/0/valueHash");
        default -> put(invalid, "authoring/steps/0/text", "<secret saved-label>");
      }
      assertThatThrownBy(() -> chains(invalid, configuration(doc)))
          .as("57/input/scoped-reference/" + mutation)
          .isInstanceOf(GuidedSessionException.class);
    }
  }

  private static void normalizationAndEvidence(JsonNode doc) throws Exception {
    JsonNode normal = at(doc, "snapshotCorrection/normalization/identity");
    // Actual production DTO validation/mapper followed by the same source constructors.
    // The DTO long evidence revision becomes LongNode; the frozen JSON literal is IntNode.
    // Compare exact canonical-v1 bytes, which preserve integer values without a Jackson subtype.
    try (var factory = Validation.buildDefaultValidatorFactory()) {
      for (String variant : List.of("absent-context", "null-context", "empty-arrays")) {
        ObjectNode source = at(normal, "authoring").deepCopy();
        if (variant.equals("absent-context")) {
          remove(source, "globalContext");
          remove(source, "steps/0/context");
        } else if (variant.equals("null-context")) {
          put(source, "globalContext", com.fasterxml.jackson.databind.node.NullNode.getInstance());
          put(
              source,
              "steps/0/context",
              com.fasterxml.jackson.databind.node.NullNode.getInstance());
        } else {
          put(source, "globalContext", C.object());
          put(
              source,
              "steps/0/context",
              C.object().putNull("entries").putNull("evidenceReferences"));
        }
        var dto = StudioAuthoringValidation.read(M, factory.getValidator(), source);
        JsonNode normalized = M.valueToTree(dto);
        assertThat(GuidedContracts.canonical(normalized))
            .as("57/normalize/" + variant)
            .isEqualTo(GuidedContracts.canonical(at(normal, "authoring")));
        ObjectNode frozen = normal.deepCopy();
        frozen.set("authoring", normalized);
        construction(
            "57/normalize/" + variant,
            frozen,
            configuration(doc),
            learned(doc),
            normalizedComputation(doc));
      }
      ObjectNode omitted = at(normal, "authoring").deepCopy();
      remove(omitted, "steps/1/context/entries/0/exact");
      remove(omitted, "steps/1/context/entries/0/scope");
      JsonNode normalized =
          M.valueToTree(StudioAuthoringValidation.read(M, factory.getValidator(), omitted));
      assertThat(GuidedContracts.canonical(normalized))
          .as("57/normalize/hint-null;57/normalize/fractional-iso")
          .isEqualTo(GuidedContracts.canonical(at(normal, "authoring")));
      assertThat(at(normalized, "steps/1/context/evidenceReferences/0/capturedAt").asText())
          .isEqualTo("2026-10-15T04:00:00.123456789Z");
    }
    for (JsonNode exact :
        List.<JsonNode>of(
            com.fasterxml.jackson.databind.node.NullNode.getInstance(), M.valueToTree(false))) {
      ObjectNode identity = normal.deepCopy(), expected = normalizedComputation(doc);
      put(identity, "authoring/steps/1/context/entries/0/exact", exact);
      put(expected, "rows/1/stepInput/context/entries/0/exact", exact);
      construction(
          "57/input/targethint-"
              + exact
              + ";57/normalize/hint-"
              + exact
              + ";57/snapshot/normalized-metadata",
          identity,
          configuration(doc),
          learned(doc),
          expected);
    }
    for (var mutation :
        List.of(
            new Mutation("id", "id", M.valueToTree("00000000-0000-4000-8000-000000000778")),
            new Mutation("revision", "revision", M.valueToTree(2)),
            new Mutation("csiId", "csiId", M.valueToTree("CSI-456")),
            new Mutation("environment", "environment", M.valueToTree("other")),
            new Mutation("route", "route", M.valueToTree("/other")),
            new Mutation("state", "state", M.valueToTree("other")),
            new Mutation("stepId", "stepId", M.valueToTree("00000000-0000-4000-8000-000000000003")),
            new Mutation(
                "capturedAt", "capturedAt", M.valueToTree("2026-10-15T04:00:00.123456788Z")),
            new Mutation("completeness", "completeness", M.valueToTree("complete")),
            new Mutation("hash", "hash", M.valueToTree(ALTERED)))) {
      ObjectNode identity = normal.deepCopy(), expected = normalizedComputation(doc);
      put(
          identity,
          "authoring/steps/1/context/evidenceReferences/0/" + mutation.path(),
          mutation.value());
      put(
          expected,
          "rows/1/stepInput/context/evidenceReferences/0/" + mutation.path(),
          mutation.value());
      construction(
          "57/input/evidence-each-field/" + mutation.label(),
          identity,
          configuration(doc),
          learned(doc),
          expected);
      changedFrom(
          chains(normal, configuration(doc)),
          chains(identity, configuration(doc)),
          1,
          mutation.label());
    }
    ObjectNode unsupported = normal.deepCopy();
    put(unsupported, "authoring/steps/1/context/evidenceReferences/0/source", "observed");
    assertThatThrownBy(() -> IncrementalAuthoringIdentity.snapshot(unsupported))
        .as("57/input/evidence-each-field/source: closed supplied constant")
        .isInstanceOf(GuidedSessionException.class);
  }

  private static void scopeOrderAndCoordinates(JsonNode doc) {
    ObjectNode identity = current(doc), expected = computation(doc), plan = learned(doc);
    ObjectNode secret =
        C.object()
            .put("referenceId", "LOGIN_PASSWORD")
            .put("kind", "secretRef")
            .put("secretId", "LOGIN_PASSWORD");
    ObjectNode local =
        C.object()
            .put("referenceId", "local-one")
            .put("kind", "plain")
            .put("valueHash", GuidedContracts.hash(M.valueToTree("")));
    ObjectNode alias = secret.deepCopy();
    alias.put("referenceId", "secret-alias");
    String text = "<var local-one> <var local-one> <secret LOGIN_PASSWORD>";
    JsonNode context =
        C.parse(
            "{\"entries\":[{\"kind\":\"default\",\"name\":\"local\",\"value\":{\"kind\":\"variableRef\","
                + "\"referenceId\":\"local-one\"}},{\"kind\":\"secretRef\",\"referenceId\":\"secret-alias\"}],"
                + "\"evidenceReferences\":[]}");
    put(identity, "authoring/steps/0/text", text);
    put(identity, "authoring/steps/0/context", context);
    put(
        identity,
        "authoredDeclarations",
        M.createArrayNode()
            .add(secret)
            .add(local)
            .add(at(identity, "authoredDeclarations/0"))
            .add(alias));
    put(expected, "rows/0/stepInput/text", text);
    put(expected, "rows/0/stepInput/context", context);
    put(
        expected,
        "rows/0/stepInput/references",
        M.createArrayNode().add(secret).add(local).add(alias));
    ArrayNode prefixActions =
        M.createArrayNode().add(at(plan, "actions/0")).add(at(plan, "actions/1"));
    plan.set("actions", prefixActions);
    put(plan, "bindings/0/consumers", M.createArrayNode());
    put(expected, "rows/2/learnedContent/actions", M.createArrayNode());
    put(expected, "rows/2/learnedContent/consumedBindings", M.createArrayNode());
    construction(
        "57/input/scoped-reference/token-context-default-union;unexecuted authored reference",
        identity,
        configuration(doc),
        plan,
        expected);

    identity = at(doc, "snapshotCorrection/normalization/identity").deepCopy();
    expected = normalizedComputation(doc);
    context = at(identity, "authoring/steps/1/context");
    ObjectNode second = at(context, "evidenceReferences/0").deepCopy();
    second.put("id", "00000000-0000-4000-8000-000000000778");
    ((ArrayNode) context.path("entries"))
        .addObject()
        .put("kind", "text")
        .put("value", "  Café é\t\u0001  ");
    ((ArrayNode) context.path("evidenceReferences")).add(second);
    put(expected, "rows/1/stepInput/context", context.deepCopy());
    construction(
        "57/normalize/context-evidence-array-order",
        identity,
        configuration(doc),
        learned(doc),
        expected);
    List<String> old = chains(identity, configuration(doc));
    reverse((ArrayNode) context.path("entries"));
    reverse((ArrayNode) context.path("evidenceReferences"));
    put(expected, "rows/1/stepInput/context", context.deepCopy());
    construction(
        "57/normalize/context-evidence-array-order:reversed",
        identity,
        configuration(doc),
        learned(doc),
        expected);
    assertThat(chains(identity, configuration(doc)).get(1)).isNotEqualTo(old.get(1));

    identity = current(doc);
    expected = computation(doc);
    swap((ArrayNode) at(identity, "authoring/steps"), 0, 1);
    swap((ArrayNode) at(expected, "rows"), 0, 1);
    construction(
        "57/chain/predecessor/source-position-not-uuid-order",
        identity,
        configuration(doc),
        learned(doc),
        expected);
    identity = at(doc, "snapshotCorrection/normalization/identity").deepCopy();
    expected = normalizedComputation(doc);
    put(identity, "authoring/steps/1/context/entries/0/scope", "  region é  ");
    put(expected, "rows/1/stepInput/context/entries/0/scope", "  region é  ");
    construction("57/input/targethint-scope", identity, configuration(doc), learned(doc), expected);

    JsonNode originalEvidence =
        at(
            doc,
            "snapshotCorrection/normalization/identity/authoring/steps/1/context/evidenceReferences/0");
    for (String field :
        List.of(
            "id",
            "revision",
            "csiId",
            "environment",
            "route",
            "state",
            "stepId",
            "capturedAt",
            "completeness",
            "hash")) {
      identity = current(doc);
      expected = computation(doc);
      ObjectNode evidence = originalEvidence.deepCopy();
      JsonNode value = alteredEvidenceValue(field);
      evidence.set(field, value);
      put(
          identity,
          "authoring/globalContext/evidenceReferences",
          M.createArrayNode().add(evidence));
      put(
          expected,
          "testConfig/globalContextHash",
          GuidedContracts.hash(at(identity, "authoring/globalContext")));
      construction(
          "57/config/global-evidence/" + field,
          identity,
          configuration(doc),
          learned(doc),
          expected);
    }
    for (String[] pair :
        List.of(
            new String[] {
              "actions/0/coordinate/ordinal",
              "rows/0/learnedContent/actions/0/coordinate/ordinal",
              "3"
            },
            new String[] {
              "bindings/0/producer/ordinal",
              "rows/1/learnedContent/producedBindings/0/producer/ordinal",
              "1"
            },
            new String[] {
              "bindings/0/consumers/0/coordinate/ordinal",
              "rows/2/learnedContent/consumedBindings/0/coordinate/ordinal",
              "1"
            })) {
      plan = learned(doc);
      expected = computation(doc);
      JsonNode value = M.valueToTree(Integer.parseInt(pair[2]));
      put(plan, pair[0], value);
      put(expected, pair[1], value);
      construction(
          "57/learned/retained-semantic-fields/coordinate",
          current(doc),
          configuration(doc),
          plan,
          expected);
    }
    plan = learned(doc);
    expected = computation(doc);
    for (int index = 0; index < 2; index++) {
      String slot = index == 0 ? "\uD800\uDC00" : "\uE000";
      put(plan, "bindings/0/consumers/" + index + "/coordinate/ordinal", M.valueToTree(0));
      put(plan, "bindings/0/consumers/" + index + "/argumentSlot", slot);
      put(
          expected,
          "rows/2/learnedContent/consumedBindings/" + index + "/coordinate/ordinal",
          M.valueToTree(0));
      put(expected, "rows/2/learnedContent/consumedBindings/" + index + "/argumentSlot", slot);
    }
    reverse((ArrayNode) at(expected, "rows/2/learnedContent/consumedBindings"));
    construction(
        "57/learned/utf8-ties/argumentSlot", current(doc), configuration(doc), plan, expected);
    plan = learned(doc);
    expected = computation(doc);
    ObjectNode moved = at(expected, "rows/0/learnedContent/actions/0").deepCopy();
    String stepId = at(expected, "rows/1/stepInput/stepId").asText();
    put(plan, "actions/0/coordinate/stepId", stepId);
    put(moved, "coordinate/stepId", stepId);
    put(expected, "rows/0/learnedContent/actions", M.createArrayNode());
    ArrayNode target = M.createArrayNode().add(moved);
    at(expected, "rows/1/learnedContent/actions").forEach(target::add);
    put(expected, "rows/1/learnedContent/actions", target);
    construction(
        "57/learned/retained-semantic-fields/coordinate-stepId",
        current(doc),
        configuration(doc),
        plan,
        expected);
    plan = learned(doc);
    expected = computation(doc);
    ObjectNode producer = at(expected, "rows/1/learnedContent/producedBindings/0").deepCopy();
    String lastId = at(expected, "rows/2/stepInput/stepId").asText();
    put(plan, "bindings/0/producer/stepId", lastId);
    put(producer, "producer/stepId", lastId);
    put(expected, "rows/1/learnedContent/producedBindings", M.createArrayNode());
    put(expected, "rows/2/learnedContent/producedBindings", M.createArrayNode().add(producer));
    construction(
        "57/learned/retained-semantic-fields/producer-stepId",
        current(doc),
        configuration(doc),
        plan,
        expected);
    plan = learned(doc);
    expected = computation(doc);
    ObjectNode edge = at(expected, "rows/2/learnedContent/consumedBindings/0").deepCopy();
    String firstId = at(expected, "rows/0/stepInput/stepId").asText();
    put(plan, "bindings/0/consumers/0/coordinate/stepId", firstId);
    put(edge, "coordinate/stepId", firstId);
    put(expected, "rows/0/learnedContent/consumedBindings", M.createArrayNode().add(edge));
    ((ArrayNode) at(expected, "rows/2/learnedContent/consumedBindings")).remove(0);
    construction(
        "57/learned/retained-semantic-fields/consumer-stepId",
        current(doc),
        configuration(doc),
        plan,
        expected);
  }

  private static JsonNode alteredEvidenceValue(String field) {
    return switch (field) {
      case "id" -> M.valueToTree("00000000-0000-4000-8000-000000000778");
      case "revision" -> M.valueToTree(2);
      case "csiId" -> M.valueToTree("CSI-456");
      case "route" -> M.valueToTree("/other");
      case "stepId" -> M.valueToTree("00000000-0000-4000-8000-000000000003");
      case "capturedAt" -> M.valueToTree("2026-10-15T04:00:00.123456788Z");
      case "completeness" -> M.valueToTree("complete");
      case "hash" -> M.valueToTree(ALTERED);
      default -> M.valueToTree("other");
    };
  }

  private static void swap(ArrayNode array, int left, int right) {
    JsonNode value = array.get(left);
    array.set(left, array.get(right));
    array.set(right, value);
  }

  private static void reverse(ArrayNode array) {
    List<JsonNode> values = new ArrayList<>();
    array.forEach(values::add);
    Collections.reverse(values);
    array.removeAll();
    values.forEach(array::add);
  }

  private static void learnedProjection(JsonNode doc) {
    ObjectNode plan = learned(doc), expected = computation(doc);
    ObjectNode binding = at(plan, "bindings/0").deepCopy(),
        low = binding.deepCopy(),
        high = binding.deepCopy();
    low.put("bindingId", "\uE000");
    high.put("bindingId", "\uD800\uDC00");
    for (ObjectNode copiedBinding : List.of(low, high)) {
      for (JsonNode consumer : copiedBinding.path("consumers")) {
        ((ObjectNode) consumer).set("bindingId", copiedBinding.path("bindingId"));
      }
    }
    put(plan, "bindings", M.createArrayNode().add(high).add(low));
    List<JsonNode> reversed = new ArrayList<>();
    plan.path("actions").forEach(reversed::add);
    Collections.reverse(reversed);
    ArrayNode actions = M.createArrayNode();
    reversed.forEach(actions::add);
    plan.set("actions", actions);
    ObjectNode projected = at(expected, "rows/1/learnedContent/producedBindings/0").deepCopy();
    ObjectNode lp = projected.deepCopy(), hp = projected.deepCopy();
    lp.put("bindingId", "\uE000");
    hp.put("bindingId", "\uD800\uDC00");
    put(expected, "rows/1/learnedContent/producedBindings", M.createArrayNode().add(lp).add(hp));
    ArrayNode edges = M.createArrayNode();
    for (JsonNode edge : at(expected, "rows/2/learnedContent/consumedBindings")) {
      ObjectNode le = edge.deepCopy(), he = edge.deepCopy();
      le.put("bindingId", "\uE000");
      he.put("bindingId", "\uD800\uDC00");
      edges.add(le).add(he);
    }
    put(expected, "rows/2/learnedContent/consumedBindings", edges);
    construction(
        "57/learned/unsorted-multiple;57/learned/utf8-ties",
        current(doc),
        configuration(doc),
        plan,
        expected);
    for (String pair :
        List.of(
            "actions/0|rows/0/learnedContent/actions/0",
            "actions/1|rows/1/learnedContent/actions/0",
            "actions/2|rows/2/learnedContent/actions/0",
            "actions/3|rows/2/learnedContent/actions/1",
            "actions/4|rows/2/learnedContent/actions/2",
            "bindings/0|rows/1/learnedContent/producedBindings/0",
            "bindings/0/consumers/0|rows/2/learnedContent/consumedBindings/0",
            "bindings/0/consumers/1|rows/2/learnedContent/consumedBindings/1")) {
      String[] paths = pair.split("\\|");
      for (String leaf : leaves(at(computation(doc), paths[1]), "")) {
        if (leaf.contains("/stepId") || leaf.contains("/ordinal")) {
          continue;
        }
        ObjectNode changedPlan = learned(doc), exp = computation(doc);
        JsonNode value = at(exp, paths[1] + leaf);
        JsonNode replacement =
            value.isBoolean()
                ? M.valueToTree(!value.asBoolean())
                : value.isNumber()
                    ? M.valueToTree(value.asInt() + 1)
                    : M.valueToTree(value.isNull() ? "changed" : value.asText() + " changed");
        put(changedPlan, paths[0] + leaf, replacement);
        put(exp, paths[1] + leaf, replacement);
        construction(
            "57/learned/retained-semantic-fields/" + paths[0] + leaf,
            current(doc),
            configuration(doc),
            changedPlan,
            exp);
        assertThat(GuidedContracts.hash(at(exp, paths[1])))
            .isNotEqualTo(GuidedContracts.hash(at(computation(doc), paths[1])));
      }
    }
    for (String path :
        List.of(
            "actions/0/admissionId",
            "bindings/0/provenance/sessionId",
            "bindings/0/provenance/producerAdmissionId",
            "bindings/0/consumers/0/producerAdmissionId",
            "bindings/0/consumers/0/consumerAdmissionId",
            "stepSnapshotHashes",
            "reusedFrom",
            "incremental")) {
      ObjectNode changedPlan = learned(doc);
      put(
          changedPlan,
          path,
          path.contains("/") ? M.valueToTree("different-evidence-id") : C.object());
      construction(
          "57/learned/removed-ids/" + path,
          current(doc),
          configuration(doc),
          changedPlan,
          computation(doc));
    }
    plan = learned(doc);
    expected = computation(doc);
    put(plan, "bindings/0/consumers", M.createArrayNode());
    put(expected, "rows/2/learnedContent/consumedBindings", M.createArrayNode());
    ObjectNode actual =
        construction(
            "57/learned/consumer-deletion", current(doc), configuration(doc), plan, expected);
    assertThat(actual.path("00000000-0000-4000-8000-000000000002"))
        .isEqualTo(
            at(
                ordinary(doc),
                "expectedArtifact/learnedPlan/stepSnapshotHashes/00000000-0000-4000-8000-000000000002"));
    assertThat(actual.path("00000000-0000-4000-8000-000000000003"))
        .isNotEqualTo(
            at(
                ordinary(doc),
                "expectedArtifact/learnedPlan/stepSnapshotHashes/00000000-0000-4000-8000-000000000003"));
  }

  static List<String> leaves(JsonNode value, String prefix) {
    List<String> result = new ArrayList<>();
    if (value.isObject()) {
      value
          .fields()
          .forEachRemaining(e -> result.addAll(leaves(e.getValue(), prefix + "/" + e.getKey())));
    } else if (value.isArray()) {
      for (int i = 0; i < value.size(); i++) {
        result.addAll(leaves(value.get(i), prefix + "/" + i));
      }
    } else {
      result.add(prefix);
    }
    return result;
  }

  record Mutation(String label, String path, JsonNode value) {}
}
