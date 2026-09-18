package com.citi.put.checks.studio.compile;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.dto.UITestDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Builds the bounded Studio prompt and delegates compilation to Vertex AI Gemini Flash. */
@Service
public class StudioGeminiService {

  static final String PROMPT_VERSION = "studio-gemini-flash-v1";
  static final String SYNTAX_VERSION = "playwright-typescript-v1";
  private static final String OUTPUT_CONTRACT =
      "Return only a JSON object with version 1 and a steps array. Produce exactly one entry "
          + "per source line in the same order. Each entry must contain stepIndex, originalText "
          + "copied byte-for-byte from the source line, and Playwright TypeScript code. stepIndex "
          + "is zero-based: the first source line is 0, the second is 1, and so on.";
  private static final String SYNTAX_REFERENCE =
      "Use Playwright TypeScript only. Each code value must be one awaited statement using page, "
          + "expect, or an approved locator. Prefer accessible getByRole/getByLabel/getByText "
          + "locators. Do not emit imports, functions, comments, markdown, eval, network clients, "
          + "filesystem access, process access, or resolved secret values. Preserve <var NAME> "
          + "and <secret ID> as opaque placeholders.";

  private final StudioService studioService;
  private final LlmGatewayClient gatewayClient;
  private final ObjectMapper objectMapper;

  public StudioGeminiService(
      StudioService studioService, LlmGatewayClient gatewayClient, ObjectMapper objectMapper) {
    this.studioService = studioService;
    this.gatewayClient = gatewayClient;
    this.objectMapper = objectMapper;
  }

  public CompileResponse compile(UUID testId, Authentication authentication) {
    UITestDto test = studioService.findTestById(testId);
    List<String> steps = parseSteps(test.steps());
    String principal =
        authentication instanceof BffAuthenticationToken bff
            ? bff.getPrincipal().email()
            : authentication.getName();
    String compileRequestId = UUID.randomUUID().toString();
    String repairDiagnostics = null;
    CompileResponse response = null;
    for (int attempt = 1; attempt <= 3; attempt++) {
      CompileRequest request =
          new CompileRequest(
              testId,
              test.csiId(),
              principal,
              compileRequestId,
              attempt,
              steps,
              SYNTAX_REFERENCE,
              SYNTAX_VERSION,
              OUTPUT_CONTRACT,
              PROMPT_VERSION,
              repairDiagnostics);
      response = gatewayClient.propose(request);
      if (!response.isOk()) {
        return response;
      }
      repairDiagnostics = correspondenceError(response.artifactJson(), steps);
      if (repairDiagnostics == null) {
        return response;
      }
    }
    return CompileResponse.parseFailure(
        repairDiagnostics,
        response.provenance(),
        response.retries(),
        response.latencyMs(),
        response.inputBytes(),
        response.outputBytes());
  }

  private String correspondenceError(String artifactJson, List<String> sourceSteps) {
    try {
      JsonNode compiledSteps = objectMapper.readTree(artifactJson).path("steps");
      if (compiledSteps.size() != sourceSteps.size()) {
        return "Previous artifact rejected: expected exactly "
            + sourceSteps.size()
            + " steps but received "
            + compiledSteps.size()
            + ". Return a complete corrected artifact.";
      }
      for (int index = 0; index < sourceSteps.size(); index++) {
        JsonNode compiled = compiledSteps.get(index);
        if (compiled.path("stepIndex").asInt(-1) != index) {
          return "Previous artifact rejected: stepIndex must be zero-based and index-aligned; "
              + "entry "
              + index
              + " must have stepIndex "
              + index
              + ". Return a corrected artifact.";
        }
        if (!sourceSteps.get(index).equals(compiled.path("originalText").asText())) {
          return "Previous artifact rejected: originalText for entry "
              + index
              + " must match its source line byte-for-byte. Return a corrected artifact.";
        }
      }
      return null;
    } catch (Exception exception) {
      return "Previous artifact rejected: correspondence validation could not read the artifact. "
          + "Return a corrected artifact.";
    }
  }

  private List<String> parseSteps(String storedSteps) {
    try {
      JsonNode root = objectMapper.readTree(storedSteps);
      if (!root.isArray()) {
        throw new IllegalArgumentException("Studio steps must be a JSON array");
      }
      List<String> result = new ArrayList<>();
      for (JsonNode step : root) {
        result.add(step.isTextual() ? step.textValue() : legacyStep(step));
      }
      return List.copyOf(result);
    } catch (IllegalArgumentException exception) {
      throw exception;
    } catch (Exception exception) {
      throw new IllegalArgumentException("Studio steps contain invalid JSON", exception);
    }
  }

  private static String legacyStep(JsonNode step) {
    String action = step.path("action").asText();
    String target = step.path("target").asText();
    String value = step.path("value").asText();
    return switch (action) {
      case "navigate" -> "Go to " + target;
      case "click" -> "Click \"" + target + "\"";
      case "type" -> "Type \"" + value + "\" in the \"" + target + "\" field";
      case "wait_for" -> "Wait for \"" + target + "\"";
      case "assert_url_contains" -> "Check that the URL contains \"" + value + "\"";
      case "assert_visible" -> "Check that \"" + target + "\" is visible";
      case "assert_count" ->
          "Check that \"" + target + "\" has at least " + step.path("min").asInt() + " matches";
      case "screenshot" -> "Take screenshot \"" + target + "\"";
      default -> throw new IllegalArgumentException("Unsupported stored Studio action: " + action);
    };
  }
}
