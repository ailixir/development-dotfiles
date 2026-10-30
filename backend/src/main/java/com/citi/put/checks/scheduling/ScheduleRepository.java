package com.citi.put.checks.scheduling;

import com.citi.put.checks.scheduling.entity.Schedule;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduleRepository extends JpaRepository<Schedule, UUID> {

  Optional<Schedule> findByCheckId(UUID checkId);

  Optional<Schedule> findByUiTestId(UUID uiTestId);

  /** The CSI of a visible UI test; empty when it is absent, deleted or quarantined. */
  @Query("SELECT t.csiId FROM UITest t WHERE t.id = :id AND t.csiId IS NOT NULL")
  Optional<String> findUiTestCsiId(@Param("id") UUID id);

  Page<Schedule> findAllByEnabled(boolean enabled, Pageable pageable);

  @Query(
      """
      SELECT s FROM Schedule s
      WHERE (:checkId IS NULL OR s.checkId = :checkId)
        AND (:uiTestId IS NULL OR s.uiTestId = :uiTestId)
        AND (:enabled IS NULL OR s.enabled = :enabled)
        AND (:timezone IS NULL OR s.timezone = :timezone)
      """)
  Page<Schedule> findAllFiltered(
      @Param("checkId") UUID checkId,
      @Param("uiTestId") UUID uiTestId,
      @Param("enabled") Boolean enabled,
      @Param("timezone") String timezone,
      Pageable pageable);

  @Query(
      """
      SELECT s FROM Schedule s
      WHERE (s.checkId IN (
                SELECT c.id FROM com.citi.put.checks.checks.entity.Check c
                WHERE c.csiId IN :ownedCsiIds)
             OR s.uiTestId IN (SELECT t.id FROM UITest t WHERE t.csiId IN :ownedCsiIds))
        AND (:checkId IS NULL OR s.checkId = :checkId)
        AND (:uiTestId IS NULL OR s.uiTestId = :uiTestId)
        AND (:enabled IS NULL OR s.enabled = :enabled)
        AND (:timezone IS NULL OR s.timezone = :timezone)
      """)
  Page<Schedule> findAllVisibleToFiltered(
      @Param("ownedCsiIds") Collection<String> ownedCsiIds,
      @Param("checkId") UUID checkId,
      @Param("uiTestId") UUID uiTestId,
      @Param("enabled") Boolean enabled,
      @Param("timezone") String timezone,
      Pageable pageable);

  @Query(
      """
      SELECT s FROM Schedule s
      WHERE s.enabled = true
        AND s.nextExecutionAt IS NOT NULL
        AND s.nextExecutionAt <= :now
      ORDER BY s.nextExecutionAt ASC
      """)
  List<Schedule> findDueSchedules(@Param("now") Instant now, Pageable pageable);

  @Query(
      """
      SELECT s FROM Schedule s
      WHERE s.enabled = true
        AND s.checkType = :checkType
        AND s.nextExecutionAt IS NOT NULL
        AND s.nextExecutionAt <= :now
      ORDER BY s.nextExecutionAt ASC
      """)
  List<Schedule> findDueByType(
      @Param("now") Instant now, @Param("checkType") String checkType, Pageable pageable);
}
