package com.citi.put.checks.studio.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.translation.GuidedOutline;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;

/**
 * Refs of the elements of the pages the joined integration tests serve (a real runner, a real
 * browser). The model names a ref of the outline; the page's test ids are no longer part of what
 * the backend sees, so a test finds its element the way the model does, by role and accessible
 * name.
 */
public final class JoinedRefs {
  private JoinedRefs() {}

  /** The accessible names of the elements the joined pages mark with a test id. */
  private static final Map<String, String> NAME_OF_TEST_ID =
      Map.of(
          "source", "Order number",
          "destination", "Destination",
          "replace", "Replace");

  /**
   * The ref of the one element the page marks with {@code testId}, found by its accessible name.
   */
  public static String refOfTestId(JsonNode observation, String testId) {
    String name = NAME_OF_TEST_ID.get(testId);
    assertThat(name).as("no accessible name is known for test id %s", testId).isNotNull();
    return refByName(observation, name);
  }

  /** The shown lines (those with a ref) of an outline text, in order. */
  public static List<GuidedOutline.Line> shown(String outline) {
    return GuidedOutline.parse(outline).stream().filter(line -> line.ref() != null).toList();
  }

  /** The ref of the one outline line whose accessible name is {@code name}. */
  public static String refByName(JsonNode observation, String name) {
    return refInOutline(observation.path("outline").asText(), name);
  }

  /** The ref of the one line of the outline text whose accessible name is {@code name}. */
  public static String refInOutline(String outline, String name) {
    return lineInOutline(outline, name).ref();
  }

  /**
   * The one shown line (it has a ref) of the outline text whose accessible name is {@code name}.
   */
  public static GuidedOutline.Line lineInOutline(String outline, String name) {
    List<GuidedOutline.Line> matches =
        GuidedOutline.parse(outline).stream()
            .filter(line -> line.ref() != null && name.equals(line.name()))
            .toList();
    assertThat(matches).as("outline lines named %s", name).hasSize(1);
    return matches.getFirst();
  }
}
