package com.citi.put.checks.checks.bulk;

import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("!worker")
@RequestMapping("/api/v1/checks/_bulk")
public class BulkController {

  private final BulkService bulkService;

  public BulkController(BulkService bulkService) {
    this.bulkService = bulkService;
  }

  @PostMapping
  public ResponseEntity<?> bulk(@RequestBody BulkRequestDto request, Authentication auth) {
    if (request.operations() == null || request.operations().isEmpty()) {
      return ResponseEntity.badRequest()
          .body(Map.of("error", Map.of("code", "INVALID_REQUEST", "message", "No operations")));
    }
    if (request.operations().size() > 100) {
      return ResponseEntity.badRequest()
          .body(
              Map.of(
                  "error", Map.of("code", "BATCH_TOO_LARGE", "message", "Maximum 100 operations")));
    }

    for (BulkOperation op : request.operations()) {
      if (!"delete".equals(op.op())) {
        return ResponseEntity.badRequest()
            .body(
                Map.of(
                    "error",
                    Map.of(
                        "code",
                        "UNSUPPORTED_OP",
                        "message",
                        "Unsupported operation: " + op.op() + ". Only 'delete' is supported.")));
      }
      if (op.id() == null) {
        return ResponseEntity.badRequest()
            .body(
                Map.of(
                    "error",
                    Map.of("code", "MISSING_ID", "message", "Operation missing 'id' field")));
      }
    }

    BulkResponseDto response = bulkService.execute(request, auth);

    long successCount =
        response.results().stream().filter(r -> "SUCCESS".equals(r.status())).count();

    if (successCount == response.results().size()) {
      return ResponseEntity.ok(response);
    } else if (successCount == 0) {
      return ResponseEntity.badRequest().body(response);
    } else {
      return ResponseEntity.status(207).body(response);
    }
  }
}
