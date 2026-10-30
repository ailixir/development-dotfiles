package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * The first URL a test authors, in step order, decides where learning starts (STUDIO-FLEX-001): a
 * quoted or bare URL in a step, a sentence-final URL, or a non-secret variable the step references.
 */
class AuthoredUrlsTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static ObjectNode authoring(String... texts) {
    ObjectNode authoring = C.object().put("authoringSchemaVersion", 2);
    ArrayNode steps = authoring.putArray("steps");
    int index = 0;
    for (String text : texts) {
      steps
          .addObject()
          .put("id", String.format("00000000-0000-4000-8000-%012d", ++index))
          .put("text", text);
    }
    return authoring;
  }

  private static ArrayNode variables(String... nameKindValue) {
    ArrayNode variables = C.object().arrayNode();
    for (int i = 0; i < nameKindValue.length; i += 3) {
      variables
          .addObject()
          .put("name", nameKindValue[i])
          .put("kind", nameKindValue[i + 1])
          .put("value", nameKindValue[i + 2]);
    }
    return variables;
  }

  @Test
  void theFirstUrlInStepOrderWins() {
    assertThat(
            AuthoredUrls.first(
                authoring(
                    "Click Sign in",
                    "Go to \"https://practicetestautomation.com/practice-test-login/\"",
                    "Open https://example.com/start and check the title"),
                variables()))
        .isEqualTo("https://practicetestautomation.com/practice-test-login/");
  }

  @Test
  void aBareUrlAndAQuotedUrlAreBothFound() {
    assertThat(
            AuthoredUrls.first(authoring("Open https://example.com/start and check"), variables()))
        .isEqualTo("https://example.com/start");
  }

  @Test
  void aReferencedNonSecretUrlVariableIsTheFirstUrlAtItsPosition() {
    assertThat(
            AuthoredUrls.first(
                authoring("Go to the <var base>", "Go to \"https://later.example.com/\""),
                variables(
                    "base",
                    "plain",
                    "https://shop.example.com/entry",
                    "label",
                    "plain",
                    "not a url")))
        .isEqualTo("https://shop.example.com/entry");
  }

  @Test
  void aSecretVariableNeverNamesAUrlAndAnUnreferencedUrlVariableIsTheLastResort() {
    assertThat(
            AuthoredUrls.first(
                authoring("Log in", "Go to the <secret endpoint>"),
                variables("endpoint", "secretRef", "https://secret.example.com")))
        .isNull();
    assertThat(
            AuthoredUrls.first(
                authoring("Log in", "Go to the <secret endpoint>"),
                variables(
                    "endpoint",
                    "secretRef",
                    "https://secret.example.com",
                    "unused",
                    "plain",
                    "https://unused.example.com")))
        .isEqualTo("https://unused.example.com");
    assertThat(
            AuthoredUrls.first(
                authoring("Log in", "Open https://step.example.com/"),
                variables("unused", "plain", "https://unused.example.com")))
        .as("a URL a step names comes first")
        .isEqualTo("https://step.example.com/");
  }

  @Test
  void aTestThatNamesNoUrlHasNone() {
    assertThat(
            AuthoredUrls.first(authoring("Click Sign in", "Check the title is Home"), variables()))
        .isNull();
    assertThat(AuthoredUrls.first(C.object().put("authoringSchemaVersion", 2), variables()))
        .isNull();
  }

  @Test
  void aUrlTheAllowListWouldRefuseIsStillTheFirstUrl() {
    assertThat(
            AuthoredUrls.first(
                authoring("Go to \"https://user:secret@example.com/\""), variables()))
        .isEqualTo("https://user:secret@example.com/");
  }

  @Test
  void trailingSentencePunctuationDoesNotHideTheUrl() {
    for (String text :
        new String[] {
          "Open https://example.com/login.",
          "Open https://example.com/login,",
          "Open https://example.com/login;",
          "Open https://example.com/login!",
          "Open https://example.com/login?",
          "Open (https://example.com/login)",
          "Open https://example.com/login.)",
        }) {
      assertThat(AuthoredUrls.first(authoring(text), variables()))
          .as(text)
          .startsWith("https://example.com/login")
          .doesNotEndWith(".")
          .doesNotEndWith(")");
    }
    assertThat(AuthoredUrls.first(authoring("Go to \"https://example.com/login\"."), variables()))
        .isEqualTo("https://example.com/login");
    assertThat(
            AuthoredUrls.first(
                authoring("Go to \"https://example.com/login\", then sign in"), variables()))
        .isEqualTo("https://example.com/login");
  }

  @Test
  void anAmbiguousSpanIsNotAUrl() {
    assertThat(AuthoredUrls.first(authoring("Go to \"https://example.com/'x\""), variables()))
        .isNull();
    assertThat(
            AuthoredUrls.first(
                authoring("Go to https://example.com/a,https://other.com/"), variables()))
        .isNull();
  }

  @Test
  void thePersistedDocumentsAreNotMutated() {
    ObjectNode authoring = authoring("Go to \"https://example.com/\"");
    ArrayNode variables = variables("base", "plain", "https://other.example.com/");
    JsonNode before = authoring.deepCopy(), variablesBefore = variables.deepCopy();
    AuthoredUrls.first(authoring, variables);
    assertThat(authoring).isEqualTo(before);
    assertThat(variables).isEqualTo(variablesBefore);
  }
}
