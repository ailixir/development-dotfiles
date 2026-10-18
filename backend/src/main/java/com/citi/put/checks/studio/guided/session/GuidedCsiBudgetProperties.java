package com.citi.put.checks.studio.guided.session;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Per-CSI guided learning budgets (STUDIO-OBS-014 AC-8, ruling AR-2 c), on top of the per-session
 * ceilings in {@link GuidedSessionProperties}, which stay unchanged.
 *
 * @param maxConcurrentSessions live (non-terminal, unexpired) sessions one CSI may hold
 * @param dailyModelInputTokens model input charged per CSI per UTC day (database clock)
 * @param dailyModelOutputTokens model output charged per CSI per UTC day (database clock)
 */
@ConfigurationProperties("studio.guided-authoring.csi-budget")
public record GuidedCsiBudgetProperties(
    @DefaultValue("3") int maxConcurrentSessions,
    @DefaultValue("5242880") long dailyModelInputTokens,
    @DefaultValue("640000") long dailyModelOutputTokens) {

  /**
   * Start-up invariant (AR-2 c): one full-ceiling session must always fit a CSI's day, and at least
   * one session must be allowed.
   */
  public void requireFits(GuidedSessionProperties session) {
    if (maxConcurrentSessions < 1
        || dailyModelInputTokens < session.maxModelInputTokensTotal()
        || dailyModelOutputTokens < session.maxModelOutputTokensTotal()) {
      throw new IllegalStateException(
          "studio.guided-authoring.csi-budget must allow one session and one full per-session"
              + " model ceiling per CSI per day");
    }
  }
}
