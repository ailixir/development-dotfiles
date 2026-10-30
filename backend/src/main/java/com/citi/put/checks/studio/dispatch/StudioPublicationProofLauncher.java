package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.guided.publication.LearnProofRepository;
import com.citi.put.checks.studio.guided.publication.PublicationProofLauncher;
import java.util.UUID;

/**
 * Turns a publication into the same accepted execution a manual replay produces, and links it. The
 * existing {@link StudioDispatcher}, runner admission, callbacks and recovery then run it; nothing
 * about the proof is special after acceptance.
 */
public final class StudioPublicationProofLauncher implements PublicationProofLauncher {
  private final StudioAcceptanceService acceptance;
  private final LearnProofRepository proofs;

  public StudioPublicationProofLauncher(
      StudioAcceptanceService acceptance, LearnProofRepository proofs) {
    this.acceptance = acceptance;
    this.proofs = proofs;
  }

  @Override
  public void launch(String sessionId, UUID testId, UUID revisionId, String principal) {
    if (proofs.find(sessionId).isPresent()) {
      // The caller holds the session row lock, so this is the only writer: a second pass through
      // the publication (it found its own receipt) must not accept a second proof.
      return;
    }
    StudioAcceptanceService.PublishedResult accepted =
        acceptance.acceptPublished(testId, revisionId, principal);
    proofs.insert(sessionId, revisionId, accepted.executionId(), accepted.refusalCode());
  }
}
