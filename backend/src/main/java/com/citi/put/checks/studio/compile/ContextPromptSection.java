package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Bounded untrusted context, structurally paired one-to-one with source steps.
 *
 * <h2>Global context once (Story 10.45, FR-12, NFR-7)</h2>
 *
 * <p>The test-level global context is held once, not copied into every step section, and {@link
 * #fenceWithSource} emits it exactly once: as the leading {@value #GLOBAL_CONTEXT_KEY} key of the
 * first step's envelope, so it precedes every step in the request contents (spec &sect;3.2.6 part
 * (a)). The prompt is therefore linear in steps, not {@code steps x globalContext}.
 *
 * <p>That key is labelled and scoped so the model cannot read it as step 0's own context: its name
 * marks it untrusted, and its value is {@code {"appliesTo": "every step", "context": ...}}. The
 * output contract names it in its untrusted-data list. It stays inside the JSON fence of the first
 * line rather than on a fenced line of its own because the fenced line count is load-bearing: the
 * v2 request derives one writable step ID per fenced line.
 *
 * <h2>Size cap after deduplication (FR-5 AC-5.2, EC-15)</h2>
 *
 * <p>{@link #MAX_BYTES} is unchanged at 32 KiB. What it measures is the deduplicated context: the
 * global context counted once plus every step section. A complete context over the cap is refused
 * with {@code CONTEXT_TOO_LARGE}; it is never truncated.
 *
 * @param globalContext the test-level context, sent once
 * @param perStep one section per source step: its {@code stepId} and {@code stepContext}
 * @param encodedBytes UTF-8 bytes of the deduplicated context the cap is measured on
 */
public record ContextPromptSection(
    JsonNode globalContext, List<JsonNode> perStep, int encodedBytes) {

  public static final int MAX_BYTES = 32 * 1024;

  /** Envelope key of the request-wide global context; named in the output contract. */
  public static final String GLOBAL_CONTEXT_KEY = "untrustedGlobalContext";

  /** Scope the global context declares: it applies to every step, not only to step 0. */
  public static final String GLOBAL_CONTEXT_SCOPE = "every step";

  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

  public ContextPromptSection {
    globalContext = globalContext == null ? MAPPER.createObjectNode() : globalContext;
    perStep = List.copyOf(perStep);
    if (encodedBytes > MAX_BYTES) {
      throw new StudioValidationException(
          "CONTEXT_TOO_LARGE",
          "Essential authoring context is " + encodedBytes + " bytes; limit is " + MAX_BYTES);
    }
  }

  /**
   * A section with no global context.
   *
   * @param perStep one section per source step
   * @param encodedBytes UTF-8 bytes the cap is measured on
   */
  public ContextPromptSection(List<JsonNode> perStep, int encodedBytes) {
    this(null, perStep, encodedBytes);
  }

  public static ContextPromptSection from(AuthoringV2Request authoring) {
    JsonNode global = MAPPER.valueToTree(authoring.globalContext());
    int bytes = utf8(global.toString());
    List<JsonNode> sections = new ArrayList<>();
    for (AuthoringStep step : authoring.steps()) {
      ObjectNode section = MAPPER.createObjectNode();
      section.put("stepId", step.id().toString());
      section.set("stepContext", MAPPER.valueToTree(step.context()));
      sections.add(section);
      bytes += utf8(section.toString());
    }
    return new ContextPromptSection(global, sections, bytes);
  }

  /**
   * Fences each source line with its own step context; the first line alone also carries the global
   * context, as its leading {@value #GLOBAL_CONTEXT_KEY} key, labelled as applying to every step.
   *
   * @param orderedSource the draft's steps in author order
   * @return one fenced line per source step
   */
  public List<String> fenceWithSource(List<String> orderedSource) {
    if (orderedSource.size() != perStep.size()) {
      throw new IllegalArgumentException("source and context step counts must match");
    }
    List<String> fenced = new ArrayList<>(orderedSource.size());
    for (int index = 0; index < orderedSource.size(); index++) {
      ObjectNode envelope = MAPPER.createObjectNode();
      if (index == 0) {
        ObjectNode scoped = envelope.putObject(GLOBAL_CONTEXT_KEY);
        scoped.put("appliesTo", GLOBAL_CONTEXT_SCOPE);
        scoped.set("context", globalContext);
      }
      envelope.put("source", orderedSource.get(index));
      envelope.set("untrustedContext", perStep.get(index));
      fenced.add(index + ": " + envelope);
    }
    return List.copyOf(fenced);
  }

  public String json() {
    ObjectNode root = MAPPER.createObjectNode();
    root.set("globalContext", globalContext);
    root.set("steps", MAPPER.valueToTree(perStep));
    try {
      return MAPPER.writeValueAsString(root);
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("context prompt section is not serializable", exception);
    }
  }

  private static int utf8(String value) {
    return value.getBytes(StandardCharsets.UTF_8).length;
  }
}
