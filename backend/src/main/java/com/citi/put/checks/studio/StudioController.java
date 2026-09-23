package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.CompileAcceptedDto;
import com.citi.put.checks.studio.dto.ConfirmCompileRequestDto;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.StudioAuthoringMapper;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.validation.VariableReferenceValidator;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
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
 * <p>Unversioned requests retain legacy adaptation. Explicit v2 bodies use the strict authoring
 * mapper; neither route accepts executable code.
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

  @GetMapping("/tests")
  public ResponseEntity<Map<String, Object>> listTests(
      @RequestParam(required = false) String csiId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    Page<UITestDto> result = studioService.listTests(csiId, page, size, auth);
    return ResponseEntity.ok(toEnvelope(result));
  }

  @PostMapping("/tests")
  public ResponseEntity<?> createTest(@RequestBody JsonNode body, Authentication auth) {
    if (body.has("authoringSchemaVersion")) {
      StudioAuthoringMapper.ParsedWrite write = authoringMapper.read(body, false);
      StudioService.AuthoringDraft created =
          studioService.createAuthoringDraft(write.metadata(), write.authoring(), auth);
      return ResponseEntity.created(URI.create("/api/v1/studio/tests/" + created.test().id()))
          .body(authoringMapper.response(created));
    }
    UITestDto created = studioService.createTest(authoringMapper.legacy(body), auth);
    return ResponseEntity.created(URI.create("/api/v1/studio/tests/" + created.id())).body(created);
  }

  /** Version negotiation is explicit; an ordinary GET retains the frozen v1 projection. */
  @GetMapping("/tests/{id}")
  public ResponseEntity<?> findTestById(
      @PathVariable UUID id,
      @RequestParam(required = false) Integer authoringSchemaVersion,
      Authentication auth) {
    if (authoringSchemaVersion != null) {
      if (authoringSchemaVersion != 2) {
        throw new StudioValidationException("INVALID_AUTHORING", "Unsupported authoring version");
      }
      return ResponseEntity.ok(
          authoringMapper.response(studioService.readAuthoringDraft(id, auth)));
    }
    return ResponseEntity.ok(studioService.findTestById(id, auth));
  }

  @PutMapping("/tests/{id}")
  public ResponseEntity<?> updateTest(
      @PathVariable UUID id, @RequestBody JsonNode body, Authentication auth) {
    if (body.has("authoringSchemaVersion")) {
      StudioAuthoringMapper.ParsedWrite write = authoringMapper.read(body, true);
      return ResponseEntity.ok(
          authoringMapper.response(
              studioService.updateAuthoringDraft(id, write.metadata(), write.authoring(), auth)));
    }
    return ResponseEntity.ok(studioService.updateTest(id, authoringMapper.legacy(body), auth));
  }

  /**
   * Enqueues compilation of the current source (Story 10.8 AC-1; Architecture §8.3).
   *
   * <p>{@code 202} says the compile request was <em>recorded</em>, not that a model was reached:
   * acceptance and execution are separate events, so pool saturation, the gateway bulkhead and the
   * per-attempt budget all surface asynchronously as {@code compileStatus: STALE} with a {@code
   * compileError} the authoring UI reads, and never as a status code here.
   *
   * <p>The refusals are ordered by ADR-002 §14.4 — {@code 401}/{@code 403}, then {@code 409} for a
   * soft-deleted or quarantined draft, then {@code 400} for an authoring bound or an inline
   * credential — and every one of them leaves the draft's compile state exactly where it was.
   */
  @PostMapping("/tests/{id}/compile")
  public ResponseEntity<CompileAcceptedDto> compileTest(
      @PathVariable UUID id, Authentication auth) {
    return ResponseEntity.accepted().body(studioService.compileTest(id, auth));
  }

  /**
   * Confirms exactly the candidate the author reviewed (Story 10.9 AC-1; Architecture §4.2, §8.3).
   *
   * <p>The body is the frozen four-field one and every field is load-bearing: the confirmation is
   * decided by two conditional statements that name all four, so a stale tab approving a newer
   * artifact, an edit made underneath a review and a second confirmation of an already-confirmed
   * revision are all {@code 409 STALE_CANDIDATE} with nothing written.
   *
   * <p>The refusals are ordered by ADR-002 §14.4 — {@code 401}/{@code 403} first, so a caller who
   * may not act on the draft's CSI never learns whether it exists, then {@code 409} for a
   * soft-deleted or quarantined draft, then the confirmation itself. The one documented exception
   * is bean validation: {@code @Valid} runs during argument resolution and so a malformed body is
   * {@code 400} before authorization. That discloses nothing, because it answers identically for an
   * id that never existed.
   *
   * <p>{@code 200} carries the committed draft, re-read after the transaction — not the state the
   * caller asked for.
   *
   * @param id the draft whose candidate is being confirmed
   * @param request the frozen {@code ConfirmCompileRequest} body
   * @param auth the caller
   * @return the confirmed draft
   */
  @PostMapping("/tests/{id}/confirm-compile")
  public ResponseEntity<UITestDto> confirmCompile(
      @PathVariable UUID id,
      @Valid @RequestBody ConfirmCompileRequestDto request,
      Authentication auth) {
    return ResponseEntity.ok(studioService.confirmCompile(id, request, auth));
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

  /** Accepts an execution (AC-7 – AC-11) from any authenticated application user. */
  @PostMapping("/tests/{id}/execute")
  public ResponseEntity<Map<String, Object>> executeTest(
      @PathVariable UUID id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      Authentication auth) {
    ExecutionSnapshotDto execution = studioService.executeTest(id, auth, idempotencyKey);
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
    return ResponseEntity.ok(studioService.findExecutionById(id, auth));
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

  /** {@code testId} is optional; every result is scoped by the execution's own CSI (AC-14). */
  @GetMapping("/executions")
  public ResponseEntity<Map<String, Object>> listExecutions(
      @RequestParam(required = false) UUID testId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "20") int size,
      Authentication auth) {
    Page<ExecutionSnapshotDto> result = studioService.listExecutions(testId, page, size, auth);
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

  private Map<String, Object> toExecutionEnvelope(Page<ExecutionSnapshotDto> page) {
    return Map.of(
        "data", page.getContent(),
        "page", page.getNumber(),
        "size", page.getSize(),
        "totalElements", page.getTotalElements(),
        "totalPages", page.getTotalPages());
  }
}
