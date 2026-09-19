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

/** Bounded untrusted context, structurally paired one-to-one with source steps. */
public record ContextPromptSection(List<JsonNode> perStep, int encodedBytes) {

  public static final int MAX_BYTES = 32 * 1024;
  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

  public ContextPromptSection {
    perStep = List.copyOf(perStep);
    if (encodedBytes > MAX_BYTES) {
      throw new StudioValidationException(
          "CONTEXT_TOO_LARGE",
          "Essential authoring context is " + encodedBytes + " bytes; limit is " + MAX_BYTES);
    }
  }

  public static ContextPromptSection from(AuthoringV2Request authoring) {
    List<JsonNode> sections = new ArrayList<>();
    int bytes = 0;
    for (AuthoringStep step : authoring.steps()) {
      ObjectNode section = MAPPER.createObjectNode();
      section.put("stepId", step.id().toString());
      section.set("globalContext", MAPPER.valueToTree(authoring.globalContext()));
      section.set("stepContext", MAPPER.valueToTree(step.context()));
      sections.add(section);
      bytes += section.toString().getBytes(StandardCharsets.UTF_8).length;
    }
    return new ContextPromptSection(sections, bytes);
  }

  public List<String> fenceWithSource(List<String> orderedSource) {
    if (orderedSource.size() != perStep.size()) {
      throw new IllegalArgumentException("source and context step counts must match");
    }
    List<String> fenced = new ArrayList<>(orderedSource.size());
    for (int index = 0; index < orderedSource.size(); index++) {
      ObjectNode envelope = MAPPER.createObjectNode();
      envelope.put("source", orderedSource.get(index));
      envelope.set("untrustedContext", perStep.get(index));
      fenced.add(index + ": " + envelope);
    }
    return List.copyOf(fenced);
  }

  public String json() {
    try {
      return MAPPER.writeValueAsString(perStep);
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("context prompt section is not serializable", exception);
    }
  }
}
