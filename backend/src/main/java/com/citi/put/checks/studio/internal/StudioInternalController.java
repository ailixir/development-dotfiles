package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.AdmissionResponse;
import com.citi.put.checks.studio.internal.dto.ExecutionControl;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import io.swagger.v3.oas.annotations.Hidden;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The API-side internal callbacks of §8.4 (AC-1, AC-17, AC-20), and the runner's control read
 * (Studio v1 WP4, ADR-002 §29).
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
  private final ExecutionControlService controlService;

  public StudioInternalController(
      AdmissionCasService admissionService,
      ProgressReportService progressService,
      StrictInternalBodyReader bodyReader,
      ExecutionControlService controlService) {
    this.admissionService = admissionService;
    this.progressService = progressService;
    this.bodyReader = bodyReader;
    this.controlService = controlService;
  }

  /**
   * Whether the execution has been cancelled (Studio v1 WP4, ADR-002 §29). Polled by the runner
   * that holds the run, so the cancel reaches it whichever pod it is on.
   */
  @GetMapping("/{id}/control")
  public ResponseEntity<ExecutionControl> control(@PathVariable UUID id) {
    return ResponseEntity.ok(controlService.control(id));
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
