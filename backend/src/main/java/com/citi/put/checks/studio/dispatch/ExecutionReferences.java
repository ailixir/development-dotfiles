package com.citi.put.checks.studio.dispatch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads the <b>typed</b> declared references off a confirmed revision (§8.3, §9.2, AC-1, AC-10).
 *
 * <p>The revision's {@code "references"} column holds declarations and never values, which is the
 * whole point of the column: names persist, values do not. This reader therefore cannot leak one,
 * because there is nothing in its input to leak — and it never puts its input in a message either,
 * which is AC-10's second constraint: a refusal names the <em>declaration</em> as unreadable and
 * never the revision's contents.
 *
 * <p><b>Fail-closed, and that is the change story 10.17 makes.</b> The previous reader walked any
 * shape it was given, collected whatever looked like a name, and returned an empty list for
 * anything it did not recognise. Combined with the dispatcher's {@code orElse(List.of())} that was
 * a silent fail-open: a dispatch whose revision could not be read proceeded as a run with no
 * references and no secrets, which for a login test is a browser opening a real application with an
 * empty password field. The epic's acceptance bullet is <em>"unauthorized or <b>missing</b>
 * reference prevents browser launch"</em>, so an unreadable, absent or unrecognised declaration is
 * now {@link UnreadableReferenceDeclarationException} and the dispatcher makes it terminal.
 *
 * <p>The recognised shape is exactly the one {@code CompileInputs.referencesJson()} writes and the
 * one the contract's {@code ReferenceDeclarations} declares: an object with {@code variables} and
 * {@code secrets}, each an array of strings, and no other key. Accepting more shapes than the
 * producer writes is how a reader stops being able to tell a corrupt document from an old one.
 */
public final class ExecutionReferences {

  private ExecutionReferences() {}

  /**
   * The typed declaration, in declaration order.
   *
   * @param mapper the JSON reader
   * @param referencesJson the revision's stored {@code references} document
   * @return the two sets, separately
   * @throws UnreadableReferenceDeclarationException when the document is absent, unparseable or of
   *     a shape this reader does not recognise
   */
  public static ReferenceDeclarations declared(ObjectMapper mapper, String referencesJson) {
    if (referencesJson == null || referencesJson.isBlank()) {
      throw new UnreadableReferenceDeclarationException(
          "the confirmed revision carries no reference declaration");
    }
    JsonNode node;
    try {
      node = mapper.readTree(referencesJson);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      // The exception's message would quote the document. It is deliberately not chained here.
      throw new UnreadableReferenceDeclarationException(
          "the reference declaration on the confirmed revision is not readable JSON");
    }
    if (node == null || !node.isObject()) {
      throw new UnreadableReferenceDeclarationException(
          "the reference declaration on the confirmed revision is not an object");
    }
    for (String key : (Iterable<String>) node::fieldNames) {
      if (!"variables".equals(key) && !"secrets".equals(key)) {
        throw new UnreadableReferenceDeclarationException(
            "the reference declaration on the confirmed revision carries an unrecognised key");
      }
    }
    return new ReferenceDeclarations(
        names(node.get("variables"), "variables"), names(node.get("secrets"), "secrets"));
  }

  private static List<String> names(JsonNode array, String field) {
    if (array == null || !array.isArray()) {
      throw new UnreadableReferenceDeclarationException(
          "the reference declaration on the confirmed revision has no '" + field + "' array");
    }
    List<String> names = new ArrayList<>();
    for (JsonNode element : array) {
      if (!element.isTextual() || element.textValue().isBlank()) {
        throw new UnreadableReferenceDeclarationException(
            "the reference declaration's '" + field + "' array holds a non-name element");
      }
      names.add(element.textValue());
    }
    return names;
  }

  /**
   * An unreadable, absent or unrecognised declaration (AC-10).
   *
   * <p>Ruled {@code REFERENCE_UNAVAILABLE} by @po on 2026-09-11 on ADR-002 §15.3's axis — it is
   * <em>a fact about the draft and its environment</em>: the same principal attempting the same
   * draft fails identically and the remedy points at the author or at whoever restores the row.
   * Nothing about the principal's entitlement has changed, which is what would have made it {@code
   * AUTHORIZATION_REVOKED}. No ninth enum value, and the path stays dispatcher-side so {@code
   * x-assigned-by} stays true.
   *
   * <p>The message names the declaration. It never carries the document.
   */
  public static class UnreadableReferenceDeclarationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public UnreadableReferenceDeclarationException(String message) {
      super(message);
    }
  }
}
