package com.citi.put.checks.secrets;

import com.citi.put.checks.secrets.dto.CreateSecretRequest;
import com.citi.put.checks.secrets.dto.SecretDto;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class SecretsController {

  private final SecretsService secretsService;

  public SecretsController(SecretsService secretsService) {
    this.secretsService = secretsService;
  }

  @GetMapping("/secrets")
  public ResponseEntity<Map<String, Object>> list() {
    List<SecretDto> secrets = secretsService.list();
    return ResponseEntity.ok(Map.of("data", secrets));
  }

  @PostMapping("/secrets")
  public ResponseEntity<SecretDto> create(
      @RequestBody CreateSecretRequest request, Authentication auth) {
    SecretDto created = secretsService.create(request, auth);
    return ResponseEntity.created(URI.create("/api/v1/secrets/" + created.id())).body(created);
  }

  @PostMapping("/internal/resolve-secret")
  public ResponseEntity<Map<String, Object>> resolveSecret(@RequestBody Map<String, String> body) {
    String id = body.get("id");
    if (id == null || id.isBlank()) {
      return ResponseEntity.badRequest().body(Map.of("error", "id is required"));
    }
    Map<String, Object> result = secretsService.resolveSecret(id);
    return ResponseEntity.ok(result);
  }
}
