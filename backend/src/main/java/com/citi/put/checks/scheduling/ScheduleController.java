package com.citi.put.checks.scheduling;

import com.citi.put.checks.scheduling.dto.EnableRequest;
import com.citi.put.checks.scheduling.dto.ScheduleDto;
import com.citi.put.checks.scheduling.dto.ScheduleRequest;
import com.citi.put.checks.security.UserIdentity;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/schedules")
public class ScheduleController {

  private final ScheduleService scheduleService;

  public ScheduleController(ScheduleService scheduleService) {
    this.scheduleService = scheduleService;
  }

  @PostMapping
  public ResponseEntity<ScheduleDto> create(
      @RequestBody ScheduleRequest request, Authentication auth) {
    ScheduleDto created = scheduleService.create(request, auth);
    return ResponseEntity.created(URI.create("/api/v1/schedules/" + created.id())).body(created);
  }

  @GetMapping
  public ResponseEntity<Map<String, Object>> list(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) UUID checkId,
      @RequestParam(required = false) Boolean enabled,
      @RequestParam(required = false) String timezone,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<ScheduleDto> result =
        scheduleService.list(identity, checkId, enabled, timezone, page, size);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @GetMapping("/{id}")
  public ResponseEntity<ScheduleDto> findById(@PathVariable UUID id, Authentication auth) {
    ScheduleDto dto = scheduleService.findById(id, auth);
    return ResponseEntity.ok(dto);
  }

  @PutMapping("/{id}")
  public ResponseEntity<ScheduleDto> update(
      @PathVariable UUID id, @RequestBody ScheduleRequest request, Authentication auth) {
    ScheduleDto updated = scheduleService.update(id, request, auth);
    return ResponseEntity.ok(updated);
  }

  @PatchMapping("/{id}/enabled")
  public ResponseEntity<ScheduleDto> setEnabled(
      @PathVariable UUID id, @RequestBody EnableRequest request, Authentication auth) {
    ScheduleDto updated = scheduleService.setEnabled(id, request.enabled(), auth);
    return ResponseEntity.ok(updated);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
    scheduleService.delete(id, auth);
    return ResponseEntity.noContent().build();
  }

  private Map<String, Object> toEnvelope(Page<ScheduleDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
