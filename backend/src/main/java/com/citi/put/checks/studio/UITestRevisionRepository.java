package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITestRevision;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Read access to immutable compiled revisions.
 *
 * <p>Revisions are never updated or deleted through this repository: every mutation goes through
 * {@code CompileStateService}'s conditional statements, and the database trigger installed in V12
 * rejects anything else. Revisions of a soft-deleted test stay readable (AC-14).
 */
public interface UITestRevisionRepository extends JpaRepository<UITestRevision, UUID> {

  List<UITestRevision> findByTestIdOrderByCreatedAtDesc(UUID testId);

  Page<UITestRevision> findByTestId(UUID testId, Pageable pageable);

  Optional<UITestRevision> findByIdAndTestId(UUID id, UUID testId);

  Optional<UITestRevision> findByIdAndTestIdAndCsiId(UUID id, UUID testId, String csiId);
}
