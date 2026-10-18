package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.policy.GuidedPolicyReason;
import com.fasterxml.jackson.databind.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Correspondence of a proposed action to the author's words, and the governed action policy
 * (STUDIO-OBS-014 AC-4, AC-5, AC-6; ruling AR-2 a and f). Pure: it reads only the sanitized
 * observed node the model was shown, the authored step text, the step's saved-input texts and the
 * frozen governed policy document. It never reads raw DOM and never exports anything.
 *
 * <p>Order of checks: an element target the observation does not contain (AC-4, fail closed), then
 * the destructive-verb guard (AC-5), then grounding (AC-4), then the side-effect stance (AC-6).
 * Each refusal is one closed {@link GuidedPolicyReason}.
 *
 * <ul>
 *   <li><b>Grounding</b> ({@code click}, {@code press}, {@code check}): the target's safe label
 *       (the observed node's accessible name, else the locator's name/value) corresponds to the
 *       authored text or a referenced saved input when, after normalization (NFKC, lower case,
 *       letters and digits only, single spaces), the label occurs there as a whole phrase, or every
 *       label word occurs there as a whole word. A target with no label is grounded only by its
 *       role word.
 *   <li><b>Destructive verbs</b> ({@code click}, {@code press}): a label that contains a vocabulary
 *       phrase as a whole phrase is refused unless the authored text (or a referenced saved input)
 *       contains the same phrase.
 *   <li><b>Side effects</b> ({@code click}, {@code press}), fail closed (architect ruling
 *       AR-SEC001-FM, option B): a click is side-effecting unless its target is proven
 *       non-activating, whatever its form membership. Proven non-activating means exactly one of
 *       three consistent triples of the sanitized node: an {@code input} whose role is textbox,
 *       searchbox or combobox and whose control type is a text-entry type (text, search, email,
 *       tel, url, password; a submit input can never carry these, so a role spoof does not
 *       qualify); a {@code textarea} with role textbox and control type textarea; or a {@code
 *       select} with role combobox or listbox. Everything else (buttons of any type, submit/reset
 *       inputs, role=button controls, links, labels, descendants of a button or link, and controls
 *       in an unlabelled or withheld form or associated through {@code form=}) is side-effecting. A
 *       press is side-effecting when its key is Enter (activation, implicit submission or
 *       navigation on any target) or when its target is in an exported form. Image and file inputs
 *       are never exported, so a proposal naming one is refused as an unobserved target before this
 *       check. Under {@code DENY} a side-effecting action is refused; under {@code CLARIFY_FIRST}
 *       the caller asks once per session before the first one; under {@code ALLOW} it passes. The
 *       signals are the node's {@code elementType}, {@code role}, {@code controlType} and {@code
 *       formId} plus the proposal's press key; nothing new is exported.
 * </ul>
 */
public final class GuidedActionGuard {

  /** The verdict for one proposal. */
  public record Decision(GuidedPolicyReason refusal, boolean sideEffecting, boolean confirmFirst) {
    public boolean refused() {
      return refusal != null;
    }
  }

  private static final Set<String> GROUNDED_KINDS = Set.of("click", "press", "check");
  private static final Set<String> EFFECT_KINDS = Set.of("click", "press");

  /** Roles of a text-entry {@code input} (AR-SEC001-FM proven non-activating triple 1). */
  private static final Set<String> TEXT_ENTRY_ROLES = Set.of("textbox", "searchbox", "combobox");

  /** Control types only a text-entry {@code input} carries (never a submit or button input). */
  private static final Set<String> TEXT_ENTRY_CONTROLS =
      Set.of("text", "search", "email", "tel", "url", "password");

  /** Roles of a {@code select} (AR-SEC001-FM proven non-activating triple 3). */
  private static final Set<String> SELECT_ROLES = Set.of("combobox", "listbox");

  private GuidedActionGuard() {}

  /**
   * One evaluation seam for coordinator and prefix admission, using current frozen source/policy.
   */
  public static Decision evaluateProposal(
      JsonNode progress, JsonNode manifest, JsonNode proposal, JsonNode policy) {
    JsonNode target = proposal.path("target"), node = null;
    for (JsonNode candidate : progress.path("observation").path("nodes")) {
      if (target.has("nodeId") && candidate.path("nodeId").equals(target.path("nodeId"))) {
        node = candidate;
      }
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
    JsonNode locator = target.path("locator");
    String label =
        locator.path(locator.path("kind").asText().equals("role") ? "name" : "value").asText(null);
    return evaluate(
        proposal.path("operation").path("kind").asText(),
        proposal.path("operation").path("key").asText(null),
        target.path("nodeId").asText(null),
        node,
        label,
        authored,
        saved,
        policy,
        progress.path("sideEffectConfirmation").path("status").asText().equals("CONFIRMED"));
  }

  /**
   * @param kind the proposal's operation kind
   * @param node the observed node the proposal targets, or null for a page or password target
   * @param locatorLabel the proposal locator's name or value, used when the node has no name
   * @param authoredText the authored text of the proposal's step
   * @param savedInputs the texts of non-secret saved inputs the step references
   * @param policy the frozen governed policy document of the session
   * @param confirmed whether the session already confirmed its first side-effecting action
   */
  public static Decision evaluate(
      String kind,
      JsonNode node,
      String locatorLabel,
      String authoredText,
      List<String> savedInputs,
      JsonNode policy,
      boolean confirmed) {
    return evaluate(
        kind,
        null,
        node == null ? null : node.path("nodeId").asText(null),
        node,
        locatorLabel,
        authoredText,
        savedInputs,
        policy,
        confirmed);
  }

  /**
   * As {@link #evaluate(String, JsonNode, String, String, List, JsonNode, boolean)}, for a proposal
   * whose target names {@code targetNodeId}.
   *
   * <p>STUDIO-OBS-014 SEC-002: an element target ({@code targetNodeId} non-null) of a grounded or
   * side-effecting kind whose node is absent from the observation ({@code node} null) is refused
   * {@link GuidedPolicyReason#UNGROUNDED_TARGET} (ruled AC-4 code: a target not traceable to the
   * authored text). Without its observed node there is no sanitized label or form/link signal, and
   * the locator text is the model's own choice, so the guard fails closed rather than judging it.
   *
   * @param key the press key of a {@code press} proposal, else null
   * @param targetNodeId the proposal target's node id, or null for a page or password target
   */
  public static Decision evaluate(
      String kind,
      String key,
      String targetNodeId,
      JsonNode node,
      String locatorLabel,
      String authoredText,
      List<String> savedInputs,
      JsonNode policy,
      boolean confirmed) {
    if (targetNodeId != null
        && node == null
        && (GROUNDED_KINDS.contains(kind) || EFFECT_KINDS.contains(kind))) {
      return new Decision(GuidedPolicyReason.UNGROUNDED_TARGET, false, false);
    }
    String label =
        node != null && !node.path("name").asText("").isBlank()
            ? node.path("name").asText()
            : locatorLabel == null ? "" : locatorLabel;
    List<String> sources = new ArrayList<>();
    sources.add(authoredText == null ? "" : authoredText);
    if (savedInputs != null) {
      sources.addAll(savedInputs);
    }
    if (EFFECT_KINDS.contains(kind)) {
      for (JsonNode phrase : policy.path("destructiveVocabulary")) {
        String verb = phrase.asText();
        if (containsPhrase(label, verb)
            && sources.stream().noneMatch(s -> containsPhrase(s, verb))) {
          return new Decision(GuidedPolicyReason.DESTRUCTIVE_VERB, false, false);
        }
      }
    }
    if (GROUNDED_KINDS.contains(kind) && !grounded(label, node, sources)) {
      return new Decision(GuidedPolicyReason.UNGROUNDED_TARGET, false, false);
    }
    boolean sideEffecting = sideEffecting(kind, node, key);
    if (sideEffecting) {
      String stance = policy.path("sideEffectStance").asText("CLARIFY_FIRST");
      if (stance.equals("DENY")) {
        return new Decision(GuidedPolicyReason.SIDE_EFFECT_DENIED, true, false);
      }
      if (stance.equals("CLARIFY_FIRST") && !confirmed) {
        return new Decision(null, true, true);
      }
    }
    return new Decision(null, sideEffecting, false);
  }

  /** AR-SEC001-FM: fail-closed side-effect classification (see the class Javadoc). */
  static boolean sideEffecting(String kind, JsonNode node, String key) {
    if (!EFFECT_KINDS.contains(kind)) {
      return false;
    }
    if (kind.equals("press")) {
      return "Enter".equals(key) || (node != null && inForm(node));
    }
    return node == null || !provenNonActivating(node);
  }

  private static boolean inForm(JsonNode node) {
    return node.path("formId").isTextual() && !node.path("formId").asText().isEmpty();
  }

  /** The three consistent triples a click can be proven non-activating on, and nothing else. */
  static boolean provenNonActivating(JsonNode node) {
    String role = node.path("role").asText();
    String control = node.path("controlType").asText();
    return switch (node.path("elementType").asText()) {
      case "input" -> TEXT_ENTRY_ROLES.contains(role) && TEXT_ENTRY_CONTROLS.contains(control);
      case "textarea" -> role.equals("textbox") && control.equals("textarea");
      case "select" -> SELECT_ROLES.contains(role);
      default -> false;
    };
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

  static boolean containsPhrase(String text, String phrase) {
    return containsNormalized(normalize(text), normalize(phrase));
  }

  private static boolean containsNormalized(String text, String phrase) {
    return !phrase.isEmpty() && (" " + text + " ").contains(" " + phrase + " ");
  }

  static String normalize(String value) {
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
