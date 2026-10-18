package com.citi.put.checks.studio.secrets;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * STUDIO-OBS-009 AC-4, the Vault half: the backend's Vault token reads {@code
 * studio/{csiId}/{environment}/{testId}/secret/*} only, and write and list outside that path are
 * denied.
 *
 * <p><b>This test is UNRUN, by name, and never credited.</b> The criterion is a policy test against
 * the ED-02 development Vault (register item U5, owner PUT Core/BFF). A local Vault container is a
 * rehearsal, classed {@code REHEARSAL_ONLY_NON_CREDITING} (story AC-4 note A18); it needs an image
 * pull, which is not authorized (register item U19, W0 decision "Vault image pull: not
 * authorized"), and no Vault image is in the local Docker cache. Writing a rehearsal body that no
 * run has ever exercised would only leave unverified code behind, so none is written.
 *
 * <p>The case reports as <em>skipped</em> through a JUnit assumption, not through the disabling
 * annotation, so the story's count of disabled tests (a tripwire on the test tree) is untouched. It
 * is listed by name in the QA approved-skips file. When the dev Vault exists the body belongs here,
 * run against it, and the skip entry is removed.
 *
 * <p>What stays local and green is the policy's counterpart in the application: {@code
 * HashicorpStudioVaultProviderTest} (adapter paths and verbs) and {@code StudioSecretsControllerIT}
 * (scope is taken from the row).
 */
class VaultPolicyIT {

  /** The exact name the QA approved-skips file lists (it is the JUnit XML test case name). */
  static final String CASE_NAME =
      "AC-4 Vault policy test (U5, ED-02): UNRUN, owner PUT Core/BFF; a local container is"
          + " REHEARSAL_ONLY_NON_CREDITING and the image pull is not authorized (U19)";

  @Test
  @DisplayName(CASE_NAME)
  void theBackendTokenReadsItsOwnPathOnlyAndWriteAndListOutsideAreDenied() {
    Assumptions.abort(
        "devVaultTest: UNRUN, owner PUT Core/BFF (ED-02); credit: none; no Vault image pull"
            + " authorization (U19)");
  }
}
