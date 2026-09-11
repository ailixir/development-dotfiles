package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.validation.StepValidator;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public Studio API (Architecture §8.3), frozen in {@code docs/specs/studio/openapi.yaml}.
 *
 * <p>Legacy request shapes are folded into the typed contract by {@link
 * UITestRequest.LegacyDeserializer}; this class is the one boundary that rejects a payload the
 * server will not persist, through {@link LegacyStudioAdapter#validateForWrite(UITestRequest)}.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class StudioController {

  private final StudioService studioService;
  private final StepValidator stepValidator;

  public StudioController(StudioService studioService, StepValidator stepValidator) {
    this.studioService = studioService;
    this.stepValidator = stepValidator;
  }

  @GetMapping("/tests")
  public ResponseEntity<Map<String, Object>> listTests(
      @RequestParam(required = false) String csiId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    Page<UITestDto> result = studioService.listTests(csiId, page, size, auth);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @PostMapping("/tests")
  public ResponseEntity<UITestDto> createTest(
      @RequestBody UITestRequest request, Authentication auth) {
    LegacyStudioAdapter.validateForWrite(request);
    UITestDto created = studioService.createTest(request, auth);
    return ResponseEntity.created(URI.create("/api/v1/studio/tests/" + created.id())).body(created);
  }

  /** Readers may read, authorized against the draft's CSI on the server, before any work. */
  @GetMapping("/tests/{id}")
  public ResponseEntity<UITestDto> findTestById(@PathVariable UUID id, Authentication auth) {
    UITestDto dto = studioService.findTestById(id, auth);
    return ResponseEntity.ok(dto);
  }

  @PutMapping("/tests/{id}")
  public ResponseEntity<UITestDto> updateTest(
      @PathVariable UUID id, @RequestBody UITestRequest request) {
    LegacyStudioAdapter.validateForWrite(request);
    UITestDto updated = studioService.updateTest(id, request);
    return ResponseEntity.ok(updated);
  }

  @DeleteMapping("/tests/{id}")
  public ResponseEntity<Void> deleteTest(@PathVariable UUID id) {
    studioService.softDeleteTest(id);
    return ResponseEntity.noContent().build();
  }

  /**
   * Accepts an execution (AC-7 – AC-11). Owners and explicitly authorized administrators only; the
   * check is on the server and precedes every other step of acceptance.
   */
  @PostMapping("/tests/{id}/execute")
  public ResponseEntity<Map<String, Object>> executeTest(
      @PathVariable UUID id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      Authentication auth) {
    ExecutionSnapshotDto execution = studioService.executeTest(id, auth, idempotencyKey);
    return ResponseEntity.accepted()
        .body(Map.of("executionId", execution.executionId(), "status", execution.status()));
  }

  /**
   * One execution snapshot, authorized against the execution's own immutable CSI — never the parent
   * test's current value, and equally for a soft-deleted test (AC-4a).
   */
  @GetMapping("/executions/{id}")
  public ResponseEntity<ExecutionSnapshotDto> findExecutionById(
      @PathVariable UUID id, Authentication auth) {
    return ResponseEntity.ok(studioService.findExecutionById(id, auth));
  }

  /** {@code testId} is optional; every result is scoped by the execution's own CSI (AC-14). */
  @GetMapping("/executions")
  public ResponseEntity<Map<String, Object>> listExecutions(
      @RequestParam(required = false) UUID testId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    Page<ExecutionSnapshotDto> result = studioService.listExecutions(testId, page, size, auth);
    return ResponseEntity.ok(toExecutionEnvelope(result));
  }

  @PostMapping("/tests/{id}/validate-variables")
  public ResponseEntity<Map<String, Object>> validateVariables(
      @PathVariable UUID id, Authentication auth) {
    UITestDto test = studioService.findTestById(id, auth);
    boolean hasVariables = !test.variables().isEmpty();
    return ResponseEntity.ok(Map.of("valid", true, "hasVariables", hasVariables, "testId", id));
  }

  @PostMapping("/validate-steps")
  public ResponseEntity<Map<String, Object>> validateSteps(
      @RequestBody Map<String, List<String>> body) {
    List<String> steps = body.getOrDefault("steps", List.of());
    List<Map<String, Object>> results =
        steps.stream().map(step -> stepValidator.validate(step)).collect(Collectors.toList());
    boolean allValid = results.stream().allMatch(r -> Boolean.TRUE.equals(r.get("isValid")));
    return ResponseEntity.ok(Map.of("results", results, "allValid", allValid));
  }

  private Map<String, Object> toEnvelope(Page<UITestDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }

  private Map<String, Object> toExecutionEnvelope(Page<ExecutionSnapshotDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
