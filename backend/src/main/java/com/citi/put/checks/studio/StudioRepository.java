package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITest;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Drafts repository.
 *
 * <p>Deleted and quarantined rows are excluded from every entity query by the {@code
 * &#64;SQLRestriction} on {@link UITest} — that annotation is the single quarantine predicate
 * reused by every list/get path (AC-3), including {@link StudioRepositoryCustom#findPage}. {@link
 * #findLifecycleState(UUID)} deliberately bypasses it so the service can tell "unknown test" from
 * "deleted" or "quarantined".
 */
public interface StudioRepository extends JpaRepository<UITest, UUID>, StudioRepositoryCustom {

  /**
   * Names of the visible drafts among {@code ids}, for labelling one page of execution history
   * (Story 10.46). One statement per page, never one per row. A deleted or quarantined draft is
   * hidden by the {@code &#64;SQLRestriction} and therefore simply absent from the result.
   *
   * @param ids the drafts a page of executions refers to
   * @return id and name of each visible one
   */
  @Query("SELECT t.id AS id, t.name AS name FROM UITest t WHERE t.id IN :ids")
  List<TestName> findNamesByIdIn(@Param("ids") Collection<UUID> ids);

  /**
   * The current name of one visible draft, or null when it is deleted, quarantined or absent.
   *
   * @param id the draft
   * @return its name, or null
   */
  default String findVisibleName(UUID id) {
    return findNamesByIdIn(List.of(id)).stream().findFirst().map(TestName::getName).orElse(null);
  }

  /** Id and name of a draft. */
  interface TestName {
    UUID getId();

    String getName();
  }

  /**
   * Loads a visible draft and locks its row for the rest of the transaction, so two concurrent
   * saves are serialized and the loser observes the already-incremented revisions (AC-6, AC-16).
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT t FROM UITest t WHERE t.id = :id")
  Optional<UITest> findByIdForUpdate(@Param("id") UUID id);

  @Query(
      value =
          """
          SELECT CASE
                   WHEN deleted_at IS NOT NULL THEN 'DELETED'
                   WHEN quarantined_at IS NOT NULL THEN 'QUARANTINED'
                   ELSE 'ACTIVE'
                 END
            FROM ui_tests
           WHERE id = :id
          """,
      nativeQuery = true)
  Optional<String> findLifecycleState(@Param("id") UUID id);

  /**
   * The CSI of a draft <em>whatever its lifecycle state</em>, for authorization only.
   *
   * <p>ADR-002 §14.4 orders the compile route authorization → lifecycle → bounds, so that a caller
   * who may not act on the draft's CSI never learns from a status code whether the draft exists.
   * Authorizing first needs the CSI of a withheld draft, and every entity query hides those rows —
   * so this read bypasses the {@code &#64;SQLRestriction} exactly as {@link
   * #findLifecycleState(UUID)} does, and for the same reason.
   *
   * <p>It returns the CSI and nothing else: no name, no steps, no state. An absent row and a
   * quarantined row whose {@code csi_id} is {@code NULL} both yield an empty result, and both are
   * refused {@code 403} — a row that has lost its only authorization anchor is recoverable by an
   * administrator, not by a status code (ADR-002 §14.4).
   *
   * @param id the draft
   * @return its CSI, or empty when the row is absent or carries none
   */
  @Query(value = "SELECT csi_id FROM ui_tests WHERE id = :id", nativeQuery = true)
  Optional<String> findCsiIdIncludingWithheld(@Param("id") UUID id);
}
