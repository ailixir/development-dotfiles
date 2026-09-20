package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.entity.UITest;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * The `ED-02` recheck: everything about dispatch-time authorization that is decidable without a
 * live user session or a vault (AC-13a, AC-13b).
 *
 * <p>It answers the questions the dispatcher can actually observe on this branch — the draft still
 * exists and is neither soft-deleted nor quarantined, the CSI is still registered, and the
 * execution carries a principal at all (§9.1, absent identity fails closed) — and it returns the
 * <b>policy identity this dispatch ran under</b>, which is the honest minimum AC-13b settles on
 * while ADR-002 O-6 is open: decidable today, costs story 10.18 nothing, and leaves the audit trail
 * in place whichever way SPK-05 rules between a job-carried policy and egress-only enforcement.
 */
@Component
public class ProvisionalDispatchAuthorization implements DispatchAuthorization {

  private final StudioRepository tests;
  private final CsiRepository csis;

  public ProvisionalDispatchAuthorization(StudioRepository tests, CsiRepository csis) {
    this.tests = tests;
    this.csis = csis;
  }

  @Override
  public String recheck(UUID executionId, UUID testId, String csiId, String principal) {
    Optional<UITest> test = tests.findById(testId);
    if (test.isEmpty()) {
      throw new AuthorizationRevokedException("The draft this execution was accepted for is gone");
    }
    if (test.get().getDeletedAt() != null) {
      throw new AuthorizationRevokedException(
          "The draft this execution was accepted for has been deleted");
    }
    if (test.get().getQuarantinedAt() != null) {
      throw new AuthorizationRevokedException(
          "The draft this execution was accepted for is quarantined");
    }
    if (csiId == null || !csis.existsById(csiId)) {
      throw new AuthorizationRevokedException("CSI " + csiId + " is no longer registered");
    }
    if (principal == null || principal.isBlank()) {
      // §9.1: absent identity fails closed. A dispatch with no principal cannot have its
      // entitlements re-evaluated, and "cannot evaluate" is never "permitted".
      throw new AuthorizationRevokedException(
          "The execution carries no principal whose authorization could be rechecked");
    }
    return "csi:" + csiId + "/provisional-dispatch-policy";
  }
}
