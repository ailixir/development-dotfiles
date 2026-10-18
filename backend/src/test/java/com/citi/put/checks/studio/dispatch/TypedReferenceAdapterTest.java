package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Story 10.17 AC-1, AC-10 — the reference type survives from the revision to the wire, and an
 * unreadable declaration is terminal rather than empty.
 *
 * <p>Story 10.8 already separates {@code plain} from {@code secretRef} when it writes {@code
 * {"variables": [...], "secrets": [...]}} onto the revision. The reader below it flattened both
 * arrays into one list, so by the time anything downstream could act on a reference, nothing knew
 * which of them was a secret — and its {@code orElse(List.of())} fallback turned an unreadable
 * document into a run with no references at all, which for a login test is a browser opening a real
 * application with an empty password field.
 */
class TypedReferenceAdapterTest {

  private final ObjectMapper mapper = new ObjectMapper();

  /** The single stored shape (V21 {@code studio_015_declarations}) around the given sets. */
  private static String revision(String sets) {
    return "{" + sets + ",\"authoringIdentityVersion\":1,\"authoredDeclarations\":[]}";
  }

  @Test
  void readsTheTwoSetsSeparatelyAndInDeclarationOrder() {
    ReferenceDeclarations declared =
        ExecutionReferences.declared(
            mapper,
            revision(
                "\"variables\":[\"REGION\",\"TENANT\"],\"secrets\":[\"LOGIN_PW\",\"API_KEY\"]"));

    // Exactly, not "contains": a mutation that appended both to one list would still contain each.
    assertThat(declared.variables()).containsExactly("REGION", "TENANT");
    assertThat(declared.secrets()).containsExactly("LOGIN_PW", "API_KEY");
  }

  @Test
  void aSwapIsVisibleBecauseTheTwoSetsAreComparedSeparately() {
    ReferenceDeclarations declared =
        ExecutionReferences.declared(
            mapper, revision("\"variables\":[\"REGION\"],\"secrets\":[\"LOGIN_PW\"]"));

    assertThat(declared.variables()).containsExactly("REGION").doesNotContain("LOGIN_PW");
    assertThat(declared.secrets()).containsExactly("LOGIN_PW").doesNotContain("REGION");
  }

  @Test
  void namesACrossedDeclarationSoNeitherSideHasToNoticeItAlone() {
    assertThat(
            ExecutionReferences.declared(
                    mapper, revision("\"variables\":[\"PW\",\"REGION\"],\"secrets\":[\"PW\"]"))
                .crossedNames())
        .containsExactly("PW");
  }

  @Test
  void anEmptyDeclarationIsReadableAndIsNotTheSameThingAsAnUnreadableOne() {
    ReferenceDeclarations declared =
        ExecutionReferences.declared(mapper, revision("\"variables\":[],\"secrets\":[]"));

    assertThat(declared.isEmpty()).isTrue();
    assertThat(declared).isEqualTo(ReferenceDeclarations.NONE);
  }

  /**
   * STUDIO-OBS-015: V21 makes every revision carry the frozen authoring identity next to the two
   * sets (contract {@code RevisionReferences}). That exact shape is the only readable one: partial
   * or variant identity shapes, and the pre-015 two-key shape, are terminal (single path, no
   * compatibility read).
   */
  @Test
  void theGuidedPublicationIdentityShapeIsReadableAndItsVariantsAreTerminal() {
    ReferenceDeclarations declared =
        ExecutionReferences.declared(
            mapper,
            "{\"variables\":[\"REGION\"],\"secrets\":[\"LOGIN_PW\"],\"authoringIdentityVersion\":1,"
                + "\"authoredDeclarations\":[{\"referenceId\":\"LOGIN_PW\",\"kind\":\"secretRef\","
                + "\"secretId\":\"LOGIN_PW\"}]}");
    assertThat(declared.variables()).containsExactly("REGION");
    assertThat(declared.secrets()).containsExactly("LOGIN_PW");

    List<String> unreadable =
        List.of(
            "{\"variables\":[],\"secrets\":[],\"authoringIdentityVersion\":1}",
            "{\"variables\":[],\"secrets\":[],\"authoredDeclarations\":[]}",
            "{\"variables\":[],\"secrets\":[],\"authoringIdentityVersion\":2,"
                + "\"authoredDeclarations\":[]}",
            "{\"variables\":[],\"secrets\":[],\"authoringIdentityVersion\":\"1\","
                + "\"authoredDeclarations\":[]}",
            "{\"variables\":[],\"secrets\":[],\"authoringIdentityVersion\":1,"
                + "\"authoredDeclarations\":{}}",
            "{\"variables\":[],\"secrets\":[],\"authoringIdentityVersion\":1,"
                + "\"authoredDeclarations\":[],\"extra\":[]}",
            "{\"secrets\":[],\"authoringIdentityVersion\":1,\"authoredDeclarations\":[]}",
            "{\"variables\":[],\"secrets\":[]}",
            "{\"variables\":[\"REGION\"],\"secrets\":[\"LOGIN_PW\"]}");
    for (String document : unreadable) {
      assertThatThrownBy(() -> ExecutionReferences.declared(mapper, document))
          .as("document %s must be terminal", document)
          .isInstanceOf(ExecutionReferences.UnreadableReferenceDeclarationException.class);
    }
  }

  /**
   * AC-10, and the shapes are the ones the previous reader silently accepted or silently emptied.
   *
   * <p>Every one of these used to produce a declaration — usually an empty one — and a dispatch
   * that proceeded. Each is now terminal.
   */
  @Test
  void everyShapeTheProducerDoesNotWriteIsTerminalRatherThanEmpty() {
    List<String> unreadable =
        List.of(
            "[]",
            "[\"a-flat-legacy-array\"]",
            revision("\"variables\":[\"REGION\"]"),
            revision("\"secrets\":[\"LOGIN_PW\"]"),
            revision("\"variables\":[\"REGION\"],\"secrets\":[\"PW\"],\"extra\":[]"),
            revision("\"variables\":\"REGION\",\"secrets\":[]"),
            revision("\"variables\":[{\"name\":\"REGION\"}],\"secrets\":[]"),
            "not json at all",
            "");
    for (String document : unreadable) {
      assertThatThrownBy(() -> ExecutionReferences.declared(mapper, document))
          .as("document %s must be terminal, not an empty declaration", document)
          .isInstanceOf(ExecutionReferences.UnreadableReferenceDeclarationException.class);
    }
    assertThatThrownBy(() -> ExecutionReferences.declared(mapper, null))
        .isInstanceOf(ExecutionReferences.UnreadableReferenceDeclarationException.class);
  }

  /**
   * AC-6, AC-10 constraint (a) — the refusal names the declaration, never the revision's contents.
   *
   * <p>The value proven present first: the document below carries a canary, so the absence
   * afterwards is a fact about the message rather than about an empty document.
   */
  @Test
  void theRefusalNamesTheDeclarationAndNeverTheDocument() {
    String canary = "canary-inside-an-unreadable-declaration-8fd2";
    String document =
        revision("\"variables\":[\"" + canary + "\"],\"secrets\":[\"x\"],\"extra\":1");
    assertThat(document).contains(canary);

    assertThatThrownBy(() -> ExecutionReferences.declared(mapper, document))
        .isInstanceOf(ExecutionReferences.UnreadableReferenceDeclarationException.class)
        .hasMessageNotContaining(canary)
        .satisfies(
            thrown -> {
              // The cause chain too: a chained JsonProcessingException would quote the document.
              assertThat(thrown.getCause()).isNull();
              assertThat(thrown.getMessage()).contains("reference declaration");
            });
  }

  /** AC-10 on the identity check: a refused authoring identity never echoes the document. */
  @Test
  void anIdentityRefusalNamesTheDeclarationAndNeverTheDocument() {
    String canary = "canary-inside-a-refused-identity-5c19";
    String document =
        "{\"variables\":[],\"secrets\":[],\"authoringIdentityVersion\":2,"
            + "\"authoredDeclarations\":[{\"referenceId\":\""
            + canary
            + "\",\"kind\":\"plain\"}]}";
    assertThat(document).contains(canary);

    assertThatThrownBy(() -> ExecutionReferences.declared(mapper, document))
        .isInstanceOf(ExecutionReferences.UnreadableReferenceDeclarationException.class)
        .hasMessageNotContaining(canary)
        .hasMessageContaining("reference declaration")
        .hasNoCause();
  }

  @Test
  void anUnparseableDocumentIsNotChainedEitherBecauseTheParserQuotesWhatItFailedOn() {
    String canary = "canary-inside-broken-json-3ab7";
    assertThatThrownBy(() -> ExecutionReferences.declared(mapper, "{\"variables\": [" + canary))
        .isInstanceOf(ExecutionReferences.UnreadableReferenceDeclarationException.class)
        .hasMessageNotContaining(canary)
        .hasNoCause();
  }
}
