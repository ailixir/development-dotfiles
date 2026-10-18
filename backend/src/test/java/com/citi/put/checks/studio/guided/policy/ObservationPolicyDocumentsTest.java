package com.citi.put.checks.studio.guided.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/** STUDIO-OBS-014 AC-1/AC-5/AC-6 (AR-2 f, h): the stored governed policy document. */
class ObservationPolicyDocumentsTest {

  private static final GuidedContracts C = new GuidedContracts();
  private static final List<String> BASELINE = List.of("delete", "send money");

  @Test
  void anOmittedStanceAndVocabularyAreMaterializedServerSide() {
    ObjectNode stored = ObservationPolicyDocuments.materialize(C, minimal(), BASELINE);

    assertThat(stored.path("sideEffectStance").asText()).isEqualTo("CLARIFY_FIRST");
    assertThat(stored.path("destructiveVocabulary").toString())
        .isEqualTo("[\"delete\",\"send money\"]");
    assertThat(stored.path("allowedOrigins").toString())
        .isEqualTo("[\"https://app.example.test\"]");
  }

  @Test
  void anExplicitStanceAndVocabularyAreKept() {
    ObjectNode submitted = minimal().put("sideEffectStance", "ALLOW");
    submitted.putArray("destructiveVocabulary").add("purge");

    ObjectNode stored = ObservationPolicyDocuments.materialize(C, submitted, BASELINE);

    assertThat(stored.path("sideEffectStance").asText()).isEqualTo("ALLOW");
    assertThat(stored.path("destructiveVocabulary").toString()).isEqualTo("[\"purge\"]");
  }

  @Test
  void theObservationHashCoversOnlyTheApplicationPolicyAndTheDocumentHashCoversEverything() {
    ObjectNode allow =
        ObservationPolicyDocuments.materialize(
            C, minimal().put("sideEffectStance", "ALLOW"), BASELINE);
    ObjectNode deny =
        ObservationPolicyDocuments.materialize(
            C, minimal().put("sideEffectStance", "DENY"), BASELINE);

    assertThat(ObservationPolicyDocuments.observationPolicyHash(allow))
        .isEqualTo(GuidedContracts.hash(allow.path("applicationPolicy")))
        .isEqualTo(ObservationPolicyDocuments.observationPolicyHash(deny));
    assertThat(ObservationPolicyDocuments.documentHash(allow))
        .isNotEqualTo(ObservationPolicyDocuments.documentHash(deny));
  }

  @Test
  void unknownFieldsBadOriginsStancesAndVocabulariesAreInvalidPolicy() {
    refused(minimal().put("extra", true));
    ObjectNode badOrigin = minimal();
    badOrigin.putArray("allowedOrigins").add("https://app.example.test/path");
    refused(badOrigin);
    ObjectNode duplicate = minimal();
    duplicate.putArray("allowedOrigins").add("https://a.test").add("https://a.test");
    refused(duplicate);
    refused(minimal().put("sideEffectStance", "MAYBE"));
    ObjectNode upper = minimal();
    upper.putArray("destructiveVocabulary").add("Delete");
    refused(upper);
    ObjectNode empty = minimal();
    empty.putArray("destructiveVocabulary");
    refused(empty);
    ObjectNode app = minimal();
    app.withObject("/applicationPolicy").put("unknown", 1);
    refused(app);
  }

  @Test
  void theStoredFormIsNormalizedSoOnePolicyHasOneHash() {
    ObjectNode a = minimal();
    a.putArray("allowedOrigins").add("https://b.test").add("https://a.test");
    a.putArray("destructiveVocabulary").add("pay").add("delete");
    grants(a, "z-rule", "https://b.test", "email", "text");
    grants(a, "a-rule", "https://a.test", "search");
    ObjectNode b = minimal();
    b.putArray("allowedOrigins").add("https://a.test").add("https://b.test");
    b.putArray("destructiveVocabulary").add("delete").add("pay");
    grants(b, "a-rule", "https://a.test", "search");
    grants(b, "z-rule", "https://b.test", "text", "email");

    ObjectNode storedA = ObservationPolicyDocuments.materialize(C, a, BASELINE);
    ObjectNode storedB = ObservationPolicyDocuments.materialize(C, b, BASELINE);

    assertThat(storedA).isEqualTo(storedB);
    assertThat(ObservationPolicyDocuments.documentHash(storedA))
        .isEqualTo(ObservationPolicyDocuments.documentHash(storedB));
    assertThat(storedA.path("allowedOrigins").toString())
        .isEqualTo("[\"https://a.test\",\"https://b.test\"]");
    assertThat(storedA.at("/applicationPolicy/readGrants/1/controlValue/types").toString())
        .isEqualTo("[\"text\",\"email\"]");
    assertThat(storedA.path("schemaVersion").asInt()).isEqualTo(3);
  }

  @Test
  void grantSemanticsAreInvalidPolicy() {
    ObjectNode duplicate = minimal();
    grants(duplicate, "same", "https://app.example.test", "text");
    grants(duplicate, "same", "https://app.example.test", "email");
    refused(duplicate);
    ObjectNode foreign = minimal();
    grants(foreign, "rule", "https://other.example.test", "text");
    refused(foreign);
    ObjectNode noDiscovery = minimal();
    noDiscovery.withObject("/applicationPolicy").put("allowStructuralDiscovery", false);
    refused(noDiscovery);
    ObjectNode noGrants = minimal();
    noGrants.withObject("/applicationPolicy").remove("readGrants");
    refused(noGrants);
    ObjectNode noVersion = minimal();
    noVersion.remove("schemaVersion");
    refused(noVersion);
    ObjectNode eleven = minimal();
    var origins = eleven.putArray("allowedOrigins");
    for (int i = 0; i < 11; i++) {
      origins.add("https://o" + i + ".test");
    }
    refused(eleven);
    ObjectNode spaced = minimal();
    spaced.putArray("destructiveVocabulary").add("send  money");
    refused(spaced);
  }

  private static void grants(ObjectNode document, String ruleId, String origin, String... types) {
    ObjectNode grant =
        document
            .withObject("/applicationPolicy")
            .withArray("readGrants")
            .addObject()
            .put("policyRuleId", ruleId)
            .put("origin", origin);
    grant.putObject("region").put("kind", "application");
    var list =
        grant
            .putObject("controlValue")
            .put("classification", "nonsecretApproved")
            .putArray("types");
    for (String type : types) {
      list.add(type);
    }
  }

  @Test
  void theConfiguredDefaultVocabularyIsValidatedAtStartUp() {
    assertThatThrownBy(() -> new GuidedPolicyProperties(List.of(), List.of()))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new GuidedPolicyProperties(List.of(), List.of("Pay")))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(new GuidedPolicyProperties(null, BASELINE).approverGroups()).isEmpty();
  }

  private static void refused(ObjectNode submitted) {
    assertThatThrownBy(() -> ObservationPolicyDocuments.materialize(C, submitted, BASELINE))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo("INVALID_POLICY");
  }

  private static ObjectNode minimal() {
    ObjectNode document = C.object().put("schemaVersion", 3);
    document.putArray("allowedOrigins").add("https://app.example.test");
    document
        .putObject("applicationPolicy")
        .put("policyRuleId", "app")
        .put("allowStructuralDiscovery", true)
        .putArray("readGrants");
    return document;
  }
}
