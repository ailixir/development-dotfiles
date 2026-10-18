package com.citi.put.checks.studio.guided.evidence;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedInternalSecurity;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Optional;
import org.springframework.security.core.Authentication;

/**
 * {@code POST /internal/v2/studio/guided-sessions/{id}/recording-evidence}: the owning worker
 * reports the settled fact of its session recording (STUDIO-OBS-013, ruling AR-1 R3).
 *
 * <p>The video is finalized only when the browser context closes, which happens after the session
 * is terminal. So, unlike every other bridge route, this one accepts a session in <b>any</b> state,
 * terminal included, and never calls the session service's {@code active()} gate. It reports a
 * fact; it acts on no one's behalf and never revives authority: the session document, its progress,
 * owner and lease are not modified (the {@code reconcileLateModelUsage} precedent).
 *
 * <p>What bounds acceptance instead:
 *
 * <ol>
 *   <li>the {@code owning-worker} role, and the caller's subject equal to the session's recorded
 *       owner;
 *   <li>the fence: {@code X-Owner-Fence} == body {@code ownerFence} == the session owner's fence,
 *       and the body's context identity equal to the context materialized for that fence. Lease
 *       liveness is <b>not</b> checked (the lease stops renewing at stop);
 *   <li>the window, on the database clock: {@code clock_timestamp() < sessions.expires_at +
 *       settle-grace};
 *   <li>write-once: one fact per session; a same-key, same-body resend returns the stored echo.
 * </ol>
 *
 * <p>The body carries pattern-bounded IDs, integers and enums only: no key, no URL, no timestamp,
 * no text. Keys are derived here from the session's {@code scope.csiId} and id.
 */
public class GuidedSessionEvidenceService {

  /** The bridge route name, also the idempotency namespace route. */
  public static final String ROUTE = "recording-evidence";

  /** The mapping under {@code /internal/v2/studio/guided-sessions/{id}}. */
  public static final String ROUTE_PATH = "/" + ROUTE;

  private static final String SCHEMA = "v3/bridge#/definitions/recordingEvidence";

  private final GuidedSessionRepository sessions;
  private final GuidedSessionEvidenceRepository evidence;
  private final GuidedMaterializationService materialization;
  private final GuidedContracts contracts;
  private final GuidedRecordingProperties properties;
  private final StudioExecutionProperties execution;

  public GuidedSessionEvidenceService(
      GuidedSessionRepository sessions,
      GuidedSessionEvidenceRepository evidence,
      GuidedMaterializationService materialization,
      GuidedContracts contracts,
      GuidedRecordingProperties properties,
      StudioExecutionProperties execution) {
    this.sessions = sessions;
    this.evidence = evidence;
    this.materialization = materialization;
    this.contracts = contracts;
    this.properties = properties;
    this.execution = execution;
  }

  /**
   * Accepts one recording fact.
   *
   * @param caller the authenticated internal caller
   * @param id the session id from the path
   * @param fence the {@code X-Owner-Fence} header
   * @param key the {@code Idempotency-Key} header
   * @param request the strictly parsed body
   * @return the echo of the accepted request (202)
   */
  public JsonNode record(
      Authentication caller, String id, Long fence, String key, JsonNode request) {
    GuidedInternalSecurity.requireRole(caller, "owning-worker");
    require(key != null && !key.isBlank() && key.length() <= 256, "INVALID_CONTRACT", 422);
    require(fence != null, "INVALID_CONTRACT", 422);
    require(request.path("schemaVersion").asInt() == 3, "RUNTIME_INCOMPATIBLE", 409);
    contracts.validate(SCHEMA, request);
    require(id.equals(request.path("sessionId").asText()), "INVALID_CONTRACT", 422);

    return sessions.transaction(
        () -> {
          var session = sessions.lock(id);
          JsonNode document = session.document();
          JsonNode owner = document.path("owner");

          // Identity first, as every internal route does, so a replay of someone else's key by a
          // different caller is refused rather than echoed.
          require(
              document.path("scopeHash").equals(request.path("scopeHash")), "FORBIDDEN_SCOPE", 403);
          require(
              caller.getName().equals(owner.path("workerId").asText())
                  && request.path("workerId").asText().equals(owner.path("workerId").asText()),
              "FORBIDDEN_SCOPE",
              403);
          long ownerFence = owner.path("fence").asLong();
          require(
              fence == ownerFence && request.path("ownerFence").asLong() == ownerFence,
              "STALE_FENCE",
              409);
          require(
              document.path("versions").equals(request.path("versions")),
              "RUNTIME_INCOMPATIBLE",
              409);
          var context =
              evidence
                  .materialization(id)
                  .orElseThrow(() -> new GuidedSessionException("STALE_FENCE", 409));
          require(
              context.workerId().equals(owner.path("workerId").asText())
                  && context.ownerFence() == ownerFence
                  && context.contextId().equals(request.path("contextId").asText())
                  && materialization
                      .acceptedContextRevisions(id, context.contextRevision())
                      .contains(request.path("contextRevision").asInt())
                  && context.sourceRevision().equals(request.path("sourceRevision").asText())
                  && context
                      .configurationRevision()
                      .equals(request.path("configurationRevision").asText()),
              "STALE_FENCE",
              409);

          String digest = GuidedContracts.hash(request);
          JsonNode duplicate = sessions.duplicate(id, ROUTE, key, digest);
          if (duplicate != null) {
            // The stored echo comes back from jsonb, which reorders keys. Answer it in canonical-v1
            // order, as the first acceptance does, so a same-key resend is byte-identical (AR-1
            // R3: "Same key + same body -> 202 with the identical stored echo").
            return canonicalCopy(duplicate);
          }

          // No state check and no active(): a terminal session is accepted. The window is judged
          // on the database clock only.
          require(
              evidence.withinAcceptanceWindow(id, properties.settleGraceSeconds()), "EXPIRED", 409);
          require(!evidence.recorded(id), "IDEMPOTENCY_CONFLICT", 409);

          String state = projected(request.path("state").asText());
          // The schema's allOf states this too; repeated here so the refusal is a 422, not a
          // CHECK violation surfacing as a storage failure.
          require(
              state.equals("AVAILABLE")
                  || (!request.path("partial").asBoolean() && request.path("timings").isEmpty()),
              "INVALID_CONTRACT",
              422);
          var timings =
              GuidedRecordingTimings.acceptAndDerive(
                  request.path("timings"), evidence.ledger(id), limits(document));
          Optional<GuidedRecordingKeys.Keys> keys =
              GuidedRecordingKeys.derive(document.path("scope").path("csiId").asText(null), id);
          require(keys.isPresent(), "INVALID_CONTRACT", 422);

          evidence.insert(
              id,
              document.path("scopeHash").asText(),
              request.path("recordingId").asText(),
              owner.path("workerId").asText(),
              Math.toIntExact(ownerFence),
              state,
              request.path("partial").asBoolean(),
              keys.get(),
              timings.toString(),
              execution.evidenceRetentionOrDefault().toSeconds());
          JsonNode echo = canonicalCopy(request);
          sessions.command(id, ROUTE, key, digest, echo);
          return echo;
        });
  }

  /** The node re-read from its canonical-v1 bytes: keys in canonical order, values unchanged. */
  private JsonNode canonicalCopy(JsonNode node) {
    return contracts.parse(GuidedContracts.canonical(node));
  }

  /** RunnerEvidence vocabulary to the storable subset of VideoStatus. */
  private static String projected(String runnerState) {
    return switch (runnerState) {
      case "STORED" -> "AVAILABLE";
      case "FAILED" -> "FAILED";
      case "UNAVAILABLE" -> "UNAVAILABLE";
      default -> throw new GuidedSessionException("INVALID_CONTRACT", 422);
    };
  }

  private static GuidedRecordingTimings.Limits limits(JsonNode document) {
    JsonNode limits = document.path("limits");
    require(
        limits.path("maxSessionSeconds").canConvertToLong()
            && limits.path("maxActions").canConvertToLong()
            && limits.path("maxSourceSteps").canConvertToLong(),
        "RUNTIME_INCOMPATIBLE",
        409);
    return new GuidedRecordingTimings.Limits(
        limits.path("maxSessionSeconds").asLong(),
        limits.path("maxActions").asLong(),
        limits.path("maxSourceSteps").asLong());
  }
}
