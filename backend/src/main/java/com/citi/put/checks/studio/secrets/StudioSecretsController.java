package com.citi.put.checks.studio.secrets;

import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A test's Studio secrets (ADR-002 §32), declared in {@code docs/specs/studio/openapi.yaml} as
 * {@code listTestSecrets} and {@code createTestSecret}.
 *
 * <p>The create body is taken as the raw bytes, optional and with no {@code consumes}, on purpose:
 * Spring binding a typed body would answer a malformed, empty or non-JSON request with a {@code
 * 400} or {@code 415} <em>before</em> authorization ran. {@link StudioSecretsService} authorizes
 * first and parses after. The response never carries the value, and there is no {@code Location}
 * header because there is no single-secret read to point at.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class StudioSecretsController {

  private final StudioSecretsService secrets;

  public StudioSecretsController(StudioSecretsService secrets) {
    this.secrets = secrets;
  }

  @GetMapping("/tests/{id}/secrets")
  public ResponseEntity<StudioSecretListDto> listTestSecrets(
      @PathVariable UUID id, Authentication auth) {
    return ResponseEntity.ok(secrets.list(id, auth));
  }

  @PostMapping("/tests/{id}/secrets")
  public ResponseEntity<StudioSecretDto> createTestSecret(
      @PathVariable UUID id, @RequestBody(required = false) byte[] body, Authentication auth) {
    return ResponseEntity.status(HttpStatus.CREATED).body(secrets.create(id, body, auth));
  }
}
