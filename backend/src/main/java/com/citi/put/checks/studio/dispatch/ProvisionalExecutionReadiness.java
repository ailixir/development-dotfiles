package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestRevision;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * This story's provisional implementation of {@link ExecutionReadiness}, which story 10.8 deletes
 * when it supplies {@code ExecutionReadinessService} (AC-8a, AC-8b).
 *
 * <p><b>Readiness is deliberately not expressed as {@code compile_status = 'READY'}.</b> Story
 * 10.4's ISSUE-003 records that {@code beginCompile} is unconditional on current status, so a
 * failed <em>optional</em> recompile drives a confirmed, unedited draft {@code READY → COMPILING →
 * STALE}. A {@code READY} check would then refuse to run an artifact the user already reviewed and
 * confirmed — a run the product promised. The predicate keys instead on the confirmed revision
 * still matching both of the draft's revisions, and on that revision carrying an artifact hash.
 *
 * <p>The falsifying test is explicit and lives in {@code AcceptanceIT}: a confirmed, unedited draft
 * whose {@code compile_status} was pushed to {@code STALE} by a failed optional recompile is
 * accepted, and any implementation that consults {@code compile_status} fails it.
 */
@Component
public class ProvisionalExecutionReadiness implements ExecutionReadiness {

  private final UITestRevisionRepository revisions;

  public ProvisionalExecutionReadiness(UITestRevisionRepository revisions) {
    this.revisions = revisions;
  }

  @Override
  public Verdict evaluate(UITest test) {
    if (test.getConfirmedRevisionId() == null) {
      return Verdict.compileRequired(
          "This draft has never been compiled and confirmed; compile and confirm it before running");
    }
    Optional<UITestRevision> confirmed = revisions.findById(test.getConfirmedRevisionId());
    if (confirmed.isEmpty()) {
      return Verdict.compileRequired(
          "The confirmed revision for this draft is no longer available; recompile and confirm it");
    }
    UITestRevision revision = confirmed.get();
    if (revision.getSourceRevision() != test.getSourceRevision()
        || revision.getConfigurationRevision() != test.getConfigurationRevision()) {
      return Verdict.compileRequired(
          "The draft changed since its last confirmation (confirmed source/configuration revision "
              + revision.getSourceRevision()
              + "/"
              + revision.getConfigurationRevision()
              + ", draft is at "
              + test.getSourceRevision()
              + "/"
              + test.getConfigurationRevision()
              + "); compile and confirm it before running");
    }
    if (revision.getArtifactHash() == null || revision.getArtifactHash().isBlank()) {
      return Verdict.runtimeIncompatible(
          "The confirmed revision carries no artifact hash and cannot be executed; recompile it");
    }
    return Verdict.accepted();
  }
}
