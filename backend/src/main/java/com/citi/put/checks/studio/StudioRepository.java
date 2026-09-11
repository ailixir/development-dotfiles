package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITest;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Drafts repository.
 *
 * <p>Deleted and quarantined rows are excluded from every entity query by the {@code
 * &#64;SQLRestriction} on {@link UITest} — that annotation is the single quarantine predicate
 * reused by every list/get path (AC-3). {@link #findLifecycleState(UUID)} deliberately bypasses it
 * so the service can tell "unknown test" from "deleted" or "quarantined".
 */
public interface StudioRepository extends JpaRepository<UITest, UUID> {

  @Query(
      """
      SELECT t FROM UITest t
      WHERE (:csiId IS NULL OR t.csiId = :csiId)
      """)
  Page<UITest> findAllFiltered(@Param("csiId") String csiId, Pageable pageable);

  /**
   * Same listing, additionally scoped to the CSIs the caller may read. The scope is applied in SQL,
   * before paging, so page counts never leak the existence of other CSIs' drafts (AC-14,
   * Architecture §9.1).
   */
  @Query(
      """
      SELECT t FROM UITest t
      WHERE (:csiId IS NULL OR t.csiId = :csiId)
        AND t.csiId IN :readableCsiIds
      """)
  Page<UITest> findAllFilteredScoped(
      @Param("csiId") String csiId,
      @Param("readableCsiIds") Collection<String> readableCsiIds,
      Pageable pageable);

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
