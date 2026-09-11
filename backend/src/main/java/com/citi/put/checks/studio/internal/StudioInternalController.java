package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.AdmissionResponse;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import io.swagger.v3.oas.annotations.Hidden;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The two API-side internal callbacks of §8.4 (AC-1, AC-17, AC-20).
 *
 * <p>They are served at {@code /internal/studio/executions/{id}/...} on the API's internal base and
 * <b>never</b> under the public {@code /api/v1/studio} prefix, which a generator would otherwise
 * compose into {@code /api/v1/studio/internal/studio/...} — a path nothing serves. That is why the
 * frozen contract gives each of these path items its own {@code servers} entry (ADR-002 §3.1).
 *
 * <p>{@link Hidden} plus {@code springdoc.paths-to-exclude} keeps both operations off the public
 * springdoc surface; the contract test still covers them.
 *
 * <p>Neither method is transactional. Each delegates to a service that is, so that the response is
 * written strictly after the commit (AC-20).
 */
@RestController
@Profile("!worker")
@RequestMapping("/internal/studio/executions")
@Hidden
public class StudioInternalController {

  private final AdmissionCasService admissionService;
  private final ProgressReportService progressService;
  private final StrictInternalBodyReader bodyReader;

  public StudioInternalController(
      AdmissionCasService admissionService,
      ProgressReportService progressService,
      StrictInternalBodyReader bodyReader) {
    this.admissionService = admissionService;
    this.progressService = progressService;
    this.bodyReader = bodyReader;
  }

  /** CAS exclusive ownership of an attempt. No browser starts without a {@code 200} here. */
  @PostMapping("/{id}/admission")
  public ResponseEntity<AdmissionResponse> claimAdmission(
      @PathVariable UUID id, @RequestBody byte[] body) {
    return ResponseEntity.ok(
        admissionService.claim(id, bodyReader.read(body, AdmissionRequest.class)));
  }

  /**
   * Cumulative {@code STARTED}/{@code PROGRESS}/{@code FINAL} snapshot from the runner.
   *
   * <p>The acknowledgement is written here, after {@link ProgressReportService#apply} has returned
   * and its transaction has committed.
   */
  @PostMapping("/{id}/progress")
  public ResponseEntity<ProgressAck> reportProgress(
      @PathVariable UUID id, @RequestBody byte[] body) {
    return ResponseEntity.ok(progressService.apply(id, bodyReader.read(body, RunnerReport.class)));
  }
}
