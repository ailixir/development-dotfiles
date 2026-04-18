package com.citi.put.checks.checks.execution;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.execution.dto.ExecutionResultDto;
import com.citi.put.checks.checks.execution.entity.ExecutionResult;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/checks/{checkId}")
public class ExecutionHistoryController {

  private final ExecutionResultRepository resultRepository;
  private final CheckRepository checkRepository;
  private final CsiOwnershipEvaluator ownershipEvaluator;

  public ExecutionHistoryController(
      ExecutionResultRepository resultRepository,
      CheckRepository checkRepository,
      CsiOwnershipEvaluator ownershipEvaluator) {
    this.resultRepository = resultRepository;
    this.checkRepository = checkRepository;
    this.ownershipEvaluator = ownershipEvaluator;
  }

  @GetMapping("/history")
  public ResponseEntity<Map<String, Object>> history(
      @PathVariable UUID checkId,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") int limit,
      Authentication auth) {
    requireReadAccess(checkId, auth);
    int clampedLimit = Math.min(limit, 100);

    List<ExecutionResult> results;
    if (cursor != null) {
      Instant before = decodeCursor(cursor);
      results =
          resultRepository.findRecentByCheckId(
              checkId, before, PageRequest.of(0, clampedLimit + 1));
    } else {
      results = resultRepository.findRecentByCheckId(checkId, PageRequest.of(0, clampedLimit + 1));
    }

    boolean hasMore = results.size() > clampedLimit;
    List<ExecutionResult> page = hasMore ? results.subList(0, clampedLimit) : results;
    List<ExecutionResultDto> data = page.stream().map(ExecutionResultDto::from).toList();

    String nextCursor = hasMore ? encodeCursor(page.get(page.size() - 1).getStartedAt()) : null;

    return ResponseEntity.ok(
        Map.of(
            "data", data,
            "hasMore", hasMore,
            "nextCursor", nextCursor != null ? nextCursor : ""));
  }

  @GetMapping("/executions/{execId}")
  public ResponseEntity<ExecutionResultDto> singleExecution(
      @PathVariable UUID checkId, @PathVariable UUID execId, Authentication auth) {
    requireReadAccess(checkId, auth);
    return resultRepository
        .findByIdAndCheckId(execId, checkId)
        .map(r -> ResponseEntity.ok(ExecutionResultDto.from(r)))
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  private void requireReadAccess(UUID checkId, Authentication auth) {
    var check = checkRepository.findById(checkId).orElse(null);
    if (check == null) {
      return;
    }
    if (!ownershipEvaluator.canRead(auth, check.getCsiId())) {
      throw new AccessDeniedException("No read access to check " + checkId);
    }
  }

  private String encodeCursor(Instant instant) {
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(instant.toString().getBytes(StandardCharsets.UTF_8));
  }

  private Instant decodeCursor(String cursor) {
    String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
    return Instant.parse(decoded);
  }
}
