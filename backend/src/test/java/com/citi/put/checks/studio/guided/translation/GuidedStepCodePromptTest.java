package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.support.TestDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The step-code prompt: contract text, schemas and pins, repair, fallback and the wire size. */
class GuidedStepCodePromptTest {
  static final ObjectMapper JSON = new ObjectMapper();
  static final int CAP = 98304;
  private static final String STEP = "11111111-1111-4111-8111-111111111111";
  private static final String CANARY = "canary-private-value-9f3a";
  private static final GuidedContracts CONTRACTS = new GuidedContracts();
  private static final GuidedPromptAssembler ASSEMBLER =
      new GuidedPromptAssembler(CONTRACTS, TestDomains.FIXTURES);
  private static final PlaywrightReference REFERENCE = PlaywrightReference.load();

  private static String resource(String name) throws IOException {
    try (var in = GuidedStepCodePromptTest.class.getResourceAsStream(name)) {
      assertThat(in).isNotNull();
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  // ---- contract text (AC7) ----

  @Test
  void theStepCodeContractStatesTheInjectedNamesTheKeyFormsAndBothOutcomeRules()
      throws IOException {
    String contract = resource("/studio/guided-step-code-contract.md");
    assertThat(contract.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(10240);
    assertThat(contract)
        .contains(
            "`page`",
            "`context`",
            "`expect`",
            "`inputs`",
            "`secrets`",
            "`vars`",
            "guidance, not a list of what is allowed",
            "inputs['<inputId>']",
            "vars['<bindingId>']",
            "list the bindingId in captures",
            "secrets['ID']",
            "IDs may contain - or .",
            "secrets['LOGIN-PASSWORD']",
            "end the code with an `expect` that checks exactly that outcome",
            "none has the name the step gives",
            "so such a check would pass whatever the page shows",
            "types it key by key",
            "its ref is the target, so write the code for that node and do not ask again",
            "return a clarification instead of code",
            "Never guess a target",
            "`- passwordControl` line is a password field",
            "context.configurationReferences entry of kind secretRef",
            "find the element by its role and the region, heading or label that names it, not by"
                + " the value's own text",
            "write every regex backslash doubled (\\\\b, \\\\d), or prefer exact strings with"
                + " { exact: true }");
    assertThat(contract).doesNotContain("name: /^BK-/");
  }

  @Test
  void theSyntaxRepairFactsNameThePositionAndTheBackslashHint() {
    assertThat(GuidedTranslationService.syntaxFacts(3, 7))
        .contains("does not parse or contains an invalid character at line 3 column 7")
        .contains("write every regex backslash doubled (\\\\b, \\\\d)")
        .hasSizeLessThanOrEqualTo(256);
    assertThat(GuidedTranslationService.syntaxFacts(null, null))
        .doesNotContain(" at line ")
        .contains("regex backslash doubled");
  }

  @Test
  void thePreFenceRepairFactsFollowTheMatchCountTheRunnerReported() {
    assertThat(GuidedTranslationService.preFenceFacts(3))
        .contains("its target matched 3 elements")
        .contains("must resolve to exactly one element")
        .contains("by role, by the region or label that contains it, or by its parent")
        .hasSizeLessThanOrEqualTo(256);
    assertThat(GuidedTranslationService.preFenceFacts(0))
        .contains("matched no element: check the role and name")
        .doesNotContain("narrow");
    assertThat(GuidedTranslationService.preFenceFacts(null))
        .contains("did not resolve to exactly one element")
        .contains("narrow it by role")
        .doesNotContain("matched")
        .hasSizeLessThanOrEqualTo(256);
  }

  @Test
  void theOperationProposalTextIsGoneFromBothContractsAndThePlanRulesStay() throws IOException {
    String plan = resource("/studio/guided-output-contract.md");
    String step = resource("/studio/guided-step-code-contract.md");
    for (String contract : List.of(plan, step)) {
      assertThat(contract)
          .doesNotContain(
              "never code",
              "NEXT_ACTION",
              "VERIFY_STEP",
              "COMPLETE",
              "{kind:\"node\"",
              "selectOption",
              "Predicate \"visible\"",
              "containsText",
              "assertTextMode",
              "Press Enter",
              "focusedSuccessor",
              "operationKind",
              "argumentSlot",
              "intendedSlot",
              "fill.value");
    }
    assertThat(plan).doesNotContain("passwordControl");
    assertThat(plan)
        .contains(
            "zero-based UTF-16 code-unit offsets",
            "<var NAME>",
            "learningWindow",
            "needId",
            "targetIntent",
            "scopeIntent",
            "stepSections",
            "A source question choice meaning");
    assertThat(plan.getBytes(StandardCharsets.UTF_8).length).isLessThan(9000);
  }

  // ---- STEP_CODE request (AC4) ----

  @Test
  void aStepCodeRequestCarriesTheContractTheCoreAndTheSectionsThePlanPicked() throws IOException {
    GuidedModelRequest request =
        stepCodeRequest("- button \"Save\" [e1]", 0, List.of("script", "nope"), null, CAP);
    assertThat(request.kind()).isEqualTo(GuidedModelRequest.Kind.STEP_CODE);
    String contract = resource("/studio/guided-step-code-contract.md").stripTrailing();
    assertThat(request.outputContract())
        .startsWith(contract + "\n\n")
        .isEqualTo(contract + "\n\n" + REFERENCE.select(List.of("script")))
        .contains("locator.fill(", "locator.evaluate(")
        .doesNotContain("page.waitForEvent(", "context.cookies(");
    assertThat(request.projection().document().path("repair").isNull()).isTrue();
    assertThat(request.projection().document().path("observation").asText())
        .isEqualTo("- button \"Save\" [e1]");
    // The model's schema: the two STEP_CODE branches, projected for the provider.
    JsonNode schema = request.responseSchema();
    assertThat(schema.path("anyOf")).hasSize(2);
    assertThat(schema.toString()).contains("\"CODE\"", "\"CLARIFICATION\"", "\"captures\"");
    assertThat(schema.toString())
        .doesNotContain("\"verify\"", "\"const\"", "\"oneOf\"", "\"pattern\"", "\"maxItems\"");
  }

  @Test
  void theRepairInputIsBoundedMaskedAndNeverTruncated() {
    ObjectNode repair =
        JSON.createObjectNode()
            .put("closedCode", "STEP_SYNTAX")
            .put("stage", "SYNTAX")
            .put("line", 2)
            .put("column", 7)
            .put("facts", "Unexpected token near <secret LOGIN-PASSWORD>")
            .put("previousCode", "await a.fill(<secret LOGIN-PASSWORD>);\nawait ;");
    GuidedModelRequest request = stepCodeRequest("- document", 0, List.of(), repair, CAP);
    JsonNode sent = request.projection().document().path("repair");
    assertThat(sent.path("closedCode").asText()).isEqualTo("STEP_SYNTAX");
    assertThat(sent.path("line").asInt()).isEqualTo(2);
    assertThat(sent.toString()).doesNotContain("<secret").contains("Unexpected token near");
    assertThat(sent.path("facts").asText()).hasSize(repair.path("facts").asText().length());

    ObjectNode longFacts = repair.deepCopy().put("facts", "x".repeat(257));
    assertThatThrownBy(() -> stepCodeRequest("- document", 0, List.of(), longFacts, CAP))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    ObjectNode longCode = repair.deepCopy().put("previousCode", "x".repeat(16385));
    assertThatThrownBy(() -> stepCodeRequest("- document", 0, List.of(), longCode, CAP))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void sectionsAreDroppedFromTheEndWhenTheRequestWouldNotFitAndCoreOnlyIsRefused() {
    List<String> four = largestExtended(4);
    String outline = outline(12000);
    int all = ASSEMBLER.wireBytes(stepCodeRequest(outline, 0, four, null, Integer.MAX_VALUE));
    int core = ASSEMBLER.wireBytes(stepCodeRequest(outline, 0, List.of(), null, Integer.MAX_VALUE));
    assertThat(all).isGreaterThan(core);
    // Everything fits: all four sections are carried.
    GuidedModelRequest full = stepCodeRequest(outline, 0, four, null, all);
    assertThat(full.outputContract())
        .isEqualTo(stepCodeRequest(outline, 0, four, null, CAP).outputContract());
    // One byte short of everything: the last section goes, the first stays.
    GuidedModelRequest fewer = stepCodeRequest(outline, 0, four, null, all - 1);
    assertThat(ASSEMBLER.wireBytes(fewer)).isLessThanOrEqualTo(all - 1);
    assertThat(fewer.outputContract())
        .isEqualTo(stepCodeRequest(outline, 0, four.subList(0, 3), null, CAP).outputContract());
    // Only the core fits: no section at all, and the outline is untouched.
    GuidedModelRequest coreOnly = stepCodeRequest(outline, 0, four, null, core);
    assertThat(coreOnly.outputContract())
        .isEqualTo(stepCodeRequest(outline, 0, List.of(), null, CAP).outputContract());
    assertThat(coreOnly.projection().document().path("observation").asText()).isEqualTo(outline);
    // Not even the core fits: refused.
    assertThatThrownBy(() -> stepCodeRequest(outline, 0, four, null, core - 1))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("BUDGET_EXCEEDED");
  }

  @Test
  void onlyAStepCodeCallCanCarrySectionsAndAssembleRefusesIt() {
    var fixture = fixture("- document", 0);
    for (GuidedModelRequest.Kind kind : List.of(GuidedModelRequest.Kind.STEP_CODE)) {
      assertThatThrownBy(
              () ->
                  ASSEMBLER.assemble(
                      "r",
                      1,
                      kind,
                      fixture[0],
                      fixture[1],
                      fixture[2],
                      fixture[3],
                      fixture[4],
                      JSON.createArrayNode(),
                      List.of(),
                      1024))
          .isInstanceOf(IllegalArgumentException.class);
    }
    var production =
        GuidedPromptAssembler.createForProductionFactory(CONTRACTS, TestDomains.FIXTURES);
    assertThat(
            production.preparePure(
                production.preparationCapability(),
                JSON.createObjectNode(),
                "key",
                1,
                GuidedModelRequest.Kind.STEP_CODE,
                1024))
        .isNull();
  }

  @Test
  void aSecretStepYieldsAPromptFromWhichTheSecretIdIsDerivableWithoutTheValue() throws IOException {
    var f = fixture("- textbox \"Password\" [e1]\n", 0);
    ObjectNode manifest = (ObjectNode) f[2].path("manifest");
    ((ObjectNode) manifest.path("sourceSteps").get(0))
        .put("text", "Type <secret LOGIN-PASSWORD> into Password");
    ((com.fasterxml.jackson.databind.node.ArrayNode) manifest.path("configurationReferences"))
        .addObject()
        .put("referenceId", "ref-1")
        .put("stepId", STEP)
        .put("kind", "secretRef")
        .put("referenceName", "LOGIN-PASSWORD");
    GuidedModelRequest request =
        ASSEMBLER.assembleStepCode(
            "r",
            1,
            f[0],
            f[1],
            f[2],
            f[3],
            f[4],
            JSON.createArrayNode(),
            List.of(),
            null,
            CAP,
            1024);
    JsonNode context = request.projection().document();
    // The token is blanked in the step text, as the contract says; the id is only in the reference.
    assertThat(context.path("sourceSteps").get(0).path("text").asText())
        .doesNotContain("LOGIN-PASSWORD", "<secret")
        .startsWith("Type  ")
        .endsWith("into Password");
    JsonNode reference = context.path("configurationReferences").get(0);
    assertThat(reference.path("kind").asText()).isEqualTo("secretRef");
    assertThat(reference.path("stepId").asText()).isEqualTo(STEP);
    assertThat(reference.path("referenceName").asText()).isEqualTo("LOGIN-PASSWORD");
    assertThat(request.outputContract())
        .contains(
            "context.configurationReferences entry of kind secretRef whose stepId is this step",
            "secrets['LOGIN-PASSWORD']");
    // No value of any secret is part of the prompt: only the id.
    assertThat(request.projection().document().toString()).doesNotContain("hunter2");
  }

  // ---- schemas and pins (AC5) ----

  @Test
  void theProviderSchemasExistForThePlanAndTheStepOnlyAndArePinned() {
    ObjectNode pins = ASSEMBLER.schemaProvenance();
    List<String> pinned = new ArrayList<>();
    pins.path("providerSchemaHashes").fieldNames().forEachRemaining(pinned::add);
    assertThat(pinned).containsExactlyInAnyOrder("SOURCE_PLAN", "STEP_CODE");
    for (GuidedModelRequest.Kind kind :
        List.of(GuidedModelRequest.Kind.SOURCE_PLAN, GuidedModelRequest.Kind.STEP_CODE)) {
      JsonNode schema = ASSEMBLER.providerSchema(kind);
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
      assertLocalReferences(schema, schema);
      assertThat(pins.path("providerSchemaHashes").path(kind.name()).asText())
          .isEqualTo(GuidedContracts.hash(schema));
      // Defensive copies: changing a returned schema changes nothing.
      ((ObjectNode) ASSEMBLER.providerSchema(kind)).removeAll();
      assertThat(GuidedContracts.canonical(ASSEMBLER.providerSchema(kind)))
          .isEqualTo(GuidedContracts.canonical(schema));
    }
    assertThat(pins.path("playwrightReferenceHash").asText()).isEqualTo(REFERENCE.referenceHash());
    assertThat(pins.path("stepCodeContractHash").asText()).hasSize(64);
    assertThat(pins.path("strictSchemaHash").asText()).hasSize(64);
    assertThat(ASSEMBLER.schemaProvenance()).isEqualTo(pins);
  }

  @Test
  void thePlanPromptCarriesTheReferenceIndexAndTheObligationShape() throws IOException {
    var fixture = fixture("- document", 0);
    GuidedModelRequest plan =
        ASSEMBLER.assemble(
            "r",
            1,
            GuidedModelRequest.Kind.SOURCE_PLAN,
            fixture[0],
            fixture[1],
            fixture[2],
            fixture[3],
            fixture[4],
            JSON.createArrayNode(),
            List.of(),
            1024);
    assertThat(plan.outputContract())
        .startsWith(resource("/studio/guided-output-contract.md").stripTrailing())
        .contains("Reference section index")
        .endsWith(REFERENCE.index().stripTrailing());
    for (String id : REFERENCE.sectionIds()) {
      assertThat(plan.outputContract()).contains(id + " (");
    }
    ObjectNode obligation = (ObjectNode) plan.projection().document().path("obligations").get(0);
    assertThat(obligation.fieldNames().next()).isEqualTo("obligationId");
    assertThat(obligation.has("operationKind")).isFalse();
    assertThat(obligation.has("predicate")).isFalse();
    assertThat(obligation.path("uses").isArray()).isTrue();
  }

  // ---- wire size and canary (AC8) ----

  @Test
  void wireBytesCountsTheEscapedContentsTheSystemInstructionTheSchemaAndTheAllowance() {
    ObjectNode context = context("- button \"Save\" [e1]\n".repeat(50), 0);
    var request =
        new GuidedModelRequest(
            "synthetic-request",
            1,
            GuidedModelRequest.Kind.SOURCE_PLAN,
            new GuidedModelProjection(context),
            "system \"text\"",
            JSON.createObjectNode().put("type", "object"),
            1024);
    ObjectNode payload =
        JSON.createObjectNode()
            .put("kind", "SOURCE_PLAN")
            .put("requestId", "synthetic-request")
            .put("attempt", 1);
    payload.set("context", context);
    ObjectNode wire =
        JSON.createObjectNode()
            .put("contents", payload.toString())
            .put("systemInstruction", "system \"text\"");
    wire.set("responseJsonSchema", JSON.createObjectNode().put("type", "object"));
    int expected = wire.toString().getBytes(StandardCharsets.UTF_8).length + 2048;
    assertThat(ASSEMBLER.wireBytes(request)).isEqualTo(expected);
    // The quotes and newlines of the outline are escaped twice, so the wire is larger than the raw
    // text: the cap must be checked with this formula, never with string lengths.
    int raw = payload.toString().length() + "system \"text\"".length() + 2048;
    assertThat(ASSEMBLER.wireBytes(request)).isGreaterThan(raw + 100);
  }

  @Test
  void theWorstCaseRequestsFitTheCapMeasuredWithTheSharedFormula() {
    String worst = outline(40000);
    GuidedModelRequest coreOnly = stepCodeRequest(worst, 10000, List.of(), null, CAP);
    int coreOnlyBytes = ASSEMBLER.wireBytes(coreOnly);
    // (i) the guaranteed case: contract + core, the 40,000-byte outline, ~10 KB of other context.
    assertThat(coreOnlyBytes).isLessThanOrEqualTo(CAP);
    // (iii) asking for four sections under the same outline still fits (sections drop if needed).
    GuidedModelRequest asked = stepCodeRequest(worst, 10000, largestExtended(4), null, CAP);
    assertThat(ASSEMBLER.wireBytes(asked)).isLessThanOrEqualTo(CAP);
    // (ii) a typical outline carries all four of the largest sections.
    GuidedModelRequest typical =
        stepCodeRequest(outline(12000), 3000, largestExtended(4), null, CAP);
    for (String id : largestExtended(4)) {
      assertThat(typical.outputContract()).contains("(" + id + ")");
    }
    int typicalBytes = ASSEMBLER.wireBytes(typical);
    assertThat(typicalBytes).isLessThanOrEqualTo(CAP);
    // (iv) the plan prompt with the index and the same maximum context.
    var plan = fixture(worst, 10000);
    GuidedModelRequest planRequest =
        ASSEMBLER.assemble(
            "r",
            1,
            GuidedModelRequest.Kind.SOURCE_PLAN,
            plan[0],
            plan[1],
            plan[2],
            plan[3],
            plan[4],
            JSON.createArrayNode(),
            List.of(),
            1024);
    int planBytes = ASSEMBLER.wireBytes(planRequest);
    assertThat(planBytes).isLessThanOrEqualTo(CAP);
    System.out.println(
        "SC008-E2 wire bytes (cap "
            + CAP
            + "): STEP_CODE core-only worst "
            + coreOnlyBytes
            + ", STEP_CODE asked-4 worst "
            + ASSEMBLER.wireBytes(asked)
            + " (sections kept: "
            + sectionsIn(asked)
            + "), STEP_CODE typical+4 "
            + typicalBytes
            + ", SOURCE_PLAN worst "
            + planBytes);
  }

  @Test
  void noPrivateValueReachesTheAssembledPrompts() throws Exception {
    var fixture = fixture("- button \"Save\" [e1]", 0);
    ((ObjectNode) fixture[0]).put("secretValue", CANARY);
    ((ObjectNode) fixture[1]).put("runtimeCapture", CANARY).put("cookie", CANARY);
    ((ObjectNode) fixture[1].path("observation"))
        .putObject("facts")
        .putObject("e1")
        .put("text", CANARY)
        .put("evidence", CANARY);
    GuidedModelRequest step =
        ASSEMBLER.assembleStepCode(
            "r",
            1,
            fixture[0],
            fixture[1],
            fixture[2],
            fixture[3],
            fixture[4],
            JSON.createArrayNode(),
            List.of("script"),
            null,
            CAP,
            1024);
    GuidedModelRequest plan =
        ASSEMBLER.assemble(
            "r",
            1,
            GuidedModelRequest.Kind.SOURCE_PLAN,
            fixture[0],
            fixture[1],
            fixture[2],
            fixture[3],
            fixture[4],
            JSON.createArrayNode(),
            List.of(),
            1024);
    for (GuidedModelRequest request : List.of(step, plan)) {
      assertThat(request.outputContract()).doesNotContain(CANARY);
      assertThat(request.projection().document().toString()).doesNotContain(CANARY);
      assertThat(request.responseSchema().toString()).doesNotContain(CANARY);
    }
  }

  // ---- fixtures ----

  static GuidedModelRequest stepCodeRequest(
      String outline, int otherBytes, List<String> sections, JsonNode repair, int maxWire) {
    var f = fixture(outline, otherBytes);
    return ASSEMBLER.assembleStepCode(
        "synthetic-request",
        1,
        f[0],
        f[1],
        f[2],
        f[3],
        f[4],
        JSON.createArrayNode(),
        sections,
        repair,
        maxWire,
        1024);
  }

  /** session, progress, state, safeInputs, remaining. */
  static JsonNode[] fixture(String outline, int otherBytes) {
    ObjectNode session =
        JSON.createObjectNode()
            .put("sessionId", "synthetic-session")
            .put("scopeHash", "a".repeat(64));
    session.putObject("scope").put("sourceRevision", "1").put("configurationRevision", "1");
    session.putArray("sourceSteps").addObject().put("stepId", STEP);
    ObjectNode manifest = JSON.createObjectNode();
    manifest.putArray("sourceSteps").addObject().put("stepId", STEP).put("text", "Click Save");
    manifest.putArray("configurationReferences");
    var entries = manifest.putArray("authoringContext");
    for (int left = otherBytes; left > 0; left -= 3300) {
      entries.addObject().put("stepId", STEP).put("text", "n".repeat(Math.min(3300, left)));
    }
    ObjectNode state = JSON.createObjectNode();
    state.set("manifest", manifest);
    ObjectNode progress =
        JSON.createObjectNode()
            .put("stepIndex", 0)
            .put("translationOrdinal", 0)
            .put("contextRevision", 0);
    progress.putObject("observation").put("outline", outline);
    var inputs = JSON.createArrayNode();
    inputs
        .addObject()
        .put("inputId", "opaque-input")
        .put("sourceStepId", STEP)
        .put("kind", "nonsecretText");
    var remaining = JSON.createArrayNode();
    ObjectNode obligation = remaining.addObject();
    obligation
        .put("obligationId", "o-1")
        .put("stepId", STEP)
        .put("occurrence", 0)
        .put("targetIntent", "Save");
    obligation.putNull("scopeIntent").putNull("referenceIndex").putNull("needId");
    obligation.putArray("uses");
    return new JsonNode[] {session, progress, state, inputs, remaining};
  }

  static ObjectNode context(String outline, int otherBytes) {
    var f = fixture(outline, otherBytes);
    return ASSEMBLER.buildPositiveContext(
        GuidedModelRequest.Kind.SOURCE_PLAN,
        f[0],
        f[1],
        f[2],
        f[3],
        f[4],
        JSON.createArrayNode(),
        List.of());
  }

  /**
   * Lines shaped like the real outline: two quotes and a newline each, so escaping is realistic.
   */
  static String outline(int bytes) {
    StringBuilder text = new StringBuilder();
    for (int i = 0; text.length() < bytes; i++) {
      text.append("- button \"Item ").append(i).append("\" [e").append(i % 900 + 1).append("]\n");
    }
    return text.substring(0, bytes);
  }

  private static List<String> largestExtended(int count) {
    return REFERENCE.sectionIds().stream()
        .filter(id -> !REFERENCE.isCore(id))
        .sorted((a, b) -> Integer.compare(REFERENCE.sectionBytes(b), REFERENCE.sectionBytes(a)))
        .limit(count)
        .toList();
  }

  private static List<String> sectionsIn(GuidedModelRequest request) {
    return REFERENCE.sectionIds().stream()
        .filter(id -> !REFERENCE.isCore(id) && request.outputContract().contains("(" + id + ")"))
        .toList();
  }

  private static void assertLocalReferences(JsonNode root, JsonNode node) {
    if (node.isObject()) {
      node.fields()
          .forEachRemaining(
              entry -> {
                if (entry.getKey().equals("$ref")) {
                  String ref = entry.getValue().asText();
                  assertThat(ref).startsWith("#/$defs/");
                  assertThat(root.at(ref.substring(1)).isMissingNode()).as(ref).isFalse();
                } else {
                  assertLocalReferences(root, entry.getValue());
                }
              });
    } else if (node.isArray()) {
      node.forEach(child -> assertLocalReferences(root, child));
    }
  }
}
