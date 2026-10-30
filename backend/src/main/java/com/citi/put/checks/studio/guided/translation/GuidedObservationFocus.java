package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;

/**
 * ADR-SC-007 D1/D10: the focus the backend sends with every observation request. The runner
 * projects the outline on it, so the element the current step needs stays in the outline instead of
 * only landmarks, headings and form controls. It is the authored step text with its secret tokens
 * masked (at most 1,024 characters) and the target intents of the step's obligations (at most 8,
 * each at most 256 characters). One pure helper builds it for every site that asks the runner to
 * observe, so the learning path and the incremental prefix cannot drift apart.
 */
public final class GuidedObservationFocus {
  private GuidedObservationFocus() {}

  public static final int STEP_TEXT_CHARS = 1024;
  public static final int MAX_INTENTS = 8;
  public static final int INTENT_CHARS = 256;

  /** {@code {stepText, targetIntents}} as observation-refresh.focus. */
  public static ObjectNode focus(String stepText, List<String> targetIntents) {
    ObjectNode focus = JsonNodeFactory.instance.objectNode();
    focus.put("stepText", cap(mask(stepText), STEP_TEXT_CHARS));
    ArrayNode intents = focus.putArray("targetIntents");
    if (targetIntents != null) {
      for (String intent : targetIntents) {
        String text = cap(mask(intent).strip(), INTENT_CHARS);
        if (!text.isEmpty() && intents.size() < MAX_INTENTS) {
          intents.add(text);
        }
      }
    }
    return focus;
  }

  /** The target intents of the obligations in the given order. */
  public static List<String> intentsOf(Iterable<JsonNode> obligations) {
    List<String> intents = new ArrayList<>();
    for (JsonNode obligation : obligations) {
      if (obligation.path("targetIntent").isTextual()) {
        intents.add(obligation.path("targetIntent").asText());
      }
    }
    return intents;
  }

  private static String mask(String text) {
    return text == null ? "" : GuidedPromptAssembler.maskSecretTokens(text);
  }

  private static String cap(String text, int codePoints) {
    if (text.codePointCount(0, text.length()) <= codePoints) {
      return text;
    }
    return text.substring(0, text.offsetByCodePoints(0, codePoints));
  }
}
