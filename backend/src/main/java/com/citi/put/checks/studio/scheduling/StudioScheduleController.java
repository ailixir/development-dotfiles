package com.citi.put.checks.studio.scheduling;

import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** API operation does not require the frontend or create a generic Check. */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class StudioScheduleController {
  private final StudioScheduleService service;

  public StudioScheduleController(StudioScheduleService service) {
    this.service = service;
  }

  @GetMapping("/tests/{id}/schedule/capabilities")
  public StudioScheduleDtos.Capability capabilities(@PathVariable UUID id, Authentication auth) {
    return service.capabilities(id, auth);
  }

  @GetMapping("/tests/{id}/schedule")
  public ResponseEntity<?> read(@PathVariable UUID id, Authentication auth) {
    var result = service.read(id, auth);
    // Preserve explicit JSON null, rather than an empty successful body.
    return result == null
        ? ResponseEntity.ok()
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .body("null")
        : ResponseEntity.ok(result);
  }

  @PostMapping("/tests/{id}/schedule")
  public ResponseEntity<StudioScheduleDtos.Schedule> create(
      @PathVariable UUID id, @RequestBody StudioScheduleDtos.Create request, Authentication auth) {
    return ResponseEntity.created(URI.create("/api/v1/studio/tests/" + id + "/schedule"))
        .body(service.create(id, request, auth));
  }

  @PutMapping("/tests/{id}/schedule")
  public StudioScheduleDtos.Schedule update(
      @PathVariable UUID id, @RequestBody StudioScheduleDtos.Update request, Authentication auth) {
    return service.update(id, request, auth);
  }

  @PatchMapping("/tests/{id}/schedule/enabled")
  public StudioScheduleDtos.Schedule enabled(
      @PathVariable UUID id, @RequestBody StudioScheduleDtos.Enabled request, Authentication auth) {
    return service.enabled(id, request, auth);
  }

  @DeleteMapping("/tests/{id}/schedule")
  public ResponseEntity<Void> remove(
      @PathVariable UUID id, @RequestParam Long expectedVersion, Authentication auth) {
    service.remove(id, expectedVersion, auth);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/schedules/preview")
  public StudioScheduleDtos.Preview preview(
      @RequestBody StudioScheduleDtos.PreviewRequest request) {
    return service.preview(request);
  }

  @GetMapping("/tests/{id}/schedule/occurrences")
  public StudioScheduleDtos.Page<StudioScheduleDtos.Occurrence> occurrences(
      @PathVariable UUID id,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    return service.occurrences(id, page, size, auth);
  }

  @ExceptionHandler(StudioScheduleException.class)
  public ResponseEntity<Map<String, String>> refused(StudioScheduleException ex) {
    return ResponseEntity.status(ex.getStatus())
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }
}
