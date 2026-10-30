package com.citi.put.checks.studio.guided.translation;

/**
 * Closed reasons a guided proposal is refused under {@code POLICY_DENIED} (STUDIO-OBS-014 AC-4/5,
 * ruling AR-2 a). Carried internally (the refusal's {@code messageCode}, the attempt record and the
 * {@code reasonCode} of the AC-10 audit event); never part of a public schema.
 */
public enum GuidedPolicyReason {
  /** AC-4: a click, press or check target that cannot be traced to the authored step text. */
  UNGROUNDED_TARGET,
  /** AC-5: a click or press on a destructive control the author did not name. */
  DESTRUCTIVE_VERB;

  /** The reason a {@code POLICY_DENIED} message code names, or null when it names none. */
  public static GuidedPolicyReason of(String messageCode) {
    for (GuidedPolicyReason reason : values()) {
      if (reason.name().equals(messageCode)) {
        return reason;
      }
    }
    return null;
  }
}
