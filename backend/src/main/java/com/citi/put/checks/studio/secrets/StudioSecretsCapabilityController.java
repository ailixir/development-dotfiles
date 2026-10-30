package com.citi.put.checks.studio.secrets;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * One saved test's runtime capabilities (STUDIO-OBS-008 P1), declared in {@code
 * docs/specs/studio/openapi.yaml} as {@code getStudioTestCapabilities}.
 *
 * <p>Kept apart from {@link StudioSecretsController}, whose route set is pinned to the two secret
 * routes. There is no global capability route: what a caller may do depends on one persisted test.
 * The answer is never cacheable, because it moves with configuration.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class StudioSecretsCapabilityController {

  private final StudioCapabilitiesService capabilities;

  public StudioSecretsCapabilityController(StudioCapabilitiesService capabilities) {
    this.capabilities = capabilities;
  }

  @GetMapping("/tests/{id}/capabilities")
  public ResponseEntity<JsonNode> getStudioTestCapabilities(
      @PathVariable UUID id, Authentication auth) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(capabilities.capabilities(id, auth));
  }
}
