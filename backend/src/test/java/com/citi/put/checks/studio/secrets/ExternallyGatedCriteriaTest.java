package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import java.util.List;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

/**
 * Story 10.17 — the externally gated criteria, recorded as <b>live skips, never as passes</b>.
 *
 * <p>The epic's convention for externally gated work, established by 10.3 and used by 10.6, 10.7,
 * 10.8 and 10.13: a blocked half is a skip that names its gate and its owning story and that
 * appears in every run, rather than a criterion that is simply absent from the tree. A {@code b}
 * half that turns green without its gate moving is a defect, not a bonus — and for a secrets story
 * the specific risk is the opposite of the usual one: that somebody turns these green against the
 * fake vault and reports the gate as cleared.
 */
class ExternallyGatedCriteriaTest {

  @Test
  @Disabled(
      "AC-5b — BLOCKED on ED-02 (status: open). Integration owner 10.18, integrated proof 10.19. "
          + "The same three properties evaluated by the REAL vault's own policy, including the "
          + "principal dimension, which has no decidable source on this branch: it belongs to the "
          + "platform Vault token policy and the PUT Core secret-use policy (ED-02), neither of "
          + "which is connected. This story ships the seam and a fake vault whose policy is "
          + "development configuration. SKIPPED, NOT PASSED.")
  @DisplayName("AC-5b — resolution confined by the real vault's own policy (ED-02 / 10.18 / 10.19)")
  void ac5bRealVaultPolicy() {
    throw new AssertionError("blocked on ED-02");
  }

  @Test
  @Disabled(
      "AC-7b — BLOCKED on ED-02 (status: open). Owner 10.18, proven in 10.19. The same two "
          + "terminal conditions driven by a REAL identity revocation through the trusted gateway "
          + "and a REAL vault deletion, against a non-bypassed session. On this branch the "
          + "revocation half is unobservable: every request is platform-bypass with checks-admin, "
          + "so a 'revocation' is a test fixture changing a fake's answer. SKIPPED, NOT PASSED.")
  @DisplayName("AC-7b — real revocation through a non-bypassed session (ED-02 / 10.18 / 10.19)")
  void ac7bRealRevocation() {
    throw new AssertionError("blocked on ED-02");
  }

  @Test
  @Disabled(
      "AC-13b — BLOCKED on ED-02, jointly with 10.19; the other half of 10.13's own AC-7b, which "
          + "names 10.17 by hand. The same canaries proven through the INTEGRATED path with real "
          + "vault material: nothing the API persists carries them — progress rows, the persisted "
          + "snapshot, structured log storage, and 10.14's terminal result manifest. SKIPPED, NOT "
          + "PASSED.")
  @DisplayName("AC-13b — canaries through the integrated path with real material (ED-02 / 10.19)")
  void ac13bIntegratedCanaries() {
    throw new AssertionError("blocked on ED-02");
  }

  /**
   * The gate is still shut, and this asserts it rather than describing it.
   *
   * <p>The hazard `ED-02` names is not the filter method in isolation — it is the pair: the bypass
   * identity carries {@code checks-admin} and {@code platform-admin}, and {@code
   * CsiOwnershipEvaluator.isAdmin} short-circuits {@code canRead}, {@code canWrite} and {@code
   * canExecute} to {@code true} for <b>every</b> CSI on the strength of either. That pair is what
   * makes an authorization test written through the ordinary request path green for the wrong
   * reason, and it is asserted here by <em>running the evaluator</em> rather than by reading the
   * filter's source.
   *
   * <p>When `ED-02` lands, this goes red — in a run, rather than in a document nobody re-reads —
   * and the three skips above must be reviewed instead of left in place. This story adds no bypass
   * and removes none; removing it is 10.18.
   */
  @Test
  void theEd02BypassIsStillLiveWhichIsWhyTheThreeCriteriaAboveAreSkipped() {
    CsiOwnershipEvaluator evaluator = new CsiOwnershipEvaluator();
    Authentication bypassIdentity =
        new BffAuthenticationToken(
            new UserIdentity(
                "platform-bypass",
                "platform-bypass@citi.com",
                "Platform Bypass User",
                "Platform Migration",
                List.of("checks-admin", "platform-admin"),
                List.of()));

    assertThat(evaluator.isAdmin(bypassIdentity))
        .as("ED-02's admin short-circuit is gone; AC-5b, AC-7b and AC-13b may no longer be blocked")
        .isTrue();
    for (String anyCsi : List.of("60406", "60999", "not-a-csi-at-all")) {
      assertThat(evaluator.canExecute(bypassIdentity, anyCsi))
          .as("the bypass identity no longer executes everywhere: re-review the skips above")
          .isTrue();
    }

    // …and the evaluator is otherwise capable of refusing, so the assertions above are about the
    // bypass rather than about an evaluator that says yes to everything.
    Authentication viewer =
        new BffAuthenticationToken(
            new UserIdentity(
                "uid-viewer",
                "viewer@citi.com",
                "Viewer",
                "Ops",
                List.of(),
                List.of(new CsiOwnershipEntry("60406", "viewer"))));
    assertThat(evaluator.isAdmin(viewer)).isFalse();
    assertThat(evaluator.canExecute(viewer, "60406")).isFalse();
  }
}
