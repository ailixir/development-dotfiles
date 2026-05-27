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

  Page<Schedule> findAllByEnabled(boolean enabled, Pageable pageable);

  @Query(
      """
      SELECT s FROM Schedule s
      WHERE (:checkId IS NULL OR s.checkId = :checkId)
        AND (:enabled IS NULL OR s.enabled = :enabled)
        AND (:timezone IS NULL OR s.timezone = :timezone)
      """)
  Page<Schedule> findAllFiltered(
      @Param("checkId") UUID checkId,
      @Param("enabled") Boolean enabled,
      @Param("timezone") String timezone,
      Pageable pageable);

  @Query(
      """
      SELECT s FROM Schedule s
      JOIN com.citi.put.checks.checks.entity.Check c ON c.id = s.checkId
      WHERE c.csiId IN :ownedCsiIds
        AND (:checkId IS NULL OR s.checkId = :checkId)
        AND (:enabled IS NULL OR s.enabled = :enabled)
        AND (:timezone IS NULL OR s.timezone = :timezone)
      """)
  Page<Schedule> findAllVisibleToFiltered(
      @Param("ownedCsiIds") Collection<String> ownedCsiIds,
      @Param("checkId") UUID checkId,
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
