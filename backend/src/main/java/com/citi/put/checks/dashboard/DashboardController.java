package com.citi.put.checks.dashboard;

import com.citi.put.checks.dashboard.dto.ActivityItemDto;
import com.citi.put.checks.dashboard.dto.AttentionItemDto;
import com.citi.put.checks.dashboard.dto.DashboardSummaryDto;
import com.citi.put.checks.dashboard.dto.ReportSnapshotDto;
import com.citi.put.checks.dashboard.dto.SearchResultDto;
import com.citi.put.checks.dashboard.dto.UpcomingItemDto;
import com.citi.put.checks.security.UserIdentity;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

  private final DashboardService dashboardService;

  public DashboardController(DashboardService dashboardService) {
    this.dashboardService = dashboardService;
  }

  @GetMapping("/summary")
  public ResponseEntity<DashboardSummaryDto> getSummary(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) String csiId) {
    DashboardSummaryDto summary = dashboardService.getSummary(identity, csiId);
    return ResponseEntity.ok(summary);
  }

  @GetMapping("/attention")
  public ResponseEntity<Map<String, List<AttentionItemDto>>> getAttentionItems(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) String csiId,
      @RequestParam(defaultValue = "10") int limit) {
    List<AttentionItemDto> items = dashboardService.getAttentionItems(identity, csiId, limit);
    return ResponseEntity.ok(Map.of("data", items));
  }

  @GetMapping("/activity")
  public ResponseEntity<Map<String, List<ActivityItemDto>>> getActivityItems(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) String csiId,
      @RequestParam(defaultValue = "24") int hours) {
    List<ActivityItemDto> items = dashboardService.getActivityItems(identity, csiId, hours);
    return ResponseEntity.ok(Map.of("data", items));
  }

  @GetMapping("/upcoming")
  public ResponseEntity<Map<String, List<UpcomingItemDto>>> getUpcomingItems(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam(required = false) String csiId,
      @RequestParam(defaultValue = "10") int limit) {
    List<UpcomingItemDto> items = dashboardService.getUpcomingItems(identity, csiId, limit);
    return ResponseEntity.ok(Map.of("data", items));
  }

  @GetMapping("/reports/snapshot")
  public ResponseEntity<Map<String, List<ReportSnapshotDto>>> getReportsSnapshot(
      @RequestParam(required = false) String csiId, @RequestParam(defaultValue = "5") int limit) {
    List<ReportSnapshotDto> items = dashboardService.getReportsSnapshot(csiId, limit);
    return ResponseEntity.ok(Map.of("data", items));
  }

  @GetMapping("/search")
  public ResponseEntity<Map<String, List<SearchResultDto>>> search(
      @AuthenticationPrincipal UserIdentity identity,
      @RequestParam String q,
      @RequestParam(required = false) String csiId) {
    List<SearchResultDto> results = dashboardService.search(identity, q, csiId);
    return ResponseEntity.ok(Map.of("data", results));
  }

  @PostMapping("/attention/{id}/acknowledge")
  public ResponseEntity<Map<String, Object>> acknowledgeAttentionItem(@PathVariable String id) {
    try {
      Instant acknowledgedAt = dashboardService.acknowledgeCheck(id);
      return ResponseEntity.ok(Map.of("id", id, "acknowledgedAt", acknowledgedAt));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.notFound().build();
    }
  }

  @PostMapping("/attention/{id}/assign")
  public ResponseEntity<Map<String, Object>> assignAttentionItem(
      @PathVariable String id, @RequestBody Map<String, String> body) {
    String userId = body.getOrDefault("userId", "");
    try {
      dashboardService.assignCheck(id, userId);
      return ResponseEntity.ok(Map.of("id", id, "userId", userId));
    } catch (IllegalArgumentException e) {
      return ResponseEntity.notFound().build();
    }
  }
}
