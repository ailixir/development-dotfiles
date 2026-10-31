package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GuidedSourceReferenceValidatorTest {
  final GuidedContracts contracts = new GuidedContracts();
  final AllowedDomains domains = new AllowedDomains(List.of("example.test"));
  final GuidedSourceReferenceValidator validator =
      new GuidedSourceReferenceValidator(contracts, domains);

  ObjectNode session() {
    return (ObjectNode)
        contracts.parse(
            "{\"sessionId\":\"s\",\"scopeHash\":\""
                + "a".repeat(64)
                + "\",\"scope\":{\"sourceRevision\":\"r1\",\"configurationRevision\":\"c1\"},"
                + "\"sourceSteps\":[{\"stepId\":\"step\"}]}");
  }

  ObjectNode candidate(int start, int end) {
    return contracts
        .object()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "r1")
        .put("stepId", "step")
        .put("startUtf16", start)
        .put("endUtf16", end)
        .put("kind", "nonsecretText");
  }

  GuidedSourceReferenceValidator.Sources sources(String text, int end) {
    return new GuidedSourceReferenceValidator.Sources(
        "r1",
        "c1",
        Map.of(
            "step",
            new GuidedSourceReferenceValidator.Source(
                text, List.of(new GuidedSourceReferenceValidator.ClassifiedRegion(0, end)))),
        Map.of());
  }

  @Test
  void slicesExactUnicodeWhitespaceWithinClassifiedRegionWithoutSemanticMapping() {
    var value = validator.resolve(session(), sources("Type  é😀  here", 15), candidate(5, 11));
    assertThat(value.path("value").asText()).isEqualTo(" é😀  ");
    assertThat(value.path("inputId").asText()).isNotBlank();
    assertThat(value.path("provenance")).isEqualTo(candidate(5, 11));
  }

  @Test
  void rejectsRevisionBoundsSurrogateSplitsAndUnclassifiedRegions() {
    var source = sources("a😀z", 3);
    assertThatThrownBy(() -> validator.resolve(session(), source, candidate(1, 2)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> validator.resolve(session(), source, candidate(2, 3)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> validator.resolve(session(), source, candidate(0, 5)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> validator.resolve(session(), source, candidate(3, 4)))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session(), source, candidate(0, 1).put("sourceRevision", "changed")))
        .hasMessage("REVISION_CONFLICT");
    assertThatThrownBy(
            () ->
                validator.resolve(session(), source, candidate(0, 1).put("stepId", "another-step")))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void destinationsRequireAnAllowedDomainAndNoCredentials() {
    for (String destination :
        List.of(
            "https://bad.test/path",
            "https://evilexample.test/",
            "https://example.test.evil.org/",
            "https://user:secret@example.test/path",
            "https://example.test:0/",
            "http://127.0.0.1:4102/",
            "data:text/plain,hi")) {
      var candidate = candidate(0, destination.length()).put("kind", "destination");
      assertThatThrownBy(
              () ->
                  validator.resolve(
                      session(), sources(destination, destination.length()), candidate))
          .hasMessage("ORIGIN_NOT_ALLOWED");
    }
    // The allowed domain and any of its subdomains, http or https, any port, whether or not the
    // test names that exact host.
    for (String destination :
        List.of(
            "https://example.test/a?b=c",
            "https://www.example.test/",
            "http://orders.eu.example.test:8080/x")) {
      assertThat(
              validator
                  .resolve(
                      session(),
                      sources(destination, destination.length()),
                      candidate(0, destination.length()).put("kind", "destination"))
                  .path("value")
                  .asText())
          .isEqualTo(destination);
    }
  }

  @Test
  void anEmptyListRefusesEveryDestination() {
    var closed = new GuidedSourceReferenceValidator(contracts, AllowedDomains.none());
    String destination = "https://example.test/";
    assertThatThrownBy(
            () ->
                closed.resolve(
                    session(),
                    sources(destination, destination.length()),
                    candidate(0, destination.length()).put("kind", "destination")))
        .hasMessage("ORIGIN_NOT_ALLOWED");
  }

  @Test
  void configurationIsScopedAndMayContainIntentionalEmptyAuthoredText() {
    var reference =
        contracts
            .object()
            .put("referenceKind", "configuration")
            .put("configurationRevision", "c1")
            .put("referenceId", "ref")
            .put("stepId", "step")
            .put("kind", "nonsecretText");
    var value =
        new GuidedSourceReferenceValidator.ConfigurationValue(
            "", "step", "nonsecretText", "a".repeat(64), true);
    var source =
        new GuidedSourceReferenceValidator.Sources("r1", "c1", Map.of(), Map.of("ref", value));
    assertThat(validator.resolve(session(), source, reference).path("value").asText()).isEmpty();
    assertThatThrownBy(
            () -> validator.resolve(session().put("scopeHash", "b".repeat(64)), source, reference))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThatThrownBy(
            () -> validator.resolve(session(), source, reference.put("value", "invented")))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void sharedV2NodeAndJavaCanonicalVectorsAndReferenceSchemasAgree() throws Exception {
    var fixtures =
        contracts.parse(
            java.nio.file.Files.readString(
                java.nio.file.Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")));
    for (var vector : fixtures.path("hashVectors")) {
      assertThat(GuidedContracts.canonical(vector.path("value")))
          .isEqualTo(vector.path("canonical").asText());
      assertThat(GuidedContracts.hash(vector.path("value")))
          .isEqualTo(vector.path("sha256").asText());
    }
    var documents = fixtures.path("documents");
    for (var entry :
        Map.of(
                "v3/learned-plan",
                "plan",
                "v3/binding",
                "binding",
                "v3/bridge#/definitions/prepare",
                "prepare",
                "v3/bridge#/definitions/dispatch",
                "dispatch",
                "v3/runner-context",
                "context")
            .entrySet()) {
      contracts.validate(entry.getKey(), documents.path(entry.getValue()));
    }
    ObjectNode fake = documents.path("action").deepCopy();
    fake.withObject("/executionEvidence").put("origin", "https://orders.example.test");
    assertThatThrownBy(() -> contracts.validate("v3/action", fake)).hasMessage("INVALID_CONTRACT");
  }
}
