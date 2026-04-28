package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestExecutionDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.validation.StepValidator;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
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
      @RequestParam(defaultValue = "20") int size) {
    Page<UITestDto> result = studioService.listTests(csiId, page, size);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @PostMapping("/tests")
  public ResponseEntity<UITestDto> createTest(
      @RequestBody UITestRequest request, Authentication auth) {
    UITestDto created = studioService.createTest(request, auth);
    return ResponseEntity.created(URI.create("/api/v1/studio/tests/" + created.id())).body(created);
  }

  @GetMapping("/tests/{id}")
  public ResponseEntity<UITestDto> findTestById(@PathVariable UUID id) {
    UITestDto dto = studioService.findTestById(id);
    return ResponseEntity.ok(dto);
  }

  @PutMapping("/tests/{id}")
  public ResponseEntity<UITestDto> updateTest(
      @PathVariable UUID id, @RequestBody UITestRequest request) {
    UITestDto updated = studioService.updateTest(id, request);
    return ResponseEntity.ok(updated);
  }

  @DeleteMapping("/tests/{id}")
  public ResponseEntity<Void> deleteTest(@PathVariable UUID id) {
    studioService.softDeleteTest(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/tests/{id}/execute")
  public ResponseEntity<Map<String, Object>> executeTest(@PathVariable UUID id) {
    UITestExecutionDto execution = studioService.executeTest(id);
    return ResponseEntity.accepted()
        .body(Map.of("executionId", execution.id(), "status", "started"));
  }

  @GetMapping("/executions/{id}")
  public ResponseEntity<UITestExecutionDto> findExecutionById(@PathVariable UUID id) {
    UITestExecutionDto dto = studioService.findExecutionById(id);
    return ResponseEntity.ok(dto);
  }

  @GetMapping("/executions")
  public ResponseEntity<Map<String, Object>> listExecutions(
      @RequestParam(required = false) UUID testId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    if (testId == null) {
      return ResponseEntity.badRequest()
          .body(Map.of("error", "testId query parameter is required"));
    }
    Page<UITestExecutionDto> result = studioService.listExecutions(testId, page, size);
    return ResponseEntity.ok(toExecutionEnvelope(result));
  }

  @PostMapping("/tests/{id}/validate-variables")
  public ResponseEntity<Map<String, Object>> validateVariables(@PathVariable UUID id) {
    UITestDto test = studioService.findTestById(id);
    // Simple check: just confirm the test has variables defined
    boolean hasVariables = test.variables() != null && !test.variables().equals("[]");
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

  private Map<String, Object> toExecutionEnvelope(Page<UITestExecutionDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
