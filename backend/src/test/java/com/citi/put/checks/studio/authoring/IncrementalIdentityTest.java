package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class IncrementalIdentityTest {
  private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

  @Test
  void opaqueAliasRequiresExactDeclaredName() throws Exception {
    var source =
        mapper.readValue(
            """
        {"authoringSchemaVersion":2,"steps":[{"id":"00000000-0000-4000-8000-000000000001",
        "text":"Fill password","context":{"entries":[{"kind":"secretRef","referenceId":"vault://studio/password"}]}}]}
        """,
            AuthoringV2Request.class);
    var identity =
        IncrementalAuthoringIdentity.resolve(
            source, List.of(StudioVariable.secretRef("vault://studio/password", "LOGIN_PASSWORD")));
    assertThat(identity.references().path("authoredDeclarations").get(0).path("secretId").asText())
        .isEqualTo("LOGIN_PASSWORD");
    assertThatThrownBy(
            () ->
                IncrementalAuthoringIdentity.resolve(
                    source, List.of(StudioVariable.secretRef("password", "LOGIN_PASSWORD"))))
        .extracting(error -> ((GuidedSessionException) error).messageCode())
        .isEqualTo("AUTHORING_REFERENCE_MISSING");
  }

  @Test
  void absentPlainValueIsMissingButEmptyAndWhitespaceAreExactValues() throws Exception {
    var source =
        mapper.readValue(
            "{\"authoringSchemaVersion\":2,\"steps\":[{\"id\":\"00000000-0000-4000-8000-000000000001\","
                + "\"text\":\"Type <var ACCOUNT>\"}]}",
            AuthoringV2Request.class);
    assertThatThrownBy(
            () ->
                IncrementalAuthoringIdentity.resolve(
                    source, List.of(StudioVariable.plain("ACCOUNT", null))))
        .extracting(error -> ((GuidedSessionException) error).messageCode())
        .isEqualTo("AUTHORING_REFERENCE_MISSING");
    var empty =
        IncrementalAuthoringIdentity.resolve(source, List.of(StudioVariable.plain("ACCOUNT", "")));
    var whitespace =
        IncrementalAuthoringIdentity.resolve(source, List.of(StudioVariable.plain("ACCOUNT", " ")));
    assertThat(empty.inputs().nonsecretReferencedValues()).hasSize(1);
    assertThat(whitespace.inputs()).isNotEqualTo(empty.inputs());
  }

  @Test
  void duplicateNamesAndPlainSecretIdCollisionsAreAmbiguous() throws Exception {
    var source =
        mapper.readValue("{\"authoringSchemaVersion\":2,\"steps\":[]}", AuthoringV2Request.class);
    for (var variables :
        List.of(
            List.of(StudioVariable.plain("A", "1"), StudioVariable.plain("A", "2")),
            List.of(
                StudioVariable.plain("LOGIN_PASSWORD", "x"),
                StudioVariable.secretRef("alias", "LOGIN_PASSWORD")))) {
      assertThatThrownBy(() -> IncrementalAuthoringIdentity.resolve(source, variables))
          .extracting(error -> ((GuidedSessionException) error).messageCode())
          .isEqualTo("AUTHORING_REFERENCE_AMBIGUOUS");
    }
  }
}
