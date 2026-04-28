package com.citi.put.checks.reports;

import com.citi.put.checks.reports.dto.ReportDto;
import com.citi.put.checks.reports.dto.ReportExecutionDto;
import com.citi.put.checks.reports.dto.ReportRequest;
import java.net.URI;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
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
@RequestMapping("/api/v1/reports")
public class ReportsController {

  private final ReportsService reportsService;

  public ReportsController(ReportsService reportsService) {
    this.reportsService = reportsService;
  }

  @GetMapping
  public ResponseEntity<Map<String, Object>> list(
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<ReportDto> result = reportsService.list(status, page, size);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @PostMapping
  public ResponseEntity<ReportDto> create(@RequestBody ReportRequest request, Authentication auth) {
    ReportDto created = reportsService.create(request, auth);
    return ResponseEntity.created(URI.create("/api/v1/reports/" + created.id())).body(created);
  }

  @GetMapping("/{id}")
  public ResponseEntity<ReportDto> findById(@PathVariable UUID id) {
    ReportDto dto = reportsService.findById(id);
    return ResponseEntity.ok(dto);
  }

  @PutMapping("/{id}")
  public ResponseEntity<ReportDto> update(
      @PathVariable UUID id, @RequestBody ReportRequest request) {
    ReportDto updated = reportsService.update(id, request);
    return ResponseEntity.ok(updated);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable UUID id) {
    reportsService.softDelete(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id}/pause")
  public ResponseEntity<ReportDto> pause(@PathVariable UUID id) {
    ReportDto paused = reportsService.pause(id);
    return ResponseEntity.ok(paused);
  }

  @PostMapping("/{id}/resume")
  public ResponseEntity<ReportDto> resume(@PathVariable UUID id) {
    ReportDto resumed = reportsService.resume(id);
    return ResponseEntity.ok(resumed);
  }

  @PostMapping("/{id}/duplicate")
  public ResponseEntity<ReportDto> duplicate(@PathVariable UUID id, Authentication auth) {
    ReportDto duplicated = reportsService.duplicate(id, auth);
    return ResponseEntity.created(URI.create("/api/v1/reports/" + duplicated.id()))
        .body(duplicated);
  }

  @PostMapping("/{id}/preview")
  public ResponseEntity<Map<String, Object>> preview(@PathVariable UUID id) {
    // Verify report exists
    reportsService.findById(id);
    return ResponseEntity.ok(
        Map.of(
            "preview", "",
            "html", "<p>Preview not implemented</p>",
            "generatedAt", Instant.now()));
  }

  @PostMapping("/{id}/run-now")
  public ResponseEntity<ReportExecutionDto> runNow(@PathVariable UUID id) {
    ReportExecutionDto execution = reportsService.runNow(id);
    return ResponseEntity.ok(execution);
  }

  @GetMapping("/{id}/executions")
  public ResponseEntity<Map<String, Object>> listExecutions(
      @PathVariable UUID id,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<ReportExecutionDto> result = reportsService.listExecutions(id, page, size);
    return ResponseEntity.ok(toExecutionEnvelope(result));
  }

  @PostMapping("/{id}/send-test")
  public ResponseEntity<Map<String, Object>> sendTest(@PathVariable UUID id) {
    // Verify report exists
    reportsService.findById(id);
    return ResponseEntity.ok(Map.of("ok", true, "sentAt", Instant.now()));
  }

  private Map<String, Object> toEnvelope(Page<ReportDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }

  private Map<String, Object> toExecutionEnvelope(Page<ReportExecutionDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
