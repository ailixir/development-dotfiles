package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance;
import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance.Guard;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Persistence only. Callers hold session then source locks and join existing budget/admission work.
 */
public final class GuidedTranslationStore {
  private final JdbcTemplate jdbc;
  private final GuidedContracts contracts;

  public GuidedTranslationStore(JdbcTemplate jdbc, GuidedContracts contracts) {
    this.jdbc = jdbc;
    this.contracts = contracts;
  }

  static void transaction() {
    require(
        TransactionSynchronizationManager.isActualTransactionActive(), "RUNTIME_INCOMPATIBLE", 409);
  }

  private static void bounded(JsonNode node, int max) {
    require(node != null && node.isObject(), "INVALID_CONTRACT", 422);
    require(
        GuidedContracts.canonical(node).getBytes(java.nio.charset.StandardCharsets.UTF_8).length
            <= max,
        "INVALID_CONTRACT",
        422);
  }

  public boolean exists(String sessionId) {
    transaction();
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS(SELECT 1 FROM studio_guided_translation_state WHERE session_id=?)",
            Boolean.class,
            sessionId));
  }

  public void initialize(JsonNode session, JsonNode approvedManifest) {
    transaction();
    bounded(approvedManifest, 1048576);
    require(
        approvedManifest.path("testId").equals(session.path("testId"))
            && approvedManifest
                .path("sourceRevision")
                .equals(session.path("scope").path("sourceRevision"))
            && approvedManifest
                .path("configurationRevision")
                .equals(session.path("scope").path("configurationRevision")),
        "REVISION_CONFLICT",
        409);
    String id = session.path("sessionId").asText();
    if (exists(id)) {
      require(state(id).path("manifest").equals(approvedManifest), "REVISION_CONFLICT", 409);
      return;
    }
    jdbc.update(
        "INSERT INTO studio_guided_source_manifests(session_id,scope_"
            + "hash,manifest,manifest_hash)"
            + " VALUES (?,?,?::jsonb,?)",
        id,
        session.path("scopeHash").asText(),
        approvedManifest.toString(),
        GuidedContracts.hash(approvedManifest));
    jdbc.update("INSERT INTO studio_guided_translation_state(session_id) VALUES (?)", id);
  }

  /** Production-only initialization under the same locked current source transaction. */
  public void initialize(JsonNode session, JsonNode manifest, boolean acquisition) {
    transaction();
    boolean existed = exists(session.path("sessionId").asText());
    initialize(session, manifest);
    if (acquisition && !existed) {
      ObjectNode marker = newAcquisition(session);
      jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " progress=jsonb_set(progress,'{translationAcquisition}',?::jsonb) WHERE"
              + " session_id=?",
          marker.toString(),
          session.path("sessionId").asText());
    }
  }

  /** This is current locked configuration, never a manufactured source-manifest field. */
  public long stepTimeoutMillis(JsonNode session) {
    transaction();
    var rows =
        jdbc.queryForList(
            "SELECT timeout_seconds,source_revision,configuration_revisio"
                + "n FROM ui_tests WHERE id=?"
                + " AND deleted_at IS NULL AND quarantined_at IS NULL FOR UPDATE",
            UUID.fromString(session.path("testId").asText()));
    require(rows.size() == 1, "MISSING_SOURCE", 409);
    var row = rows.getFirst();
    require(
        row.get("source_revision")
                .toString()
                .equals(session.path("scope").path("sourceRevision").asText())
            && row.get("configuration_revision")
                .toString()
                .equals(session.path("scope").path("configurationRevision").asText()),
        "REVISION_CONFLICT",
        409);
    long seconds = ((Number) row.get("timeout_seconds")).longValue();
    require(seconds >= 1 && seconds <= 120, "INVALID_CONTRACT", 422);
    return seconds * 1000;
  }

  public Instant acquisitionNow() {
    transaction();
    return jdbc.queryForObject("SELECT clock_timestamp()", Timestamp.class).toInstant();
  }

  public enum AcquisitionDisposition {
    READY,
    WAIT,
    POLL,
    REFUSED
  }

  public record AcquisitionClaim(
      AcquisitionDisposition disposition,
      JsonNode request,
      String key,
      String windowId,
      long pollNumber,
      Instant deadline,
      long remainingMs,
      String errorCode) {
    public AcquisitionClaim {
      request = request == null ? null : request.deepCopy();
    }

    @Override
    public JsonNode request() {
      return request == null ? null : request.deepCopy();
    }
  }

  private AcquisitionClaim acquisitionResult(AcquisitionDisposition disposition, String error) {
    return new AcquisitionClaim(disposition, null, null, null, 0, null, 0, error);
  }

  private ObjectNode newAcquisition(JsonNode session) {
    ObjectNode marker =
        contracts
            .object()
            .put("version", 1)
            .put("policy", "passive-target-1")
            .put("allowanceMs", stepTimeoutMillis(session))
            .put("totalExtraPolls", 0)
            .putNull("active");
    marker.set("sourceRevision", session.path("scope").path("sourceRevision"));
    marker.set("configurationRevision", session.path("scope").path("configurationRevision"));
    return marker;
  }

  public boolean acquisitionPending(
      com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session current) {
    JsonNode active = current.progress().path("translationAcquisition").path("active");
    return active.isObject() && active.path("pending").isObject();
  }

  public boolean acquisitionOpen(
      com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session current) {
    JsonNode active = current.progress().path("translationAcquisition").path("active");
    return active.isObject()
        && (active.path("window").isObject() || active.path("pending").isObject());
  }

  private static void closedAcquisition(JsonNode node, String... keys) {
    require(node.isObject(), "INVALID_CONTRACT", 422);
    var fields = new HashSet<String>();
    node.fieldNames().forEachRemaining(fields::add);
    require(fields.equals(Set.of(keys)), "INVALID_CONTRACT", 422);
  }

  private static long acquisitionNumber(JsonNode node, String key, long maximum) {
    JsonNode value = node.path(key);
    require(
        value.isIntegralNumber()
            && value.canConvertToLong()
            && value.asLong() >= 0
            && value.asLong() <= maximum,
        "INVALID_CONTRACT",
        422);
    return value.asLong();
  }

  private static String acquisitionTime(Instant value) {
    return new java.time.format.DateTimeFormatterBuilder()
        .appendInstant(3)
        .toFormatter()
        .format(value.truncatedTo(java.time.temporal.ChronoUnit.MILLIS));
  }

  private static Instant acquisitionInstant(JsonNode node, String field) {
    require(node.path(field).isTextual(), "INVALID_CONTRACT", 422);
    try {
      return Instant.parse(node.path(field).asText());
    } catch (java.time.format.DateTimeParseException invalid) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "INVALID_CONTRACT", 422);
    }
  }

  private void saveAcquisition(
      com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session current,
      ObjectNode marker) {
    bounded(marker, 16384);
    current.progress().set("translationAcquisition", marker);
    require(
        jdbc.update(
                "UPDATE studio_guided_sessions SET progress=?::jsonb WHERE session_id=?",
                current.progress().toString(),
                current.document().path("sessionId").asText())
            == 1,
        "MISSING_SOURCE",
        409);
  }

  private ObjectNode acquisitionBook(
      com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session current,
      JsonNode state,
      JsonNode obligation,
      boolean available) {
    JsonNode stored = current.progress().path("translationAcquisition");
    if (!stored.isObject()) {
      if (available) {
        return null;
      }
      Integer effects =
          jdbc.queryForObject(
              "SELECT count(*) FROM studio_guided_actions WHERE session_id=?",
              Integer.class,
              current.document().path("sessionId").asText());
      require(effects != null && effects == 0, "RUNTIME_INCOMPATIBLE", 409);
      stored = newAcquisition(current.document());
    }
    ObjectNode marker = (ObjectNode) stored.deepCopy();
    closedAcquisition(
        marker,
        "version",
        "policy",
        "sourceRevision",
        "configurationRevision",
        "allowanceMs",
        "totalExtraPolls",
        "active");
    require(
        marker.path("version").isIntegralNumber()
            && marker.path("version").asInt() == 1
            && marker.path("policy").asText().equals("passive-target-1"),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        marker
                .path("sourceRevision")
                .equals(current.document().path("scope").path("sourceRevision"))
            && marker
                .path("configurationRevision")
                .equals(current.document().path("scope").path("configurationRevision")),
        "REVISION_CONFLICT",
        409);
    long allowance = acquisitionNumber(marker, "allowanceMs", 120000);
    require(
        allowance >= 1000 && allowance == stepTimeoutMillis(current.document()),
        "REVISION_CONFLICT",
        409);
    acquisitionNumber(marker, "totalExtraPolls", 200);
    int stepIndex = current.progress().path("stepIndex").asInt(0);
    JsonNode step = current.document().path("sourceSteps").path(stepIndex);
    require(step.path("stepId").equals(obligation.path("stepId")), "BINDING_ORDER", 422);
    JsonNode old = marker.path("active");
    if (old.isNull() || old.path("stepIndex").asInt(-1) < stepIndex) {
      require(
          old.isNull() || old.path("window").isNull() && old.path("pending").isNull(),
          "BINDING_ORDER",
          422);
      ObjectNode fresh =
          marker
              .putObject("active")
              .put("stepId", step.path("stepId").asText())
              .put("stepIndex", stepIndex)
              .put("usedMs", 0)
              .put("extraPolls", 0)
              .putNull("lastObservationHash")
              .put(
                  "lastSemanticHash",
                  GuidedAcquisitionFingerprint.hash(current.progress().path("observation")))
              .put("unchangedRefreshes", 0)
              .putNull("stableSemanticHash")
              .put("lastGeneration", current.progress().path("generation").asInt(0))
              .put("nextPollAt", acquisitionTime(Instant.EPOCH))
              .putNull("window")
              .putNull("pending");
      acquisitionIdentity(fresh, current.document(), state, obligation);
    }
    ObjectNode active = (ObjectNode) marker.path("active");
    closedAcquisition(
        active,
        "stepId",
        "stepIndex",
        "usedMs",
        "extraPolls",
        "planRevision",
        "planHash",
        "obligationId",
        "targetIntentHash",
        "workerId",
        "ownerFence",
        "lastObservationHash",
        "lastSemanticHash",
        "unchangedRefreshes",
        "stableSemanticHash",
        "lastGeneration",
        "nextPollAt",
        "window",
        "pending");
    require(
        active.path("stepId").equals(step.path("stepId"))
            && acquisitionNumber(active, "stepIndex", 99) == stepIndex,
        "BINDING_ORDER",
        422);
    acquisitionNumber(active, "usedMs", allowance);
    acquisitionNumber(active, "extraPolls", 32);
    acquisitionNumber(active, "lastGeneration", Integer.MAX_VALUE);
    if (active.path("window").isObject() || active.path("pending").isObject()) {
      ObjectNode identity = contracts.object();
      acquisitionIdentity(identity, current.document(), state, obligation);
      for (var fields = identity.fields(); fields.hasNext(); ) {
        var field = fields.next();
        require(active.path(field.getKey()).equals(field.getValue()), "STALE_GENERATION", 409);
      }
    } else {
      require(
          active.path("window").isNull() && active.path("pending").isNull(),
          "INVALID_CONTRACT",
          422);
      ObjectNode identity = contracts.object();
      acquisitionIdentity(identity, current.document(), state, obligation);
      if (!active.path("targetIntentHash").equals(identity.path("targetIntentHash"))
          || !GuidedContracts.same(active.path("workerId"), identity.path("workerId"))
          || !GuidedContracts.same(active.path("ownerFence"), identity.path("ownerFence"))) {
        active
            .put(
                "lastSemanticHash",
                GuidedAcquisitionFingerprint.hash(current.progress().path("observation")))
            .put("unchangedRefreshes", 0)
            .putNull("stableSemanticHash");
      }
      acquisitionIdentity(active, current.document(), state, obligation);
    }
    JsonNode window = active.path("window"), pending = active.path("pending");
    if (window.isObject()) {
      closedAcquisition(
          window, "windowId", "openedAt", "deadline", "reservedMs", "lastCheckedAt", "uncertain");
      long reserved = acquisitionNumber(window, "reservedMs", allowance);
      require(
          reserved > 0
              && reserved <= active.path("usedMs").asLong()
              && window.path("uncertain").isBoolean(),
          "INVALID_CONTRACT",
          422);
      require(
          acquisitionInstant(window, "deadline")
                  .equals(acquisitionInstant(window, "openedAt").plusMillis(reserved))
              && !acquisitionInstant(window, "lastCheckedAt")
                  .isBefore(acquisitionInstant(window, "openedAt")),
          "INVALID_CONTRACT",
          422);
    } else {
      require(window.isNull(), "INVALID_CONTRACT", 422);
    }
    if (pending.isObject()) {
      closedAcquisition(
          pending, "pollNumber", "expectedGeneration", "refreshKey", "request", "requestHash");
      require(
          window.isObject()
              && acquisitionNumber(pending, "pollNumber", marker.path("totalExtraPolls").asLong())
                  > 0,
          "INVALID_CONTRACT",
          422);
      acquisitionNumber(pending, "expectedGeneration", Integer.MAX_VALUE - 1);
      acquisitionRequestIdentity(current.document(), pending.path("request"));
      require(
          pending.path("refreshKey").isTextual()
              && !pending.path("refreshKey").asText().isBlank()
              && pending.path("refreshKey").asText().length() <= 256
              && GuidedContracts.hash(pending.path("request"))
                  .equals(pending.path("requestHash").asText())
              && pending
                  .path("request")
                  .path("expectedGeneration")
                  .equals(pending.path("expectedGeneration")),
          "INVALID_CONTRACT",
          422);
    } else {
      require(pending.isNull(), "INVALID_CONTRACT", 422);
    }
    acquisitionInstant(active, "nextPollAt");
    return marker;
  }

  private void acquisitionRequestIdentity(JsonNode session, JsonNode request) {
    contracts.validate("v3/observation-refresh", request);
    for (String field : List.of("schemaVersion", "sessionId", "scopeHash", "versions")) {
      require(request.path(field).equals(session.path(field)), "STALE_GENERATION", 409);
    }
    require(
        request.path("workerId").equals(session.path("owner").path("workerId"))
            && request.path("ownerFence").equals(session.path("owner").path("fence"))
            && request.path("sourceRevision").equals(session.path("scope").path("sourceRevision"))
            && request
                .path("configurationRevision")
                .equals(session.path("scope").path("configurationRevision")),
        "STALE_GENERATION",
        409);
  }

  /**
   * What an acquisition waits for: the bare label, plus the qualifying region and the accepted
   * selection (role, name, evidence) when the obligation has them. An unqualified obligation keeps
   * its original value.
   */
  static JsonNode acquisitionTarget(JsonNode obligation) {
    boolean qualified = obligation.path("scopeIntent").isTextual();
    if (!qualified && !obligation.has("selection")) {
      return obligation.path("targetIntent");
    }
    var identity =
        com.fasterxml.jackson.databind.node.JsonNodeFactory.instance
            .arrayNode()
            .add(obligation.path("targetIntent"));
    if (qualified) {
      identity.add(obligation.path("scopeIntent"));
    }
    if (obligation.has("selection")) {
      identity.add(obligation.path("selection"));
    }
    return identity;
  }

  private static void acquisitionIdentity(
      ObjectNode active, JsonNode session, JsonNode state, JsonNode obligation) {
    active
        .put("planRevision", state.path("planRevision").asText())
        .put("planHash", GuidedContracts.hash(state.path("plan")))
        .put("obligationId", obligation.path("obligationId").asText())
        .put("targetIntentHash", GuidedContracts.hash(acquisitionTarget(obligation)));
    active.set("workerId", session.path("owner").path("workerId"));
    active.set("ownerFence", session.path("owner").path("fence"));
  }

  /** Caller holds session/source locks; a REFUSED result commits prior reservations. */
  public AcquisitionClaim acquire(
      com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session current,
      JsonNode state,
      JsonNode obligation,
      boolean available,
      JsonNode freshRequest) {
    transaction();
    Instant now = acquisitionNow();
    ObjectNode marker = acquisitionBook(current, state, obligation, available);
    if (marker == null) {
      return acquisitionResult(AcquisitionDisposition.READY, null);
    }
    ObjectNode active = (ObjectNode) marker.path("active");
    JsonNode window = active.path("window"), pending = active.path("pending");
    String semantic = GuidedAcquisitionFingerprint.hash(current.progress().path("observation"));
    if (!semantic.equals(active.path("lastSemanticHash").asText())) {
      active
          .put("lastSemanticHash", semantic)
          .put("unchangedRefreshes", 0)
          .putNull("stableSemanticHash");
    }
    if (pending.isNull() && semantic.equals(active.path("stableSemanticHash").asText())) {
      closeAcquisitionWindow(active, now);
      saveAcquisition(current, marker);
      return acquisitionResult(AcquisitionDisposition.READY, null);
    }
    if (window.isObject()) {
      closedAcquisition(
          window, "windowId", "openedAt", "deadline", "reservedMs", "lastCheckedAt", "uncertain");
      require(window.path("uncertain").isBoolean(), "INVALID_CONTRACT", 422);
      long reserved = acquisitionNumber(window, "reservedMs", marker.path("allowanceMs").asLong());
      require(reserved > 0 && reserved <= active.path("usedMs").asLong(), "INVALID_CONTRACT", 422);
      if (now.isBefore(acquisitionInstant(window, "lastCheckedAt"))
          || !acquisitionInstant(window, "deadline").isAfter(now)) {
        GuidedGuardProvenance.observe(
            Guard.ACQUISITION_WINDOW, () -> current.document().path("sessionId").asText());
        saveAcquisition(current, marker);
        return acquisitionResult(AcquisitionDisposition.REFUSED, "BUDGET_EXCEEDED");
      }
      // Every live check is a wall-clock checkpoint, including cadence wait and pending recovery.
      ((ObjectNode) window).put("lastCheckedAt", acquisitionTime(now));
    }
    if (pending.isObject()) {
      require(window.isObject(), "INVALID_CONTRACT", 422);
      closedAcquisition(
          pending, "pollNumber", "expectedGeneration", "refreshKey", "request", "requestHash");
      acquisitionRequestIdentity(current.document(), pending.path("request"));
      require(
          GuidedContracts.hash(pending.path("request")).equals(pending.path("requestHash").asText())
              && pending
                  .path("request")
                  .path("expectedGeneration")
                  .equals(pending.path("expectedGeneration")),
          "INVALID_CONTRACT",
          422);
      ((ObjectNode) window).put("uncertain", true);
      saveAcquisition(current, marker);
      return acquisitionPoll(active, now);
    }
    require(pending.isNull(), "INVALID_CONTRACT", 422);
    if (available) {
      closeAcquisitionWindow(active, now);
      saveAcquisition(current, marker);
      return acquisitionResult(AcquisitionDisposition.READY, null);
    }
    if (window.isNull()) {
      long remaining = marker.path("allowanceMs").asLong() - active.path("usedMs").asLong();
      remaining =
          Math.min(
              remaining,
              java.time.Duration.between(
                      now, Instant.parse(current.document().path("expiresAt").asText()))
                  .toMillis());
      remaining =
          Math.min(
              remaining,
              java.time.Duration.between(
                      now,
                      Instant.parse(
                          current.document().path("owner").path("leaseExpiresAt").asText()))
                  .toMillis());
      if (remaining <= 0) {
        GuidedGuardProvenance.observe(
            Guard.ACQUISITION_REMAINING, () -> current.document().path("sessionId").asText());
        saveAcquisition(current, marker);
        return acquisitionResult(AcquisitionDisposition.REFUSED, "BUDGET_EXCEEDED");
      }
      active.put("usedMs", active.path("usedMs").asLong() + remaining);
      active
          .putObject("window")
          .put("windowId", UUID.randomUUID().toString())
          .put("openedAt", acquisitionTime(now))
          .put("deadline", acquisitionTime(now.plusMillis(remaining)))
          .put("reservedMs", remaining)
          .put("lastCheckedAt", acquisitionTime(now))
          .put("uncertain", false);
      active.put(
          "nextPollAt",
          acquisitionTime(now.plusMillis(active.path("extraPolls").asLong() == 0 ? 100 : 250)));
      window = active.path("window");
    }
    if (acquisitionInstant(active, "nextPollAt").isAfter(now)) {
      saveAcquisition(current, marker);
      return acquisitionResult(AcquisitionDisposition.WAIT, null);
    }
    JsonNode counts = current.document().path("counters"),
        limits = current.document().path("limits");
    if (active.path("extraPolls").asLong() >= 32
        || marker.path("totalExtraPolls").asLong() >= 200
        || counts.path("observations").asLong() >= limits.path("maxObservations").asLong()
        || limits.path("maxSanitizedEvidenceBytesTotal").asLong()
                - counts.path("sanitizedEvidenceBytes").asLong()
            < limits.path("maxObservationBytes").asLong()) {
      GuidedGuardProvenance.observe(
          Guard.ACQUISITION_POLL_LIMITS, () -> current.document().path("sessionId").asText());
      saveAcquisition(current, marker);
      return acquisitionResult(AcquisitionDisposition.REFUSED, "BUDGET_EXCEEDED");
    }
    acquisitionRequestIdentity(current.document(), freshRequest);
    require(
        freshRequest.path("expectedGeneration").equals(current.progress().path("generation")),
        "STALE_GENERATION",
        409);
    long poll = marker.path("totalExtraPolls").asLong() + 1;
    marker.put("totalExtraPolls", poll);
    active.put("extraPolls", active.path("extraPolls").asLong() + 1);
    String key = "acquire-" + window.path("windowId").asText() + "-" + poll;
    ObjectNode next =
        active
            .putObject("pending")
            .put("pollNumber", poll)
            .put("refreshKey", key)
            .put("requestHash", GuidedContracts.hash(freshRequest));
    next.set("expectedGeneration", freshRequest.path("expectedGeneration"));
    next.set("request", freshRequest.deepCopy());
    ((ObjectNode) window).put("lastCheckedAt", acquisitionTime(now));
    saveAcquisition(current, marker);
    continuation(current.document().path("sessionId").asText(), "REFRESH");
    return acquisitionPoll(active, now);
  }

  private AcquisitionClaim acquisitionPoll(ObjectNode active, Instant now) {
    JsonNode pending = active.path("pending"), window = active.path("window");
    return new AcquisitionClaim(
        AcquisitionDisposition.POLL,
        pending.path("request"),
        pending.path("refreshKey").asText(),
        window.path("windowId").asText(),
        pending.path("pollNumber").asLong(),
        acquisitionInstant(window, "deadline"),
        Math.max(
            0, java.time.Duration.between(now, acquisitionInstant(window, "deadline")).toMillis()),
        null);
  }

  private static void closeAcquisitionWindow(ObjectNode active, Instant now) {
    JsonNode window = active.path("window");
    if (window.isNull()) {
      return;
    }
    if (!window.path("uncertain").asBoolean()) {
      long elapsed =
          Math.max(
              0,
              java.time.Duration.between(acquisitionInstant(window, "openedAt"), now).toMillis()
                  + 1);
      long refund =
          window.path("reservedMs").asLong()
              - Math.min(window.path("reservedMs").asLong(), elapsed);
      active.put("usedMs", active.path("usedMs").asLong() - refund);
    }
    active.putNull("window");
  }

  public AcquisitionClaim settleAcquisition(
      com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session current,
      JsonNode state,
      JsonNode obligation,
      AcquisitionClaim claim,
      JsonNode response,
      boolean available) {
    transaction();
    Instant now = acquisitionNow();
    ObjectNode marker = acquisitionBook(current, state, obligation, false);
    ObjectNode active = (ObjectNode) marker.path("active");
    JsonNode window = active.path("window"), pending = active.path("pending");
    require(
        window.isObject()
            && pending.isObject()
            && window.path("windowId").asText().equals(claim.windowId())
            && pending.path("pollNumber").asLong() == claim.pollNumber()
            && pending.path("request").equals(claim.request())
            && pending.path("refreshKey").asText().equals(claim.key()),
        "STALE_GENERATION",
        409);
    if (!acquisitionInstant(window, "deadline").isAfter(now)
        || now.isBefore(acquisitionInstant(window, "lastCheckedAt"))) {
      GuidedGuardProvenance.observe(
          Guard.ACQUISITION_SETTLEMENT_WINDOW, () -> current.document().path("sessionId").asText());
      saveAcquisition(current, marker);
      return acquisitionResult(AcquisitionDisposition.REFUSED, "BUDGET_EXCEEDED");
    }
    JsonNode observation = response.path("observation");
    require(
        observation.path("generation").asLong() > pending.path("expectedGeneration").asLong()
            && GuidedContracts.same(
                observation.path("generation"), current.progress().path("generation"))
            && GuidedContracts.hash(observation)
                .equals(current.progress().path("observationHash").asText()),
        "STALE_GENERATION",
        409);
    active.putNull("pending");
    String semantic = GuidedAcquisitionFingerprint.hash(observation);
    int unchanged =
        !available && semantic.equals(active.path("lastSemanticHash").asText())
            ? active.path("unchangedRefreshes").asInt() + 1
            : 0;
    active.put("lastSemanticHash", semantic).put("unchangedRefreshes", unchanged);
    boolean stable = !available && unchanged >= 2;
    if (stable) {
      active.put("stableSemanticHash", semantic);
    } else {
      active.putNull("stableSemanticHash");
    }
    active.set("lastObservationHash", current.progress().path("observationHash"));
    active.set("lastGeneration", current.progress().path("generation"));
    active.put("nextPollAt", acquisitionTime(now.plusMillis(250)));
    ((ObjectNode) window).put("lastCheckedAt", acquisitionTime(now));
    if (available || stable) {
      closeAcquisitionWindow(active, now);
    }
    saveAcquisition(current, marker);
    continuation(current.document().path("sessionId").asText(), "NEXT");
    return acquisitionResult(
        available || stable ? AcquisitionDisposition.READY : AcquisitionDisposition.WAIT, null);
  }

  /** Current authorization needs only immutable provenance, not plan or active attempt state. */
  public JsonNode currentManifest(String sessionId) {
    transaction();
    var rows =
        jdbc.query(
            "SELECT m.manifest::text FROM studio_guided_translation_state s"
                + " JOIN studio_guided_source_manifests m USING(session_id) WHERE s.session_id=?",
            (rs, n) -> contracts.parse(rs.getString(1)),
            sessionId);
    require(!rows.isEmpty(), "MISSING_SOURCE", 409);
    return rows.getFirst();
  }

  public ObjectNode state(String sessionId) {
    transaction();
    var rows =
        jdbc.query(
            "SELECT m.manifest::text,COALESCE(s.plan_revision,0) AS"
                + " revision,p.plan::text,s.continuation FROM studio_guided_translation_state s"
                + " JOIN studio_guided_source_manifests m USING(session_id) LEFT JOIN"
                + " studio_guided_translation_plans p ON p.session_id=s.session_id AND"
                + " p.plan_revision=s.plan_revision WHERE s.session_id=?",
            (rs, n) -> {
              ObjectNode result = contracts.object();
              result.set("manifest", contracts.parse(rs.getString(1)));
              result.put("planRevision", rs.getLong(2));
              result.set(
                  "plan",
                  rs.getString(3) == null
                      ? com.fasterxml.jackson.databind.node.NullNode.instance
                      : contracts.parse(rs.getString(3)));
              result.put("continuation", rs.getString(4));
              return result;
            },
            sessionId);
    require(!rows.isEmpty(), "MISSING_SOURCE", 409);
    ObjectNode result = rows.getFirst();
    var active =
        jdbc.query(
            "SELECT"
                + " attempt_id,request_id,attempt_number,status,translator_id,lease_until"
                + ",reservation_key,settlement_key,identity::text"
                + " FROM studio_guided_model_attempts WHERE session_id=? AND status IN"
                + " ('RESERVED','CALLING')",
            (rs, n) -> {
              ObjectNode attempt =
                  contracts
                      .object()
                      .put("attemptId", rs.getString(1))
                      .put("requestId", rs.getString(2))
                      .put("attempt", rs.getInt(3))
                      .put("status", rs.getString(4))
                      .put("translatorId", rs.getString(5))
                      .put("leaseUntil", rs.getTimestamp(6).toInstant().toString())
                      .put("reservationKey", rs.getString(7))
                      .put("settlementKey", rs.getString(8));
              attempt.set("identity", contracts.parse(rs.getString(9)));
              return attempt;
            },
            sessionId);
    result.set(
        "activeAttempt",
        active.isEmpty()
            ? com.fasterxml.jackson.databind.node.NullNode.instance
            : active.getFirst());
    return result;
  }

  public long acceptPlan(String sessionId, long expectedRevision, JsonNode plan) {
    transaction();
    bounded(plan, 1048576);
    require(
        plan.path("obligations").isArray() && plan.path("obligations").size() <= 800,
        "INVALID_CONTRACT",
        422);
    ObjectNode current = state(sessionId);
    require(current.path("planRevision").asLong() == expectedRevision, "REVISION_CONFLICT", 409);
    Set<String> ids = new HashSet<>();
    Set<String> coordinates = new HashSet<>();
    for (JsonNode item : plan.path("obligations")) {
      require(
          item.path("obligationId").isTextual()
              && !item.path("obligationId").asText().isBlank()
              && ids.add(item.path("obligationId").asText())
              && item.path("stepId").isTextual()
              && item.path("occurrence").isIntegralNumber()
              && item.path("occurrence").canConvertToInt()
              && item.path("occurrence").asInt() >= 0
              && item.path("occurrence").asInt() <= 7
              && coordinates.add(item.path("stepId").asText() + ":" + item.path("occurrence")),
          "INVALID_CONTRACT",
          422);
    }
    var incremental =
        new com.citi.put.checks.studio.guided.session.GuidedIncrementalStore(jdbc, contracts);
    boolean firstSuffix = incremental.firstSuffixPending(sessionId);
    GuidedAcceptedPlan.validateBeforeAllocation(contracts, plan);
    sourceCoordinates(current.path("manifest"), plan);
    new GuidedPlanHistoryAudit(jdbc, contracts)
        .transition(session(sessionId), current.path("plan"), plan, firstSuffix);
    long revision = Math.addExact(expectedRevision, 1);
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_translation_plans(session_id,plan_revision,pa"
            + "rent_revision,plan,plan_hash)"
            + " VALUES (?,?,?,?::jsonb,?)",
        sessionId,
        revision,
        expectedRevision,
        plan.toString(),
        GuidedContracts.hash(plan));
    require(
        jdbc.update(
                "UPDATE studio_guided_translation_state SET"
                    + " plan_revision=?,updated_at=clock_timestamp() WHERE session_id=? AND"
                    + " COALESCE(plan_revision,0)=?",
                revision,
                sessionId,
                expectedRevision)
            == 1,
        "REVISION_CONFLICT",
        409);
    if (firstSuffix) {
      jdbc.update(
          "INSERT INTO studio_guided_suffix_acceptances"
              + "(session_id,plan_revision,previous_plan_revision,retained_admissions)"
              + " VALUES (?,?,?,?::jsonb)",
          sessionId,
          revision,
          expectedRevision,
          incremental.retainedAdmissions(sessionId).toString());
    }
    return revision;
  }

  /** Server identity and source/consumer coordinates must be sound before a history row exists. */
  private static void sourceCoordinates(JsonNode manifest, JsonNode plan) {
    var order = new java.util.HashMap<String, Integer>();
    for (JsonNode step : manifest.path("sourceSteps")) {
      require(
          order.putIfAbsent(step.path("stepId").asText(), order.size()) == null,
          "REFERENCE_MISMATCH",
          422);
    }
    require(!order.isEmpty(), "MISSING_SOURCE", 409);
    for (JsonNode reference : plan.path("sourceReferences")) {
      require(order.containsKey(reference.path("stepId").asText()), "REFERENCE_MISMATCH", 422);
    }
    int previousStep = -1, previousOrdinal = -1;
    var needs = new java.util.HashMap<String, JsonNode>();
    for (JsonNode need : plan.path("needs")) {
      needs.put(need.path("needId").asText(), need);
    }
    for (JsonNode obligation : plan.path("obligations")) {
      int at = order.getOrDefault(obligation.path("stepId").asText(), -1),
          ordinal = obligation.path("occurrence").asInt();
      require(
          at >= 0 && (at > previousStep || at == previousStep && ordinal > previousOrdinal),
          "BINDING_ORDER",
          422);
      previousStep = at;
      previousOrdinal = ordinal;
      String kind = obligation.path("operationKind").asText();
      if (!obligation.path("referenceIndex").isNull()) {
        JsonNode reference =
            plan.path("sourceReferences").get(obligation.path("referenceIndex").asInt());
        String slot =
            kind.equals("navigate")
                ? "navigate.destination"
                : kind + (kind.equals("assert") ? ".expected" : ".value");
        require(
            reference.path("stepId").equals(obligation.path("stepId"))
                && reference.path("intendedSlot").asText().equals(slot),
            "REFERENCE_MISMATCH",
            422);
      }
      if (!obligation.path("needId").isNull()) {
        JsonNode need = needs.get(obligation.path("needId").asText());
        require(need != null, "MISSING_SOURCE", 409);
        if (kind.equals("read")) {
          require(
              need.path("producerStepId").equals(obligation.path("stepId")), "BINDING_ORDER", 422);
        }
      }
    }
    for (JsonNode need : plan.path("needs")) {
      int producer = order.getOrDefault(need.path("producerStepId").asText(), -1);
      boolean read = false;
      for (JsonNode obligation : plan.path("obligations")) {
        read |=
            obligation.path("operationKind").asText().equals("read")
                && obligation.path("stepId").equals(need.path("producerStepId"))
                && obligation.path("needId").equals(need.path("needId"));
      }
      require(producer >= 0 && read, "BINDING_ORDER", 422);
      for (JsonNode consumer : need.path("consumers")) {
        require(
            order.getOrDefault(consumer.path("stepId").asText(), -1) >= producer,
            "BINDING_ORDER",
            422);
      }
    }
  }

  public void continuation(String sessionId, String phase) {
    transaction();
    require(
        Set.of(
                "SOURCE_PLAN",
                "REPLAYING_PREFIX",
                "NEXT_ACTION",
                "VERIFY_STEP",
                "MATERIALIZE",
                "NEXT",
                "REFRESH",
                "AWAITING_CLARIFICATION",
                "OBSERVING",
                "FINALIZING",
                "STOPPED")
            .contains(phase),
        "INVALID_CONTRACT",
        422);
    require(
        jdbc.update(
                "UPDATE studio_guided_translation_state SET"
                    + " continuation=?,updated_at=clock_timestamp() WHERE session_id=?",
                phase,
                sessionId)
            == 1,
        "MISSING_SOURCE",
        409);
  }

  public record Attempt(
      String attemptId,
      String reservationKey,
      String settlementKey,
      boolean send,
      JsonNode identity) {
    public Attempt {
      identity = identity.deepCopy();
    }

    @Override
    public JsonNode identity() {
      return identity.deepCopy();
    }
  }

  /** Existing attempts consume no new reservation; all access is serialized by the session lock. */
  public boolean hasAttempt(String sessionId, String requestId, int attempt) {
    transaction();
    return jdbc.queryForObject(
        "SELECT EXISTS(SELECT 1 FROM studio_guided_model_attempts"
            + " WHERE session_id=? AND request_id=? AND attempt_number=?)",
        Boolean.class,
        sessionId,
        requestId,
        attempt);
  }

  public Attempt reserveAttempt(
      JsonNode session,
      String requestId,
      int attempt,
      String kind,
      String projectionHash,
      long planRevision,
      int inputCeiling,
      int outputCeiling,
      String translatorId,
      Instant leaseUntil) {
    transaction();
    require(
        !Boolean.TRUE.equals(
            jdbc.queryForObject(
                "SELECT studio_015_prefix_pending(?)" + " OR studio_015_delivery_pending(?)",
                Boolean.class,
                session.path("sessionId").asText(),
                session.path("sessionId").asText())),
        "REVISION_CONFLICT",
        409);
    require(
        attempt > 0
            && attempt <= 3
            && inputCeiling > 0
            && outputCeiling > 0
            && Set.of("SOURCE_PLAN", "NEXT_ACTION", "VERIFY_STEP").contains(kind)
            && projectionHash.matches("[a-f0-9]{64}")
            && !translatorId.isBlank(),
        "INVALID_CONTRACT",
        422);
    String id = session.path("sessionId").asText();
    ObjectNode request =
        contracts
            .object()
            .put("requestId", requestId)
            .put("attempt", attempt)
            .put("kind", kind)
            .put("projectionHash", projectionHash)
            .put("planRevision", planRevision)
            .put("inputCeiling", inputCeiling)
            .put("outputCeiling", outputCeiling);
    String digest = GuidedContracts.hash(request);
    var prior =
        jdbc.query(
            "SELECT"
                + " attempt_id,reservation_key,settlement_key,identity::text,re"
                + "quest_digest,status,safe_result::text"
                + " FROM studio_guided_model_attempts WHERE session_id=? AND request_id=? AND"
                + " attempt_number=?",
            (rs, n) -> {
              require(rs.getString(5).equals(digest), "IDEMPOTENCY_CONFLICT", 409);
              ObjectNode persisted = (ObjectNode) contracts.parse(rs.getString(4));
              persisted.put("status", rs.getString(6));
              persisted.set(
                  "result",
                  rs.getString(7) == null
                      ? com.fasterxml.jackson.databind.node.NullNode.instance
                      : contracts.parse(rs.getString(7)));
              return new Attempt(
                  rs.getString(1), rs.getString(2), rs.getString(3), false, persisted);
            },
            id,
            requestId,
            attempt);
    if (!prior.isEmpty()) {
      return prior.getFirst();
    }
    require(state(id).path("planRevision").asLong() == planRevision, "REVISION_CONFLICT", 409);
    require(
        jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_model_attempts WHERE sess"
                    + "ion_id=? AND status IN"
                    + " ('RESERVED','CALLING')",
                Integer.class,
                id)
            == 0,
        "IDEMPOTENCY_CONFLICT",
        409);
    require(!leaseUntil.isAfter(Instant.parse(session.path("expiresAt").asText())), "EXPIRED", 409);
    String attemptId = UUID.randomUUID().toString();
    String reservation = "translation-reserve-" + attemptId,
        settlement = "translation-settle-" + attemptId;
    ObjectNode identity =
        request
            .deepCopy()
            .put("sessionId", id)
            .put("attemptId", attemptId)
            .put("scopeHash", session.path("scopeHash").asText())
            .put("translatorId", translatorId)
            .put("leaseUntil", leaseUntil.toString());
    identity.set("owner", session.path("owner").deepCopy());
    identity.set("scope", session.path("scope").deepCopy());
    // Session progress is read from authoritative persistence, not a caller-supplied wrapper.
    JsonNode progress = progress(id);
    for (String field : List.of("documentId", "generation", "executionEvidence", "stepIndex")) {
      identity.set(
          field,
          progress.path(field).isMissingNode()
              ? com.fasterxml.jackson.databind.node.NullNode.instance
              : progress.path(field).deepCopy());
    }
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_model_attempts(session_id,attempt_id,request_id,attempt"
            + "_number,kind,identity,request_digest,translator_id,lease_until,reserva"
            + "tion_key,settlement_key,status)"
            + " VALUES (?,?,?,?,?,?::jsonb,?,?,?,?,?,'RESERVED')",
        id,
        attemptId,
        requestId,
        attempt,
        kind,
        identity.toString(),
        digest,
        translatorId,
        Timestamp.from(leaseUntil),
        reservation,
        settlement);
    return new Attempt(attemptId, reservation, settlement, true, identity);
  }

  public boolean claimSend(String sessionId, String attemptId, String translatorId, Instant now) {
    transaction();
    JsonNode session = session(sessionId);
    JsonNode row = attemptIdentity(sessionId, attemptId);
    if (row == null
        || !currentAttempt(
            session, attemptId, translatorId, row.path("planRevision").asLong(), now)) {
      return false;
    }
    return jdbc.update(
            "UPDATE studio_guided_model_attempts SET status='CALLING',upd"
                + "ated_at=clock_timestamp()"
                + " WHERE session_id=? AND attempt_id=? AND translator_id=? AND status='RESERVED'"
                + " AND lease_until>?",
            sessionId,
            attemptId,
            translatorId,
            Timestamp.from(now))
        == 1;
  }

  public boolean currentAttempt(
      JsonNode session, String attemptId, String translatorId, long planRevision, Instant now) {
    transaction();
    String id = session.path("sessionId").asText();
    var rows =
        jdbc.query(
            "SELECT identity::text,status,lease_until FROM studio_guided_model_attempts WHERE"
                + " session_id=? AND attempt_id=? AND translator_id=?",
            (rs, n) -> {
              JsonNode identity = contracts.parse(rs.getString(1));
              JsonNode progress = progress(id);
              boolean matching = true;
              for (String field :
                  List.of("documentId", "generation", "executionEvidence", "stepIndex")) {
                JsonNode value = progress.path(field);
                matching &=
                    identity
                        .path(field)
                        .equals(
                            value.isMissingNode()
                                ? com.fasterxml.jackson.databind.node.NullNode.instance
                                : value);
              }
              JsonNode owner = session.path("owner"), originalOwner = identity.path("owner");
              return Set.of("RESERVED", "CALLING").contains(rs.getString(2))
                  && rs.getTimestamp(3).toInstant().isAfter(now)
                  && Instant.parse(session.path("expiresAt").asText()).isAfter(now)
                  && !Set.of(
                          "SUCCEEDED",
                          "PUBLICATION_CONFLICT",
                          "FAILED",
                          "UNKNOWN_OUTCOME",
                          "CANCELLED",
                          "EXPIRED")
                      .contains(session.path("state").asText())
                  && identity.path("scope").equals(session.path("scope"))
                  && identity.path("scopeHash").equals(session.path("scopeHash"))
                  && owner.path("fence").equals(originalOwner.path("fence"))
                  && owner.path("workerId").equals(originalOwner.path("workerId"))
                  && Instant.parse(owner.path("leaseExpiresAt").asText()).isAfter(now)
                  && identity.path("planRevision").asLong() == planRevision
                  && state(id).path("planRevision").asLong() == planRevision
                  && matching;
            },
            id,
            attemptId,
            translatorId);
    return !rows.isEmpty() && rows.getFirst();
  }

  /**
   * Closed persisted rejection reasons: every provider-result token plus the guided codes an apply
   * refusal may carry. This Java allowlist is the authority for membership; the V23 CHECK only
   * bounds the shape.
   */
  private static final Set<String> APPLY_REASONS =
      Set.of(
          "INVALID_CONTRACT",
          "REFERENCE_MISMATCH",
          "BINDING_ORDER",
          "POLICY_DENIED",
          "MISSING_SOURCE",
          "INSUFFICIENT_EVIDENCE",
          "EVIDENCE_MISMATCH",
          "RUNTIME_INCOMPATIBLE",
          "STALE_GENERATION",
          "REVISION_CONFLICT",
          "BUDGET_EXCEEDED");

  private static final Set<String> REJECTION_REASONS;

  static {
    var reasons = new java.util.HashSet<>(APPLY_REASONS);
    reasons.add("APPLY_OTHER");
    for (GuidedModelResponse.Reason reason : GuidedModelResponse.Reason.values()) {
      reasons.add(reason.name());
    }
    REJECTION_REASONS = Set.copyOf(reasons);
  }

  /**
   * ADR-SC-007 D5: the first gate that refused an apply, a closed token persisted with the REJECTED
   * attempt. Only the apply-time gates qualify; the runner-time gates are recorded on the session.
   */
  private static final Set<String> REJECTION_GATES;

  static {
    var gates = new java.util.HashSet<String>();
    for (GuidedRefusalDiagnostics.Gate gate : GuidedRefusalDiagnostics.Gate.values()) {
      if (gate.name().startsWith("NEXT_")) {
        gates.add(gate.name());
      }
    }
    REJECTION_GATES = Set.copyOf(gates);
  }

  /** How the intent gate admitted an applied NEXT_ACTION, persisted with the APPLIED attempt. */
  private static final Set<String> INTENT_PATHS =
      Set.of("EXACT_NAME", "EVIDENCE_SUBSET", "SELECTED_CHOICE", "SCOPE_EVIDENCE");

  private static final java.util.regex.Pattern INTENT_FIELDS =
      java.util.regex.Pattern.compile(
          "(name|placeholder|near|ownText|text|group|header|sibling)"
              + "(,(name|placeholder|near|ownText|text|group|header|sibling)){0,7}");

  /** Maps an apply-side refusal code to its closed reason; anything unlisted is APPLY_OTHER. */
  static String applyRejectionReason(String refusalCode) {
    return refusalCode != null && APPLY_REASONS.contains(refusalCode) ? refusalCode : "APPLY_OTHER";
  }

  public void finishAttempt(
      String sessionId,
      String attemptId,
      String status,
      JsonNode safeResult,
      Integer inputTokens,
      Integer outputTokens) {
    finishAttempt(sessionId, attemptId, status, safeResult, inputTokens, outputTokens, null);
  }

  /**
   * @param rejectionReason a closed token, allowed only with status REJECTED; null otherwise
   */
  public void finishAttempt(
      String sessionId,
      String attemptId,
      String status,
      JsonNode safeResult,
      Integer inputTokens,
      Integer outputTokens,
      String rejectionReason) {
    finishAttempt(
        sessionId,
        attemptId,
        status,
        safeResult,
        inputTokens,
        outputTokens,
        rejectionReason,
        null,
        null,
        null);
  }

  /**
   * @param rejectionGate the first grounding gate that refused (a closed NEXT_* token), allowed
   *     only with status REJECTED
   * @param intentPath how the intent gate admitted the pick (EXACT_NAME, EVIDENCE_SUBSET or
   *     SELECTED_CHOICE), allowed only with status APPLIED
   * @param intentFields the comma-joined evidence fields that supplied the intent words (D7(d)),
   *     allowed only with an intent path
   */
  public void finishAttempt(
      String sessionId,
      String attemptId,
      String status,
      JsonNode safeResult,
      Integer inputTokens,
      Integer outputTokens,
      String rejectionReason,
      String rejectionGate,
      String intentPath,
      String intentFields) {
    transaction();
    requireNotPruned(sessionId);
    require(
        rejectionGate == null
            || status.equals("REJECTED") && REJECTION_GATES.contains(rejectionGate),
        "INVALID_CONTRACT",
        422);
    require(
        intentPath == null || status.equals("APPLIED") && INTENT_PATHS.contains(intentPath),
        "INVALID_CONTRACT",
        422);
    require(
        intentFields == null
            || intentPath != null
                && intentFields.length() <= 80
                && INTENT_FIELDS.matcher(intentFields).matches(),
        "INVALID_CONTRACT",
        422);
    require(
        Set.of("APPLIED", "REJECTED", "SUPERSEDED", "UNKNOWN_CALL").contains(status),
        "INVALID_CONTRACT",
        422);
    require(
        rejectionReason == null
            || status.equals("REJECTED") && REJECTION_REASONS.contains(rejectionReason),
        "INVALID_CONTRACT",
        422);
    usage(inputTokens, outputTokens);
    if (safeResult != null && !safeResult.isNull()) {
      bounded(safeResult, 1048576);
    }
    var rows =
        jdbc.query(
            "SELECT status,safe_result::text,input_tokens,output_tokens,rejection_reason,"
                + "rejection_gate,intent_path,intent_fields FROM"
                + " studio_guided_model_attempts WHERE session_id=? AND attempt_id=?",
            (rs, n) -> {
              ObjectNode row = contracts.object().put("status", rs.getString(1));
              row.put("reason", rs.getString(5));
              row.put("gate", rs.getString(6));
              row.put("intentPath", rs.getString(7));
              row.put("intentFields", rs.getString(8));
              row.set(
                  "result",
                  rs.getString(2) == null
                      ? com.fasterxml.jackson.databind.node.NullNode.instance
                      : contracts.parse(rs.getString(2)));
              row.set(
                  "input",
                  rs.getObject(3) == null
                      ? com.fasterxml.jackson.databind.node.NullNode.instance
                      : new com.fasterxml.jackson.databind.node.IntNode(rs.getInt(3)));
              row.set(
                  "output",
                  rs.getObject(4) == null
                      ? com.fasterxml.jackson.databind.node.NullNode.instance
                      : new com.fasterxml.jackson.databind.node.IntNode(rs.getInt(4)));
              return row;
            },
            sessionId,
            attemptId);
    require(!rows.isEmpty(), "MISSING_SOURCE", 409);
    ObjectNode old = rows.getFirst();
    if (!Set.of("RESERVED", "CALLING").contains(old.path("status").asText())) {
      require(
          old.path("status").asText().equals(status)
              && old.path("result")
                  .equals(
                      safeResult == null
                          ? com.fasterxml.jackson.databind.node.NullNode.instance
                          : safeResult)
              && java.util.Objects.equals(
                  old.path("input").isNull() ? null : old.path("input").asInt(), inputTokens)
              && java.util.Objects.equals(
                  old.path("output").isNull() ? null : old.path("output").asInt(), outputTokens)
              && java.util.Objects.equals(
                  old.path("reason").isNull() ? null : old.path("reason").asText(), rejectionReason)
              && java.util.Objects.equals(
                  old.path("gate").isNull() ? null : old.path("gate").asText(), rejectionGate)
              && java.util.Objects.equals(
                  old.path("intentPath").isNull() ? null : old.path("intentPath").asText(),
                  intentPath)
              && java.util.Objects.equals(
                  old.path("intentFields").isNull() ? null : old.path("intentFields").asText(),
                  intentFields),
          "IDEMPOTENCY_CONFLICT",
          409);
      return;
    }
    jdbc.update(
        "UPDATE studio_guided_model_attempts SET"
            + " status=?,safe_result=?::jsonb,input_tokens=?,output_tokens="
            + "?,rejection_reason=?,"
            + "rejection_gate=?,intent_path=?,intent_fields=?,updated_at=clock_timestamp()"
            + " WHERE session_id=? AND attempt_id=?",
        status,
        safeResult == null || safeResult.isNull() ? null : safeResult.toString(),
        inputTokens,
        outputTokens,
        rejectionReason,
        rejectionGate,
        intentPath,
        intentFields,
        sessionId,
        attemptId);
  }

  public void recordLateUsage(
      String sessionId, String attemptId, Integer inputTokens, Integer outputTokens) {
    transaction();
    requireNotPruned(sessionId);
    usage(inputTokens, outputTokens);
    int inserted =
        jdbc.update(
            "INSERT INTO"
                + " studio_guided_model_usage_audit(session_id,attempt_id,input"
                + "_tokens,output_tokens)"
                + " VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
            sessionId,
            attemptId,
            inputTokens,
            outputTokens);
    if (inserted == 0) {
      require(
          Boolean.TRUE.equals(
              jdbc.queryForObject(
                  "SELECT input_tokens IS NOT DISTINCT FROM ? AND output_tokens IS NOT DISTINCT"
                      + " FROM ? FROM studio_guided_model_usage_audit WHERE session_id=? AND"
                      + " attempt_id=?",
                  Boolean.class,
                  inputTokens,
                  outputTokens,
                  sessionId,
                  attemptId)),
          "IDEMPOTENCY_CONFLICT",
          409);
      return;
    }
    // STUDIO-OBS-014 AC-8 (AR-2 c): usage reported above the attempt's charged ceiling is already
    // spent, so the excess is added to the CSI's day unconditionally (never refused). Matches
    // studio_guided_model_usage_report's GREATEST(ceiling, actual). Every production attempt
    // carries its session scope (reserveAttempt); an attempt without a CSI charges nothing.
    jdbc.update(
        "INSERT INTO studio_guided_csi_token_days(csi_id,budget_day) SELECT"
            + " identity->'scope'->>'csiId',(clock_timestamp() AT TIME ZONE 'UTC')::date FROM"
            + " studio_guided_model_attempts WHERE session_id=? AND attempt_id=? AND"
            + " identity->'scope'->>'csiId' IS NOT NULL ON CONFLICT DO NOTHING",
        sessionId,
        attemptId);
    jdbc.update(
        "UPDATE studio_guided_csi_token_days d SET input_tokens = d.input_tokens +"
            + " GREATEST(0, ?::bigint - (a.identity->>'inputCeiling')::bigint), output_tokens ="
            + " d.output_tokens + GREATEST(0, ?::bigint - (a.identity->>'ou"
            + "tputCeiling')::bigint)"
            + " FROM studio_guided_model_attempts a WHERE a.session_id=? AND a.attempt_id=? AND"
            + " d.csi_id = a.identity->'scope'->>'csiId' AND d.budget_day ="
            + " (clock_timestamp() AT"
            + " TIME ZONE 'UTC')::date",
        inputTokens == null ? 0 : inputTokens,
        outputTokens == null ? 0 : outputTokens,
        sessionId,
        attemptId);
  }

  /**
   * STUDIO-OBS-014 AC-3, ruling AR-2 S-4: a pruned session's model output is gone and its attempts
   * accept no settlement (V19 attempt guard). A late settlement or late usage receipt for it is
   * refused here, with the existing {@code EXPIRED}, before any SQL write reaches that guard.
   */
  private void requireNotPruned(String sessionId) {
    List<Object> pruned =
        jdbc.queryForList(
            "SELECT pruned_at FROM studio_guided_sessions WHERE session_id=?",
            Object.class,
            sessionId);
    require(pruned.isEmpty() || pruned.getFirst() == null, "EXPIRED", 409);
  }

  /** Immutable late receipts expressed as deltas beyond amounts already charged at settlement. */
  public List<ObjectNode> lateUsageAdjustments(String sessionId) {
    transaction();
    return jdbc.query(
        "SELECT"
            + " a.attempt_id,GREATEST(0,GREATEST((a.identity->>'inputCeilin"
            + "g')::bigint,u.input_tokens)"
            + "-GREATEST((a.identity->>'inputCeiling')::bigint,a.input_tokens)),GREATEST(0,"
            + " GREATEST((a.identity->>'outputCeiling')::bigint, u.output_tokens) -"
            + " GREATEST((a.identity->>'outputCeiling')::bigint, a.output_tokens)) FROM"
            + " studio_guided_model_attempts a JOIN studio_guided_model_usage_audit u"
            + " USING(session_id,attempt_id) WHERE a.session_id=?",
        (rs, n) ->
            contracts
                .object()
                .put("attemptId", rs.getString(1))
                .put("inputExtra", rs.getLong(2))
                .put("outputExtra", rs.getLong(3)),
        sessionId);
  }

  public ObjectNode reserveObligation(JsonNode session, String obligationId, JsonNode proposal) {
    transaction();
    bounded(proposal, 131072);
    String id = session.path("sessionId").asText();
    ObjectNode head = state(id);
    JsonNode meaning = find(head.path("plan").path("obligations"), "obligationId", obligationId);
    require(
        meaning != null
            && meaning.path("stepId").equals(proposal.path("coordinate").path("stepId")),
        "INVALID_CONTRACT",
        422);
    ObjectNode prior = obligation(id, obligationId);
    if (prior != null) {
      require(prior.path("proposal").equals(proposal), "IDEMPOTENCY_CONFLICT", 409);
      return prior;
    }
    String key = "obligation-" + UUID.randomUUID();
    jdbc.update(
        "INSERT INTO"
            + " studio_guided_obligation_admissions(session_id,obligation_id,plan_rev"
            + "ision,meaning,proposal,proposal_digest,admission_key,attempt_ordinal)"
            + " VALUES (?,?,?,?::jsonb,?::jsonb,?,?,?)",
        id,
        obligationId,
        head.path("planRevision").asLong(),
        meaning.toString(),
        proposal.toString(),
        GuidedContracts.hash(proposal),
        key,
        new com.citi.put.checks.studio.guided.session.GuidedIncrementalStore(jdbc, contracts)
            .attemptOrdinal(id, proposal.path("coordinate")));
    return obligation(id, obligationId);
  }

  public ObjectNode obligation(String sessionId, String obligationId) {
    transaction();
    var rows =
        jdbc.query(
            "SELECT obligation_id,admission_key,proposal::text,admission_id FROM"
                + " studio_guided_obligation_admissions WHERE session_id=? AND obligation_id=?",
            (rs, n) -> {
              ObjectNode result =
                  contracts
                      .object()
                      .put("obligationId", rs.getString(1))
                      .put("admissionKey", rs.getString(2));
              result.set("proposal", contracts.parse(rs.getString(3)));
              if (rs.getString(4) == null) {
                result.putNull("admissionId");
              } else {
                result.put("admissionId", rs.getString(4));
              }
              return result;
            },
            sessionId,
            obligationId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  /**
   * Re-asks that followed a still-unadmitted reservation for a step. An obligation's reservation
   * holds one proposal, and a refused runner prepare leaves it unadmitted, so each NEXT_ACTION
   * applied after the reservation was the same proposal asked and refused again. Zero means the
   * first proposal has not yet been repeated.
   */
  public int repeatedUnadmittedProposals(String sessionId, String stepId) {
    transaction();
    Integer count =
        jdbc.queryForObject(
            "SELECT COALESCE(MAX(n),0) FROM (SELECT count(a.attempt_id) AS n FROM"
                + " studio_guided_obligation_admissions o LEFT JOIN studio_guided_model_attempts a"
                + " ON a.session_id=o.session_id AND a.kind='NEXT_ACTION' AND a.status='APPLIED'"
                + " AND a.created_at>o.created_at WHERE o.session_id=? AND o.admission_id IS NULL"
                + " AND o.proposal->'coordinate'->>'stepId'=? GROUP BY o.obligation_id) t",
            Integer.class,
            sessionId,
            stepId);
    return count == null ? 0 : count;
  }

  public void attachAdmission(String sessionId, String admissionKey, JsonNode action) {
    transaction();
    String admission = action.path("admission").path("admissionId").asText();
    require(
        action.path("sessionId").asText().equals(sessionId) && !admission.isBlank(),
        "FORBIDDEN_SCOPE",
        403);
    var rows =
        jdbc.query(
            "SELECT proposal_digest,proposal::text,admission_id FROM"
                + " studio_guided_obligation_admissions WHERE session_id=? AND admission_key=?",
            (rs, n) -> {
              require(
                  rs.getString(1).equals(action.path("requestDigest").asText())
                      && contracts
                          .parse(rs.getString(2))
                          .path("coordinate")
                          .equals(action.path("coordinate")),
                  "IDEMPOTENCY_CONFLICT",
                  409);
              return rs.getString(3) == null ? "" : rs.getString(3);
            },
            sessionId,
            admissionKey);
    require(!rows.isEmpty(), "MISSING_SOURCE", 409);
    require(
        rows.getFirst().isEmpty() || rows.getFirst().equals(admission),
        "IDEMPOTENCY_CONFLICT",
        409);
    if (rows.getFirst().isEmpty()) {
      jdbc.update(
          "UPDATE studio_guided_obligation_admissions SET admission_id="
              + "? WHERE session_id=? AND"
              + " admission_key=? AND admission_id IS NULL",
          admission,
          sessionId,
          admissionKey);
    }
  }

  public List<ObjectNode> obligations(String sessionId) {
    transaction();
    return jdbc
        .query(
            "SELECT obligation_id FROM studio_guided_obligation_admission"
                + "s WHERE session_id=? ORDER"
                + " BY obligation_id",
            (rs, n) -> rs.getString(1),
            sessionId)
        .stream()
        .map(id -> obligation(sessionId, id))
        .toList();
  }

  public List<String> runnable(int limit) {
    require(limit > 0 && limit <= 1000, "INVALID_CONTRACT", 422);
    return jdbc.queryForList(
        "SELECT t.session_id FROM studio_guided_translation_state t J"
            + "OIN studio_guided_sessions s"
            + " USING(session_id) WHERE t.continuation NOT IN"
            + " ('AWAITING_CLARIFICATION','FINALIZING','STOPPED') AND s.state NOT IN"
            + " ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME',"
            + "'CANCELLED','EXPIRED','AWAITING_CLARIFICATION')"
            + " AND s.expires_at>clock_timestamp() ORDER BY t.updated_at,t.session_id LIMIT ?",
        String.class,
        limit);
  }

  private JsonNode progress(String id) {
    return contracts.parse(
        jdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  private JsonNode session(String id) {
    return contracts.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  private JsonNode attemptIdentity(String id, String attemptId) {
    var rows =
        jdbc.query(
            "SELECT identity::text FROM studio_guided_model_attempts WHERE session_id=? AND"
                + " attempt_id=?",
            (rs, n) -> contracts.parse(rs.getString(1)),
            id,
            attemptId);
    return rows.isEmpty() ? null : rows.getFirst();
  }

  private static void usage(Integer input, Integer output) {
    require(
        (input == null || input >= 0) && (output == null || output >= 0), "INVALID_CONTRACT", 422);
  }

  private static JsonNode find(JsonNode array, String field, String value) {
    for (JsonNode item : array) {
      if (item.path(field).asText().equals(value)) {
        return item;
      }
    }
    return null;
  }

  private static boolean contains(JsonNode array, JsonNode expected) {
    for (JsonNode item : array) {
      if (item.equals(expected)) {
        return true;
      }
    }
    return false;
  }
}
