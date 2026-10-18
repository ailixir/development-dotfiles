package com.citi.put.checks.studio.guided.policy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The governed observation policy routes (STUDIO-OBS-014 AC-1; c2b-spec publicRoutes, five
 * operations under {@code /api/v1/studio/guided-policies}). Bodies are the closed v3 {@code
 * guided-policy} contract, validated here; a body or path that does not validate is {@code 400
 * INVALID_POLICY} (never the guided {@code 422}). Every handler error uses the Studio {@code
 * {error, message}} envelope and no message quotes the body.
 */
@RestController
@RequestMapping("/api/v1/studio/guided-policies")
public class ObservationPolicyController {

  private static final String SCHEMA = "v3/guided-policy#/definitions/";

  private final ObservationPolicyService service;
  private final GuidedContracts contracts;

  public ObservationPolicyController(ObservationPolicyService service, GuidedContracts contracts) {
    this.service = service;
    this.contracts = contracts;
  }

  @GetMapping
  public ResponseEntity<JsonNode> lookup(
      Authentication user,
      @RequestParam(value = "csiId", required = false) String csiId,
      @RequestParam(value = "applicationId", required = false) String applicationId,
      @RequestParam(value = "environmentId", required = false) String environmentId) {
    requireText(csiId, 20);
    requireText(applicationId, 256);
    requireText(environmentId, 256);
    return ResponseEntity.ok(valid(service.lookup(user, csiId, applicationId, environmentId)));
  }

  @PostMapping
  public ResponseEntity<JsonNode> create(Authentication user, @RequestBody JsonNode body) {
    validate("createPolicyRequest", body);
    return ResponseEntity.status(HttpStatus.CREATED).body(valid(service.create(user, body)));
  }

  @GetMapping("/{id}")
  public ResponseEntity<JsonNode> read(Authentication user, @PathVariable("id") String id) {
    return ResponseEntity.ok(valid(service.read(user, uuid(id))));
  }

  @PostMapping("/{id}/versions")
  public ResponseEntity<JsonNode> createVersion(
      Authentication user, @PathVariable("id") String id, @RequestBody JsonNode body) {
    UUID policyId = uuid(id);
    validate("createVersionRequest", body);
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(valid(service.addVersion(user, policyId, body)));
  }

  @PostMapping("/{id}/versions/{version}/approval")
  public ResponseEntity<JsonNode> approve(
      Authentication user,
      @PathVariable("id") String id,
      @PathVariable("version") String version,
      @RequestBody JsonNode body) {
    UUID policyId = uuid(id);
    int number = version(version);
    validate("approvalRequest", body);
    return ResponseEntity.ok(valid(service.approve(user, policyId, number, body)));
  }

  /** {@code 404} only from the lookup, only after authorization (ADR-002 §24.3). */
  @ExceptionHandler(GuidedPolicyNotFoundException.class)
  public ResponseEntity<Map<String, String>> notFound(GuidedPolicyNotFoundException missing) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(Map.of("error", GuidedPolicyNotFoundException.CODE, "message", missing.getMessage()));
  }

  private void validate(String definition, JsonNode body) {
    try {
      contracts.validate(SCHEMA + definition, body);
    } catch (GuidedSessionException invalid) {
      throw new StudioValidationException(
          "INVALID_POLICY", "The request body does not match the guided-policy contract");
    }
  }

  /** Every response is the closed {@code policyView}; a server-side drift fails loudly. */
  private JsonNode valid(JsonNode view) {
    contracts.validate(SCHEMA + "policyView", view);
    return view;
  }

  private static UUID uuid(String id) {
    try {
      UUID parsed = UUID.fromString(id);
      if (parsed.toString().equals(id)) {
        return parsed;
      }
    } catch (IllegalArgumentException malformed) {
      // fall through to the closed refusal below
    }
    throw new StudioValidationException("INVALID_POLICY", "The policy id is not a lowercase UUID");
  }

  private static int version(String value) {
    if (value != null && value.matches("[1-9][0-9]{0,9}")) {
      long parsed = Long.parseLong(value);
      if (parsed <= Integer.MAX_VALUE) {
        return (int) parsed;
      }
    }
    throw new StudioValidationException("INVALID_POLICY", "The version is not a positive integer");
  }

  private static void requireText(String value, int max) {
    if (value == null || value.isEmpty() || value.length() > max) {
      throw new StudioValidationException("INVALID_POLICY", "A query parameter is missing");
    }
  }
}
