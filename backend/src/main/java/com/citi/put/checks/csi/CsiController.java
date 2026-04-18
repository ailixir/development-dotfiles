package com.citi.put.checks.csi;

import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.security.UserIdentity;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/csi")
public class CsiController {

  private final CsiService csiService;

  public CsiController(CsiService csiService) {
    this.csiService = csiService;
  }

  @GetMapping
  public ResponseEntity<Map<String, Object>> list(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) String businessUnit,
      @RequestParam(required = false) String criticality,
      @RequestParam(required = false) String environment,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String search,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    Page<CsiDto> result =
        csiService.listCsi(
            identity, businessUnit, criticality, environment, status, search, page, size);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @GetMapping("/{id}")
  @PreAuthorize("@csiOwnershipEvaluator.canRead(authentication, #id)")
  public ResponseEntity<CsiDto> findById(@PathVariable String id) {
    CsiDto dto = csiService.findById(id);
    if (dto == null) {
      return ResponseEntity.notFound().build();
    }
    return ResponseEntity.ok(dto);
  }

  @GetMapping("/{id}/checks")
  @PreAuthorize("@csiOwnershipEvaluator.canRead(authentication, #id)")
  public ResponseEntity<Map<String, Object>> checksForCsi(
      @PathVariable String id,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size) {
    return ResponseEntity.ok(
        Map.of("data", List.of(), "page", page, "size", size, "totalElements", 0, "totalPages", 0));
  }

  private Map<String, Object> toEnvelope(Page<CsiDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
