package com.citi.put.checks.studio.guided.publication;

import java.util.UUID;

/**
 * Accepts the proof of a publication: one observed replay of exactly the revision the publication
 * has just made the confirmed one. The Studio dispatch code implements it; the publisher never
 * learns how a replay is admitted or executed.
 *
 * <p>Called inside the publication commit transaction, after the receipt is saved and before the
 * guided browser is stopped. A refusal (dispatch disabled, a full pending quota, Vault unavailable,
 * an unreadable reference) is recorded as the session's link row and the publication is kept. Any
 * other failure propagates and rolls the whole publication back: a defect in proof acceptance
 * blocks publishing, it never produces an unproven publication.
 */
public interface PublicationProofLauncher {

  /**
   * Accepts the proof once for the session and links it. A second call for the same session does
   * nothing, so a publication that finds its own receipt cannot create a second proof.
   *
   * @param sessionId the published guided session
   * @param testId the published test
   * @param revisionId the revision the publication just made the confirmed one
   * @param principal the learner: the original principal whose fresh execute proof the finalize
   *     request obtained
   */
  void launch(String sessionId, UUID testId, UUID revisionId, String principal);
}
