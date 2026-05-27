package com.citi.put.checks.checks;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.checks.dto.CheckRequest;
import com.citi.put.checks.checks.dto.UpcomingCheckDto;
import com.citi.put.checks.security.UserIdentity;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
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
@Profile("!worker")
@RequestMapping("/api/v1/checks")
public class CheckController {

  private final CheckService checkService;

  public CheckController(CheckService checkService) {
    this.checkService = checkService;
  }

  @PostMapping
  public ResponseEntity<CheckDto> create(
      @Valid @RequestBody CheckRequest request, Authentication auth) {
    CheckDto created = checkService.create(request, auth);
    return ResponseEntity.created(URI.create("/api/v1/checks/" + created.id())).body(created);
  }

  @GetMapping
  public ResponseEntity<Map<String, Object>> list(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) String csiId,
      @RequestParam(required = false) String type,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String environment,
      @RequestParam(required = false) String createdBy,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) List<String> tags,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<CheckDto> result =
        checkService.list(
            identity, csiId, type, status, environment, createdBy, search, tags, page, size);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @GetMapping("/{id}")
  public ResponseEntity<CheckDto> findById(@PathVariable UUID id, Authentication auth) {
    CheckDto dto = checkService.findById(id, auth);
    if (dto == null) {
      return ResponseEntity.notFound().build();
    }
    return ResponseEntity.ok(dto);
  }

  @PutMapping("/{id}")
  public ResponseEntity<CheckDto> update(
      @PathVariable UUID id, @Valid @RequestBody CheckRequest request, Authentication auth) {
    CheckDto updated = checkService.update(id, request, auth);
    return ResponseEntity.ok(updated);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
    checkService.softDelete(id, auth);
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/{id}/pause")
  @PreAuthorize(
      "@csiOwnershipEvaluator.canWrite(authentication," + " @checkService.getCsiIdForCheck(#id))")
  public ResponseEntity<CheckDto> pause(@PathVariable UUID id, Authentication auth) {
    CheckDto paused = checkService.pause(id, auth);
    return ResponseEntity.ok(paused);
  }

  @PostMapping("/{id}/resume")
  @PreAuthorize(
      "@csiOwnershipEvaluator.canWrite(authentication," + " @checkService.getCsiIdForCheck(#id))")
  public ResponseEntity<CheckDto> resume(@PathVariable UUID id, Authentication auth) {
    CheckDto resumed = checkService.resume(id, auth);
    return ResponseEntity.ok(resumed);
  }

  @GetMapping("/upcoming")
  public ResponseEntity<Map<String, Object>> upcoming(
      @RequestParam(defaultValue = "20") int limit, @RequestParam(required = false) String csiId) {
    List<UpcomingCheckDto> upcoming = checkService.getUpcoming(csiId, limit);
    return ResponseEntity.ok(Map.of("data", upcoming, "total", upcoming.size()));
  }

  private Map<String, Object> toEnvelope(Page<CheckDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
