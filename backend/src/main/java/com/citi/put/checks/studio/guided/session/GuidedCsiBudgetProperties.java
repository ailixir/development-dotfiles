package com.citi.put.checks.studio.guided.session;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Per-CSI guided learning budgets (STUDIO-OBS-014 AC-8, ruling AR-2 c), on top of the per-session
 * ceilings in {@link GuidedSessionProperties}, which stay unchanged.
 *
 * @param maxConcurrentSessions live (non-terminal, unexpired) sessions one CSI may hold
 * @param dailyModelInputTokens model input charged per CSI per UTC day (database clock); 0 (the
 *     default) is unlimited, a positive value is a cap
 * @param dailyModelOutputTokens model output charged per CSI per UTC day (database clock); 0 (the
 *     default) is unlimited, a positive value is a cap
 */
@ConfigurationProperties("studio.guided-authoring.csi-budget")
public record GuidedCsiBudgetProperties(
    @DefaultValue("3") int maxConcurrentSessions,
    @DefaultValue("0") long dailyModelInputTokens,
    @DefaultValue("0") long dailyModelOutputTokens) {

  /** The limit the daily check and charge compare against: {@link Long#MAX_VALUE} while 0. */
  static long limitOrUnbounded(long configured) {
    return configured == 0 ? Long.MAX_VALUE : configured;
  }

  /**
   * Start-up invariant (AR-2 c): one full-ceiling session must always fit a CSI's day when a daily
   * cap is set (0 is unlimited and always fits), and at least one session must be allowed.
   */
  public void requireFits(GuidedSessionProperties session) {
    if (maxConcurrentSessions < 1
        || dailyModelInputTokens < 0
        || dailyModelOutputTokens < 0
        || (dailyModelInputTokens > 0 && dailyModelInputTokens < session.maxModelInputTokensTotal())
        || (dailyModelOutputTokens > 0
            && dailyModelOutputTokens < session.maxModelOutputTokensTotal())) {
      throw new IllegalStateException(
          "studio.guided-authoring.csi-budget must allow one session and one full per-session"
              + " model ceiling per CSI per day");
    }
  }
}
