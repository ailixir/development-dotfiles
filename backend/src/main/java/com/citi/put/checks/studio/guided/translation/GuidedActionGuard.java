package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Correspondence of a proposed action to the author's words (STUDIO-OBS-014 AC-4, AC-5; ruling AR-2
 * a). Pure: it reads only the sanitized observed node the model was shown, the authored step text
 * and the step's saved-input texts. It never reads raw DOM and never exports anything.
 *
 * <p>Order of checks: an element target the observation does not contain (AC-4, fail closed), then
 * the destructive-verb guard (AC-5), then grounding (AC-4). Each refusal is one closed {@link
 * GuidedPolicyReason}. A side-effecting click or Enter is not a refusal and raises no question.
 *
 * <ul>
 *   <li><b>Grounding</b> ({@code click}, {@code press}, {@code check}): the target's safe label
 *       (the observed fact's accessible name) corresponds to the authored text or a referenced
 *       saved input when, after normalization (NFKC, lower case, letters and digits only, single
 *       spaces), the label occurs there as a whole phrase, or every label word occurs there as a
 *       whole word. A target with no label is grounded only by its role word.
 *   <li><b>Destructive verbs</b> ({@code click}, {@code press}): a label that contains a {@link
 *       #DESTRUCTIVE_VOCABULARY} phrase as a whole phrase is refused unless the authored text (or a
 *       referenced saved input) contains the same phrase.
 * </ul>
 */
public final class GuidedActionGuard {

  /** The destructive verbs and phrases the guard refuses unless the author named them. */
  static final List<String> DESTRUCTIVE_VOCABULARY =
      List.of(
          "delete",
          "remove",
          "erase",
          "destroy",
          "purge",
          "pay",
          "transfer",
          "send money",
          "submit order",
          "place order",
          "confirm payment",
          "cancel subscription",
          "close account",
          "deactivate",
          "revoke");

  /** The verdict for one proposal: a closed refusal, or null when the proposal passes. */
  public record Decision(GuidedPolicyReason refusal) {
    public boolean refused() {
      return refusal != null;
    }
  }

  private static final Set<String> GROUNDED_KINDS = Set.of("click", "press", "check");
  private static final Set<String> EFFECT_KINDS = Set.of("click", "press");

  private GuidedActionGuard() {}

  /** One evaluation seam for coordinator and prefix admission. */
  public static Decision evaluateProposal(JsonNode progress, JsonNode manifest, JsonNode proposal) {
    JsonNode target = proposal.path("target"), node = null;
    String ref = target.path("kind").asText().equals("node") ? target.path("ref").asText() : null;
    if (ref != null && progress.path("observation").path("facts").path(ref).isObject()) {
      // ADR-SC-007: the sanitized fact of the ref the model named (role and accessible name).
      node = progress.path("observation").path("facts").path(ref);
    }
    String stepId = proposal.path("coordinate").path("stepId").asText(), authored = "";
    for (JsonNode step : manifest.path("sourceSteps")) {
      if (step.path("stepId").asText().equals(stepId)) {
        authored = step.path("text").asText();
      }
    }
    List<String> saved = new ArrayList<>();
    for (JsonNode value : manifest.path("configurationValues")) {
      if (value.path("stepId").asText().equals(stepId)
          && !value.path("kind").asText().equals("secretRef")
          && value.path("value").isTextual()) {
        saved.add(value.path("value").asText());
      }
    }
    return evaluate(proposal.path("operation").path("kind").asText(), ref, node, authored, saved);
  }

  /**
   * STUDIO-OBS-014 SEC-002: an element target ({@code targetNodeId} non-null) of a grounded or
   * click/press kind whose node is absent from the observation ({@code node} null) is refused
   * {@link GuidedPolicyReason#UNGROUNDED_TARGET} (ruled AC-4 code: a target not traceable to the
   * authored text). Without its observed fact there is no sanitized label, so the guard fails
   * closed rather than judging.
   *
   * @param kind the proposal's operation kind
   * @param targetRef the proposal target's ref, or null for a page or password target
   * @param node the observed fact of the ref the proposal targets, or null for a page or password
   *     target
   * @param authoredText the authored text of the proposal's step
   * @param savedInputs the texts of non-secret saved inputs the step references
   */
  public static Decision evaluate(
      String kind, String targetRef, JsonNode node, String authoredText, List<String> savedInputs) {
    if (targetRef != null
        && node == null
        && (GROUNDED_KINDS.contains(kind) || EFFECT_KINDS.contains(kind))) {
      return new Decision(GuidedPolicyReason.UNGROUNDED_TARGET);
    }
    List<String> sources = new ArrayList<>();
    sources.add(authoredText == null ? "" : authoredText);
    if (savedInputs != null) {
      sources.addAll(savedInputs);
    }
    if (targetRef != null
        && EFFECT_KINDS.contains(kind)
        && (node == null
            || !node.path("nameComplete").asBoolean(false)
            || !node.path("ownTextComplete").asBoolean(false)
            || ownText(node) == null)) {
      return new Decision(GuidedPolicyReason.UNGROUNDED_TARGET);
    }
    if (EFFECT_KINDS.contains(kind)) {
      for (String verb : destructiveTerms(node)) {
        if (sources.stream().noneMatch(source -> containsPhrase(source, verb))) {
          return new Decision(GuidedPolicyReason.DESTRUCTIVE_VERB);
        }
      }
    }
    if (GROUNDED_KINDS.contains(kind) && grounding(node, sources) == null) {
      return new Decision(GuidedPolicyReason.UNGROUNDED_TARGET);
    }
    return new Decision(null);
  }

  /**
   * A value-free result. Source index refers only to the caller's existing immutable source order.
   */
  public record Grounding(String field, String mode, int sourceIndex) {}

  public static Grounding grounding(JsonNode node, List<String> sources) {
    if (node == null) {
      return null;
    }
    for (String field : List.of("NAME", "OWN_TEXT")) {
      boolean complete =
          node.path(field.equals("NAME") ? "nameComplete" : "ownTextComplete").asBoolean(false);
      String label = field.equals("NAME") ? node.path("name").asText("") : ownText(node);
      if (!complete || label == null || normalize(label).isEmpty()) {
        continue;
      }
      Set<String> wanted = new HashSet<>(Arrays.asList(normalize(label).split(" ")));
      for (int index = 0; index < sources.size(); index++) {
        String source = normalize(sources.get(index));
        if (containsNormalized(source, normalize(label))) {
          return new Grounding(field, "WHOLE_PHRASE", index);
        }
        if (new HashSet<>(Arrays.asList(source.split(" "))).containsAll(wanted)) {
          return new Grounding(field, "ALL_WORDS", index);
        }
      }
    }
    if (node.path("nameComplete").asBoolean(false)
        && node.path("ownTextComplete").asBoolean(false)
        && normalize(node.path("name").asText("")).isEmpty()
        && "".equals(ownText(node))) {
      String role = normalize(node.path("role").asText());
      for (int index = 0; index < sources.size(); index++) {
        if (containsPhrase(sources.get(index), role)) {
          return new Grounding("ROLE", "ROLE", index);
        }
      }
    }
    return null;
  }

  /** Exactly one validated direct-own segment; absent means empty only with complete provenance. */
  public static String ownText(JsonNode node) {
    if (node == null) {
      return null;
    }
    String evidence = node.path("evidence").asText("");
    String result = "";
    int count = 0;
    for (JsonNode segment : node.path("evidenceSegments")) {
      if (!segment.path("field").asText().equals("ownText")) {
        continue;
      }
      if (segment.has("purpose")) {
        return null;
      }
      int start = segment.path("start").asInt(-1), end = segment.path("end").asInt(-1);
      if (++count > 1
          || start < 0
          || end < start
          || end > evidence.length()
          || start > 0
              && start < evidence.length()
              && Character.isLowSurrogate(evidence.charAt(start))
          || end > 0 && end < evidence.length() && Character.isLowSurrogate(evidence.charAt(end))) {
        return null;
      }
      result = evidence.substring(start, end);
    }
    return result;
  }

  public static List<String> destructiveTerms(JsonNode node) {
    if (node == null) {
      return List.of();
    }
    String name = node.path("name").asText(""), own = ownText(node);
    return DESTRUCTIVE_VOCABULARY.stream()
        .filter(verb -> containsPhrase(name, verb) || containsPhrase(own, verb))
        .toList();
  }

  static boolean grounded(String label, JsonNode node, List<String> sources) {
    String normalized = normalize(label);
    if (normalized.isEmpty()) {
      String role = node == null ? "" : normalize(node.path("role").asText());
      return !role.isEmpty() && sources.stream().anyMatch(s -> containsPhrase(s, role));
    }
    Set<String> words = new HashSet<>(Arrays.asList(normalized.split(" ")));
    for (String source : sources) {
      String text = normalize(source);
      if (containsNormalized(text, normalized)
          || new HashSet<>(Arrays.asList(text.split(" "))).containsAll(words)) {
        return true;
      }
    }
    return false;
  }

  public static boolean containsPhrase(String text, String phrase) {
    return containsNormalized(normalize(text), normalize(phrase));
  }

  private static boolean containsNormalized(String text, String phrase) {
    return !phrase.isEmpty() && (" " + text + " ").contains(" " + phrase + " ");
  }

  public static String normalize(String value) {
    if (value == null) {
      return "";
    }
    String folded = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
    StringBuilder out = new StringBuilder(folded.length());
    boolean space = true;
    for (int i = 0; i < folded.length(); ) {
      int cp = folded.codePointAt(i);
      i += Character.charCount(cp);
      if (Character.isLetterOrDigit(cp)) {
        out.appendCodePoint(cp);
        space = false;
      } else if (!space) {
        out.append(' ');
        space = true;
      }
    }
    return out.toString().strip();
  }
}
