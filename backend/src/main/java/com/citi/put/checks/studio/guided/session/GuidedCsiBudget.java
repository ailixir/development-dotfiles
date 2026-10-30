package com.citi.put.checks.studio.guided.session;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Per-CSI concurrent-session and daily model-token budgets (STUDIO-OBS-014 AC-8, rulings AR-2 c and
 * d) and the deployment-wide cap on concurrent learning sessions (STUDIO-FLEX-001), persisted in
 * PostgreSQL so every replica sees the same counts.
 *
 * <p>Concurrency is counted under the CSI's guard-row lock and never kept as a counter, so there is
 * no decrement to lose when a session ends or expires. Daily tokens are charged by one conditional
 * {@code UPDATE} whose affected-row count is the verdict (the admission CAS pattern), at the
 * ceiling of each model call with no refund; usage reported above the ceiling is added
 * unconditionally because it is already spent. The UTC day and every {@code Retry-After} are
 * computed in SQL on the database clock. All methods run inside the caller's transaction.
 */
public class GuidedCsiBudget {

  static final String TERMINAL =
      "('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')";
  private static final String TODAY = "(clock_timestamp() AT TIME ZONE 'UTC')::date";
  private static final String SECONDS_TO_UTC_MIDNIGHT =
      "GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((date_trunc('day', clock_timestamp() AT TIME ZONE"
          + " 'UTC') + interval '1 day') - (clock_timestamp() AT TIME ZONE 'UTC')))))::int";

  private static final String DEPLOYMENT_LOCK = "studio-guided-learning-capacity";

  private final JdbcTemplate jdbc;
  private final GuidedCsiBudgetProperties properties;
  private final int maxConcurrentSessions;

  /**
   * @param maxConcurrentSessions the deployment-wide cap on live learning sessions, whichever CSI
   *     started them
   */
  public GuidedCsiBudget(
      JdbcTemplate jdbc, GuidedCsiBudgetProperties properties, int maxConcurrentSessions) {
    this.jdbc = jdbc;
    this.properties = properties;
    this.maxConcurrentSessions = maxConcurrentSessions;
  }

  /**
   * Admits one more learning session for the CSI and the deployment, or refuses {@code 429
   * BUDGET_EXCEEDED} retryable with a {@code Retry-After}. Charges nothing. A transaction-scoped
   * advisory lock (taken first) and the CSI guard row stay held until the caller's start
   * transaction ends, which serializes concurrent starts across replicas.
   */
  public void admitStart(String csiId) {
    jdbc.queryForObject(
        "SELECT pg_advisory_xact_lock(hashtextextended(?,0))", Object.class, DEPLOYMENT_LOCK);
    jdbc.update(
        "INSERT INTO studio_guided_csi_guards(csi_id) VALUES (?) ON CONFLICT DO NOTHING", csiId);
    jdbc.queryForList(
        "SELECT csi_id FROM studio_guided_csi_guards WHERE csi_id=? FOR UPDATE",
        String.class,
        csiId);
    Map<String, Object> live =
        jdbc.queryForMap(
            "SELECT count(*) AS live, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(expires_at) -"
                + " clock_timestamp()))))::int AS retry FROM studio_guided_sessions WHERE"
                + " (document->'scope'->>'csiId')=? AND state NOT IN "
                + TERMINAL
                + " AND expires_at > clock_timestamp()",
            csiId);
    if (((Number) live.get("live")).intValue() >= properties.maxConcurrentSessions()) {
      throw new GuidedSessionException(
          "BUDGET_EXCEEDED",
          429,
          "CSI_CONCURRENT_SESSIONS_EXHAUSTED",
          true,
          ((Number) live.get("retry")).intValue());
    }
    Map<String, Object> all =
        jdbc.queryForMap(
            "SELECT count(*) AS live, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (min(expires_at) -"
                + " clock_timestamp()))))::int AS retry FROM studio_guided_sessions WHERE state NOT"
                + " IN "
                + TERMINAL
                + " AND expires_at > clock_timestamp()");
    if (((Number) all.get("live")).intValue() >= maxConcurrentSessions) {
      throw new GuidedSessionException(
          "BUDGET_EXCEEDED",
          429,
          "LEARNING_CAPACITY_EXHAUSTED",
          true,
          ((Number) all.get("retry")).intValue());
    }
    List<Map<String, Object>> today =
        jdbc.queryForList(
            "SELECT input_tokens, output_tokens, "
                + SECONDS_TO_UTC_MIDNIGHT
                + " AS retry FROM studio_guided_csi_token_days WHERE csi_id=? AND budget_day="
                + TODAY,
            csiId);
    if (!today.isEmpty()) {
      long input = ((Number) today.getFirst().get("input_tokens")).longValue();
      long output = ((Number) today.getFirst().get("output_tokens")).longValue();
      if (input >= GuidedCsiBudgetProperties.limitOrUnbounded(properties.dailyModelInputTokens())
          || output
              >= GuidedCsiBudgetProperties.limitOrUnbounded(properties.dailyModelOutputTokens())) {
        throw dailyExhausted(((Number) today.getFirst().get("retry")).intValue());
      }
    }
  }

  /**
   * Charges one model call's ceilings to the CSI's day.
   *
   * @return false when the charge would pass either daily limit (nothing is charged)
   */
  public boolean charge(String csiId, long inputCeiling, long outputCeiling) {
    upsertToday(csiId);
    return jdbc.update(
            "UPDATE studio_guided_csi_token_days SET input_tokens = input_tokens + ?,"
                + " output_tokens = output_tokens + ? WHERE csi_id=? AND budget_day="
                + TODAY
                + " AND input_tokens + ? <= ? AND output_tokens + ? <= ?",
            inputCeiling,
            outputCeiling,
            csiId,
            inputCeiling,
            GuidedCsiBudgetProperties.limitOrUnbounded(properties.dailyModelInputTokens()),
            outputCeiling,
            GuidedCsiBudgetProperties.limitOrUnbounded(properties.dailyModelOutputTokens()))
        == 1;
  }

  /** Adds usage above an attempt's ceiling; already spent, so never refused. */
  public void chargeExcess(String csiId, long inputExcess, long outputExcess) {
    if (inputExcess <= 0 && outputExcess <= 0) {
      return;
    }
    upsertToday(csiId);
    jdbc.update(
        "UPDATE studio_guided_csi_token_days SET input_tokens = input_tokens + ?, output_tokens ="
            + " output_tokens + ? WHERE csi_id=? AND budget_day="
            + TODAY,
        Math.max(0, inputExcess),
        Math.max(0, outputExcess),
        csiId);
  }

  /** The refusal a model reservation raises when {@link #charge} answers false. */
  public GuidedSessionException dailyExhausted() {
    Integer retry = jdbc.queryForObject("SELECT " + SECONDS_TO_UTC_MIDNIGHT, Integer.class);
    return dailyExhausted(retry == null ? 1 : retry);
  }

  private static GuidedSessionException dailyExhausted(int retryAfter) {
    return new GuidedSessionException(
        "BUDGET_EXCEEDED", 429, "CSI_DAILY_TOKENS_EXHAUSTED", true, Math.max(1, retryAfter));
  }

  private void upsertToday(String csiId) {
    jdbc.update(
        "INSERT INTO studio_guided_csi_token_days(csi_id, budget_day) VALUES (?, "
            + TODAY
            + ") ON CONFLICT DO NOTHING",
        csiId);
  }
}
