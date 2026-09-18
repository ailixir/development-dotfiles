package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Vertex AI Gemini Flash endpoints used by the Studio authoring UI. */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class StudioAiController {

  private final StudioGeminiService geminiService;
  private final StudioGatewayProperties properties;

  public StudioAiController(StudioGeminiService geminiService, StudioGatewayProperties properties) {
    this.geminiService = geminiService;
    this.properties = properties;
  }

  @GetMapping("/ai/status")
  public Map<String, Object> status() {
    Map<String, Object> status = new LinkedHashMap<>();
    status.put("enabled", properties.enabled());
    status.put(
        "provider",
        StudioGatewayProperties.MODE_API_KEY.equals(properties.credentials().mode())
            ? "gemini-developer-api"
            : "vertex-ai");
    status.put("model", properties.model());
    status.put("location", properties.location());
    status.put("credentialMode", properties.credentials().mode());
    return status;
  }

  @PostMapping("/tests/{id}/compile")
  public ResponseEntity<CompileResponse> compile(
      @PathVariable UUID id, Authentication authentication) {
    CompileResponse response = geminiService.compile(id, authentication);
    return ResponseEntity.status(statusFor(response.outcome())).body(response);
  }

  private static HttpStatus statusFor(GatewayOutcome outcome) {
    return switch (outcome) {
      case OK -> HttpStatus.OK;
      case DISABLED -> HttpStatus.SERVICE_UNAVAILABLE;
      case BUSY -> HttpStatus.TOO_MANY_REQUESTS;
      case TOO_LARGE -> HttpStatus.PAYLOAD_TOO_LARGE;
      default -> HttpStatus.BAD_GATEWAY;
    };
  }
}
