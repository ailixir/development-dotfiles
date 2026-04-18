package com.citi.put.checks.checks;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.checks.dto.CheckRequest;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/checks")
public class CheckController {

  private final CheckService checkService;

  public CheckController(CheckService checkService) {
    this.checkService = checkService;
  }

  @PostMapping
  public ResponseEntity<CheckDto> create(@RequestBody CheckRequest request, Authentication auth) {
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
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<CheckDto> result =
        checkService.list(
            identity, csiId, type, status, environment, createdBy, search, page, size);
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
      @PathVariable UUID id, @RequestBody CheckRequest request, Authentication auth) {
    CheckDto updated = checkService.update(id, request, auth);
    return ResponseEntity.ok(updated);
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(@PathVariable UUID id, Authentication auth) {
    checkService.softDelete(id, auth);
    return ResponseEntity.noContent().build();
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
