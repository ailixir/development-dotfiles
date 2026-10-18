package com.citi.put.checks.studio.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.LiteralInput;
import com.citi.put.checks.studio.dto.ResolvedInput;
import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.SecretReference;
import com.citi.put.checks.studio.dto.StudioAuthoringValidation;
import com.citi.put.checks.studio.dto.StudioAuthoringValidation.Category;
import com.citi.put.checks.studio.dto.StudioAuthoringValidation.InvalidAuthoringException;
import com.citi.put.checks.studio.dto.VariableReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Backend parity gate over the authoring fixtures shared with the frontend. */
class StudioContextContractTest {

  private static final Path[] FIXTURE_ROOTS = {
    Path.of("docs/specs/studio/examples"), Path.of("../docs/specs/studio/examples")
  };
  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
  private static ValidatorFactory validatorFactory;
  private static Validator validator;

  @BeforeAll
  static void createValidator() {
    validatorFactory = Validation.buildDefaultValidatorFactory();
    validator = validatorFactory.getValidator();
  }

  @AfterAll
  static void closeValidator() {
    validatorFactory.close();
  }

  @Test
  void everyValidSharedFixtureDeserializesAndRetainsIdentityAndExactValues() throws IOException {
    JsonNode cases = fixture("context-authoring-valid.json").path("cases");

    // The v1 string-step body that was the shared case legacy-empty-context stays a refusal check.
    assertThatThrownBy(() -> StudioAuthoringValidation.read(MAPPER, validator, legacyBody()))
        .isInstanceOf(InvalidAuthoringException.class)
        .extracting(error -> ((InvalidAuthoringException) error).categories())
        .isEqualTo(List.of(Category.INVALID_AUTHORING));

    for (JsonNode fixtureCase : cases) {
      AuthoringV2Request decoded =
          StudioAuthoringValidation.read(MAPPER, validator, fixtureCase.path("request"));
      assertThat(decoded).isInstanceOf(AuthoringV2Request.class);
      AuthoringV2Request request = (AuthoringV2Request) decoded;
      assertThat(request.authoringSchemaVersion()).isEqualTo(2);
      assertThat(request.steps().stream().map(AuthoringStep::id))
          .as(fixtureCase.path("name").textValue())
          .doesNotHaveDuplicates();
    }
  }

  @Test
  void exactLiteralFixturePreservesEmptyUnicodeQuotesBackslashesNewlinesAndWhitespace()
      throws IOException {
    JsonNode fixtureCase = validCase("exact-literals");
    AuthoringV2Request request =
        (AuthoringV2Request)
            StudioAuthoringValidation.read(MAPPER, validator, fixtureCase.path("request"));

    List<String> literals =
        request.steps().stream()
            .flatMap(step -> step.context().entries().stream())
            .filter(LiteralInput.class::isInstance)
            .map(LiteralInput.class::cast)
            .map(LiteralInput::value)
            .toList();
    assertThat(literals)
        .containsExactly("", "  Café 東京 \"quoted\" C:\\tmp\\file\nsecond line !@#$%^&*()  ");

    AuthoringV2Request roundTripped =
        (AuthoringV2Request)
            StudioAuthoringValidation.read(MAPPER, validator, MAPPER.valueToTree(request));
    assertThat(
            roundTripped.steps().stream()
                .flatMap(step -> step.context().entries().stream())
                .filter(LiteralInput.class::isInstance)
                .map(LiteralInput.class::cast)
                .map(LiteralInput::value))
        .containsExactlyElementsOf(literals);

    List<String> references =
        request.steps().stream()
            .flatMap(step -> step.context().entries().stream())
            .filter(VariableReference.class::isInstance)
            .map(VariableReference.class::cast)
            .map(VariableReference::referenceId)
            .toList();
    assertThat(references).containsExactly("CUSTOMER_QUERY");
  }

  @Test
  void globalAndStepContextRetainTypedValuesAndSuppliedProvenance() throws IOException {
    AuthoringV2Request request =
        (AuthoringV2Request)
            StudioAuthoringValidation.read(
                MAPPER, validator, validCase("global-and-step-context").path("request"));

    assertThat(request.globalContext().entries()).hasSize(3);
    assertThat(request.globalContext().evidenceReferences())
        .singleElement()
        .satisfies(evidence -> assertThat(evidence.source().name()).isEqualTo("SUPPLIED"));
    assertThat(request.steps().get(0).context().entries().stream().map(Object::getClass))
        .contains(LiteralInput.class);
    assertThat(request.steps().get(1).context().entries().stream().map(Object::getClass))
        .extracting(Class::getSimpleName)
        .containsExactly("SecretReference");
  }

  @Test
  void identityTransitionFixturesExpressReorderCopyAndDeleteRules() throws IOException {
    JsonNode reorder = validCase("reorder-retains-identities").path("transition");
    assertThat(textValues(reorder.path("afterStepIds")))
        .containsExactlyElementsOf(reversed(textValues(reorder.path("beforeStepIds"))));

    JsonNode copy = validCase("copy-creates-fresh-identity").path("transition");
    assertThat(copy.path("sourceStepId").textValue())
        .isNotEqualTo(copy.path("copiedStepId").textValue());

    JsonNode delete = validCase("delete-removes-only-deleted-metadata").path("transition");
    assertThat(textValues(delete.path("retainedStepIds")))
        .doesNotContain(delete.path("deletedStepId").textValue());
  }

  @Test
  void everyInvalidSharedFixtureIsRejectedWithItsStableCategory() throws IOException {
    for (JsonNode fixtureCase : invalidCases()) {
      Set<Category> expected =
          textValues(fixtureCase.path("expectedCategories")).stream()
              .map(Category::valueOf)
              .collect(Collectors.toSet());

      assertThatThrownBy(
              () -> StudioAuthoringValidation.read(MAPPER, validator, fixtureCase.path("request")))
          .as(fixtureCase.path("name").textValue())
          .isInstanceOf(InvalidAuthoringException.class)
          .satisfies(
              exception ->
                  assertThat(((InvalidAuthoringException) exception).categories())
                      .containsExactlyInAnyOrderElementsOf(expected));
    }
  }

  @Test
  void resolvedReviewInputsDistinguishExactLiteralsSafeReferencesAndNoInput() throws IOException {
    ResolvedInput literal =
        MAPPER.readValue("{\"kind\":\"literal\",\"value\":\"  東京\\n  \"}", ResolvedInput.class);
    ResolvedInput variable =
        MAPPER.readValue(
            "{\"kind\":\"variableRef\",\"referenceId\":\"CUSTOMER_QUERY\"}", ResolvedInput.class);
    ResolvedInput secret =
        MAPPER.readValue(
            "{\"kind\":\"secretRef\",\"referenceId\":\"vault://studio/password\"}",
            ResolvedInput.class);

    assertThat(literal)
        .isEqualTo(new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, "  東京\n  "));
    assertThat(variable)
        .isEqualTo(
            new ResolvedReferenceInput(ResolvedReferenceInput.Kind.VARIABLE_REF, "CUSTOMER_QUERY"));
    assertThat(secret)
        .isEqualTo(
            new ResolvedReferenceInput(
                ResolvedReferenceInput.Kind.SECRET_REF, "vault://studio/password"));
    assertThat(MAPPER.readTree("{\"input\":null}").path("input").isNull()).isTrue();
  }

  @Test
  void loginFlowKeepsSecretOpaqueAndEvidenceBoundToEachPageState() throws IOException {
    AuthoringV2Request request =
        (AuthoringV2Request)
            StudioAuthoringValidation.read(
                MAPPER, validator, validCase("login-then-protected-navigation").path("request"));

    assertThat(request.steps()).hasSize(6);
    assertThat(request.steps().stream().map(AuthoringStep::id)).doesNotHaveDuplicates();

    AuthoringStep passwordStep = request.steps().get(1);
    assertThat(passwordStep.context().entries())
        .filteredOn(SecretReference.class::isInstance)
        .singleElement()
        .isEqualTo(new SecretReference("vault://studio/protected-page-password"));
    assertThat(passwordStep.context().entries()).noneMatch(LiteralInput.class::isInstance);

    assertThat(
            request.steps().stream()
                .flatMap(
                    step ->
                        step.context().evidenceReferences().stream()
                            .peek(evidence -> assertThat(evidence.stepId()).isEqualTo(step.id())))
                .map(evidence -> evidence.route() + "|" + evidence.state()))
        .contains(
            "/login|anonymous-login",
            "/login|credentials-entered",
            "/home|authenticated-home",
            "/reports/protected|authenticated-protected");
  }

  /** The {@code legacy} member of the former shared case {@code legacy-empty-context}, verbatim. */
  private static JsonNode legacyBody() {
    var body = MAPPER.createObjectNode();
    body.putArray("steps").add("  Open Caf\u00e9 \u2615  ").add("Type \"A\\B\"\nnext line");
    return body;
  }

  /**
   * The shared invalid cases plus {@code mixed-legacy-v2-steps}, a case of {@code
   * context-authoring-invalid.json} until the single-path cleanup, kept inline and verbatim.
   */
  private static List<JsonNode> invalidCases() throws IOException {
    List<JsonNode> cases = new ArrayList<>();
    fixture("context-authoring-invalid.json").path("cases").forEach(cases::add);
    var mixed = MAPPER.createObjectNode().put("name", "mixed-legacy-v2-steps");
    var request = mixed.putObject("request").put("authoringSchemaVersion", 2);
    var steps = request.putArray("steps");
    steps.add("Legacy string");
    steps.addObject().put("id", "00000000-0000-4000-8000-000000000062").put("text", "V2 object");
    mixed.putArray("expectedCategories").add("MIXED_STEP_SHAPES");
    cases.add(mixed);
    return cases;
  }

  private static JsonNode fixture(String name) throws IOException {
    for (Path root : FIXTURE_ROOTS) {
      Path fixture = root.resolve(name).normalize();
      if (Files.isRegularFile(fixture)) {
        try (InputStream input = Files.newInputStream(fixture)) {
          return MAPPER.readTree(input);
        }
      }
    }
    throw new IOException("Shared fixture not found: " + name);
  }

  private static JsonNode validCase(String name) throws IOException {
    return StreamSupport.stream(
            fixture("context-authoring-valid.json").path("cases").spliterator(), false)
        .filter(candidate -> name.equals(candidate.path("name").textValue()))
        .findFirst()
        .orElseThrow();
  }

  private static List<String> textValues(JsonNode array) {
    List<String> values = new ArrayList<>();
    array.forEach(value -> values.add(value.textValue()));
    return values;
  }

  private static List<String> reversed(List<String> values) {
    List<String> copy = new ArrayList<>(values);
    java.util.Collections.reverse(copy);
    return copy;
  }
}
