package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.StudioAuthoringMapper;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.validation.VariableReferenceValidator;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public Studio API (Architecture §8.3), frozen in {@code docs/specs/studio/openapi.yaml}.
 *
 * <p>Create and update requests use the strict v2 authoring mapper; stable step IDs are required
 * and executable code is refused.
 */
@RestController
@Profile("!worker")
@RequestMapping("/api/v1/studio")
public class StudioController {

  private final StudioService studioService;
  private final StudioAuthoringMapper authoringMapper;

  public StudioController(StudioService studioService, StudioAuthoringMapper authoringMapper) {
    this.studioService = studioService;
    this.authoringMapper = authoringMapper;
  }

  /**
   * Drafts the caller may read. {@code q}, {@code environment}, {@code lastRun} and {@code sort}
   * (Story 10.46) are optional; an unknown {@code lastRun} or {@code sort} is {@code 400
   * INVALID_QUERY}. Default order {@code updatedAt,desc}, ties broken by id.
   */
  @GetMapping("/tests")
  public ResponseEntity<Map<String, Object>> listTests(
      @RequestParam(required = false) String csiId,
      @RequestParam(required = false) String environment,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String lastRun,
      @RequestParam(required = false) String sort,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    StudioListQuery.Tests query = StudioListQuery.Tests.parse(csiId, environment, q, lastRun, sort);
    Page<UITestDto> result = studioService.listTests(query, page, size, auth);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @PostMapping("/tests")
  public ResponseEntity<?> createTest(@RequestBody JsonNode body, Authentication auth) {
    StudioAuthoringMapper.ParsedWrite write = authoringMapper.read(body, false);
    StudioService.AuthoringDraft created =
        studioService.createAuthoringDraft(write.metadata(), write.authoring(), auth);
    return ResponseEntity.created(URI.create("/api/v1/studio/tests/" + created.test().id()))
        .body(authoringMapper.response(created));
  }

  @GetMapping("/tests/{id}")
  public ResponseEntity<?> findTestById(@PathVariable UUID id, Authentication auth) {
    return ResponseEntity.ok(authoringMapper.response(studioService.readAuthoringDraft(id, auth)));
  }

  @PutMapping("/tests/{id}")
  public ResponseEntity<?> updateTest(
      @PathVariable UUID id, @RequestBody JsonNode body, Authentication auth) {
    StudioAuthoringMapper.ParsedWrite write = authoringMapper.read(body, true);
    return ResponseEntity.ok(
        authoringMapper.response(
            studioService.updateAuthoringDraft(id, write.metadata(), write.authoring(), auth)));
  }

  /**
   * Soft-deletes a draft. Owners and explicitly authorized administrators of its CSI only; an
   * unknown, already deleted or quarantined draft is refused exactly like a draft the caller may
   * not write (ADR-002 §27.2).
   */
  @DeleteMapping("/tests/{id}")
  public ResponseEntity<Void> deleteTest(@PathVariable UUID id, Authentication auth) {
    studioService.softDeleteTest(id, auth);
    return ResponseEntity.noContent().build();
  }

  /**
   * Accepts an execution (AC-7 – AC-11). Owners and explicitly authorized administrators of the
   * test's CSI may execute (§9.1); every other caller receives the same {@code 403} as for an
   * unknown test id (Story 10.48, ADR-002 O-22).
   *
   * <p>STUDIO-OBS-014 AC-9 (AR-3): the {@code Idempotency-Key} header is mandatory on this route.
   * An absent header is refused here, before any write, with {@code 400 IDEMPOTENCY_KEY_REQUIRED}.
   * A malformed or blank header never reaches this method: the platform {@code IdempotencyFilter}
   * refuses it first with {@code 400 INVALID_IDEMPOTENCY_KEY}. The header stays {@code required =
   * false} on purpose, so the refusal is this route's own code and no global handler changes; the
   * service keeps accepting a null key for its internal, non-HTTP callers.
   */
  @PostMapping("/tests/{id}/execute")
  public ResponseEntity<Map<String, Object>> executeTest(
      @PathVariable UUID id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      Authentication auth,
      jakarta.servlet.http.HttpServletRequest request) {
    if (idempotencyKey == null || idempotencyKey.isBlank()) {
      throw new StudioValidationException(
          "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
    }
    ExecutionSnapshotDto execution = studioService.executeTest(id, auth, idempotencyKey, request);
    return ResponseEntity.accepted()
        .body(Map.of("executionId", execution.executionId(), "status", execution.status()));
  }

  /**
   * One execution snapshot, authorized against the execution's own immutable CSI — never the parent
   * test's current value, and equally for a soft-deleted test (AC-4a).
   */
  @GetMapping("/executions/{id}")
  public ResponseEntity<ExecutionSnapshotDto> findExecutionById(
      @PathVariable UUID id, Authentication auth) {
    return ResponseEntity.ok(studioService.readExecution(id, auth));
  }

  /**
   * Cancels an execution (Studio v1 WP4). {@code 202} with the snapshot as committed: already
   * {@code ERROR / CANCELLED} for queued work, still running for dispatched work, whose terminal
   * snapshot follows on the ordinary read and stream. {@code 409} when the outcome is already known
   * or a cancel was already asked for; {@code 403} for an unknown id and for a CSI the caller may
   * not write, alike.
   */
  @PostMapping("/executions/{id}/cancel")
  public ResponseEntity<ExecutionSnapshotDto> cancelExecution(
      @PathVariable UUID id, Authentication auth) {
    return ResponseEntity.accepted().body(studioService.cancelExecution(id, auth));
  }

  /**
   * Every filter is optional; every result is scoped by the execution's own CSI (AC-14), and {@code
   * csiId} only narrows that scope. An unknown {@code status} or {@code sort} is {@code 400
   * INVALID_QUERY}. Default order {@code acceptedAt,desc}, ties broken by id (Story 10.46).
   */
  @GetMapping("/executions")
  public ResponseEntity<Map<String, Object>> listExecutions(
      @RequestParam(required = false) UUID testId,
      @RequestParam(required = false) String csiId,
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String sort,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    StudioListQuery.Executions query =
        StudioListQuery.Executions.parse(testId, csiId, status, q, sort);
    Page<ExecutionSnapshotDto> result = studioService.listExecutions(query, page, size, auth);
    return ResponseEntity.ok(toExecutionEnvelope(result));
  }

  /**
   * Checks the draft's {@code <var NAME>} / {@code <secret ID>} references against its declared
   * variables, with optional caller-supplied plain values ({@code {"variables": {NAME: value}}}).
   * Read authorization is the test read's. Supplied values are checked for presence only and are
   * never echoed. {@code valid} is kept alongside {@code isValid} for existing callers.
   */
  @PostMapping("/tests/{id}/validate-variables")
  public ResponseEntity<Map<String, Object>> validateVariables(
      @PathVariable UUID id,
      @RequestBody(required = false) Map<String, Object> body,
      Authentication auth) {
    UITestDto test = studioService.findTestById(id, auth);
    VariableReferenceValidator.Result result =
        VariableReferenceValidator.validate(test.steps(), test.variables(), suppliedValues(body));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("testId", id);
    response.put("isValid", result.isValid());
    response.put("valid", result.isValid());
    response.put("hasVariables", !test.variables().isEmpty());
    response.put("missing", result.missing());
    response.put("undeclared", result.undeclared());
    response.put("unvalued", result.unvalued());
    response.put("conflicting", result.conflicting());
    response.put("unused", result.unused());
    return ResponseEntity.ok(response);
  }

  private static Map<String, ?> suppliedValues(Map<String, Object> body) {
    if (body == null || !(body.get("variables") instanceof Map<?, ?> variables)) {
      return Map.of();
    }
    Map<String, Object> supplied = new LinkedHashMap<>();
    variables.forEach((name, value) -> supplied.put(String.valueOf(name), value));
    return supplied;
  }

  private Map<String, Object> toEnvelope(Page<UITestDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }

  @org.springframework.web.bind.annotation.ExceptionHandler(
      com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
  public ResponseEntity<Map<String, Object>> observedRefusal(
      com.citi.put.checks.studio.guided.session.GuidedSessionException failure) {
    return ResponseEntity.status(failure.status())
        .body(Map.of("code", failure.getMessage(), "message", "Observed execution refused"));
  }

  private Map<String, Object> toExecutionEnvelope(Page<ExecutionSnapshotDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
