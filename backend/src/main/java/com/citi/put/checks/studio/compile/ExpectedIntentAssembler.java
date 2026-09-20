package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.ResolvedInput;
import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Builds ADR-003's trusted runner vocabulary solely from resolved saved authoring inputs. */
public final class ExpectedIntentAssembler {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  public String assemble(
      List<ResolvedStepReview> steps,
      Map<UUID, List<ResolvedOperation.Kind>> sequences,
      Map<UUID, String> scopes) {
    ObjectNode document = MAPPER.createObjectNode();
    document.put("schemaVersion", 1);
    ArrayNode outputSteps = document.putArray("steps");
    for (int index = 0; index < steps.size(); index++) {
      ResolvedStepReview step = steps.get(index);
      if (step.operation() == null) {
        throw unsupported(step.stepId(), "operation");
      }
      List<ResolvedOperation.Kind> sequence = sequences.get(step.stepId());
      if (sequence == null || sequence.isEmpty()) {
        sequence = List.of(step.operation().kind());
      }
      ObjectNode outputStep = outputSteps.addObject();
      outputStep.put("stepIndex", index);
      outputStep.put("stepId", step.stepId().toString());
      ArrayNode operations = outputStep.putArray("operations");
      for (ResolvedOperation.Kind kind : sequence) {
        operations.add(operation(step, kind, scopes.get(step.stepId())));
      }
    }
    return ArtifactCanonicalizer.canonicalize(document.toString());
  }

  private static JsonNode operation(
      ResolvedStepReview step, ResolvedOperation.Kind kind, String scope) {
    ObjectNode operation = MAPPER.createObjectNode();
    switch (kind) {
      case NAVIGATE -> {
        requireTarget(step, ResolvedTarget.Strategy.URL);
        operation.put("op", "goto");
        operation.set("url", literal(step.target().value()));
      }
      case CLICK -> {
        operation.put("op", "click");
        operation.set("locator", locator(step, scope));
      }
      case FILL -> {
        operation.put("op", "fill");
        operation.set("locator", locator(step, scope));
        operation.set("value", input(step));
      }
      case PRESS -> {
        operation.put("op", "press");
        operation.set("locator", locator(step, scope));
        String key =
            step.operation().kind() == ResolvedOperation.Kind.FILL ? "Enter" : literalInput(step);
        operation.set("key", literal(key));
      }
      case SELECT -> {
        operation.put("op", "selectOption");
        operation.set("locator", locator(step, scope));
        JsonNode value = input(step);
        if ("secret".equals(value.path("kind").asText())) {
          throw unsupported(step.stepId(), "input");
        }
        operation.set("value", value);
      }
      case CHECK -> {
        operation.put("op", "check");
        operation.set("locator", locator(step, scope));
      }
      case ASSERT -> {
        if (step.target() != null && step.target().strategy() == ResolvedTarget.Strategy.URL) {
          operation.put("op", "expectUrl");
          operation.set(
              "expected",
              Boolean.TRUE.equals(step.target().exact())
                  ? literal(step.target().value())
                  : regexContains(step.target().value()));
        } else {
          operation.put("op", "expectVisible");
          operation.set("locator", locator(step, scope));
        }
      }
    }
    return operation;
  }

  private static ObjectNode locator(ResolvedStepReview step, String scope) {
    if (step.target() == null || step.target().strategy() == ResolvedTarget.Strategy.URL) {
      throw unsupported(step.stepId(), "target");
    }
    ObjectNode chain = MAPPER.createObjectNode();
    ObjectNode segment = chain.putArray("segments").addObject();
    switch (step.target().strategy()) {
      case ROLE -> {
        segment.put("kind", "getByRole");
        segment.put("role", step.target().value());
        if (scope != null || step.target().exact() != null) {
          ObjectNode options = segment.putObject("options");
          if (scope != null) {
            options.set("name", literal(scope));
          }
          if (step.target().exact() != null) {
            options.put("exact", step.target().exact());
          }
        }
      }
      case LABEL, TEXT, TEST_ID -> {
        segment.put(
            "kind",
            switch (step.target().strategy()) {
              case LABEL -> "getByLabel";
              case TEXT -> "getByText";
              case TEST_ID -> "getByTestId";
              default -> throw new IllegalStateException();
            });
        segment.set(
            step.target().strategy() == ResolvedTarget.Strategy.TEST_ID ? "testId" : "text",
            literal(step.target().value()));
        if (step.target().strategy() != ResolvedTarget.Strategy.TEST_ID
            && step.target().exact() != null) {
          segment.putObject("options").put("exact", step.target().exact());
        }
      }
      case URL -> throw unsupported(step.stepId(), "target");
    }
    return chain;
  }

  private static JsonNode input(ResolvedStepReview step) {
    ResolvedInput input = step.input();
    if (input instanceof ResolvedLiteralInput literal) {
      return literal(literal.value());
    }
    if (input instanceof ResolvedReferenceInput reference) {
      ObjectNode value = MAPPER.createObjectNode();
      if (reference.kind() == ResolvedReferenceInput.Kind.SECRET_REF) {
        value.put("kind", "secret");
        value.put("id", reference.referenceId());
      } else {
        value.put("kind", "variable");
        value.put("name", reference.referenceId());
      }
      return value;
    }
    throw unsupported(step.stepId(), "input");
  }

  private static String literalInput(ResolvedStepReview step) {
    if (step.input() instanceof ResolvedLiteralInput literal) {
      return literal.value();
    }
    throw unsupported(step.stepId(), "input");
  }

  private static ObjectNode literal(String value) {
    ObjectNode literal = MAPPER.createObjectNode();
    literal.put("kind", "literal");
    literal.put("value", value);
    return literal;
  }

  private static ObjectNode regexContains(String value) {
    ObjectNode regex = MAPPER.createObjectNode();
    regex.put("kind", "regex");
    regex.put("source", ".*" + value.replaceAll("([\\\\.^$|?*+()\\[\\]{}])", "\\\\$1") + ".*");
    regex.put("flags", "");
    return regex;
  }

  private static void requireTarget(ResolvedStepReview step, ResolvedTarget.Strategy strategy) {
    if (step.target() == null || step.target().strategy() != strategy) {
      throw unsupported(step.stepId(), "target");
    }
  }

  private static IllegalArgumentException unsupported(UUID stepId, String field) {
    return new IllegalArgumentException(
        "Expected intent is underspecified at step " + stepId + " field " + field);
  }
}
