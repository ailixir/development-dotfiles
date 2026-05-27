package com.citi.put.checks.checks.execution;

import com.citi.put.checks.checks.execution.entity.ExecutionResult;
import com.citi.put.checks.checks.execution.entity.ExecutionResultId;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExecutionResultRepository
    extends JpaRepository<ExecutionResult, ExecutionResultId> {

  @Query(
      """
      SELECT e FROM ExecutionResult e
      WHERE e.checkId = :checkId AND e.startedAt < :before
      ORDER BY e.startedAt DESC
      """)
  List<ExecutionResult> findRecentByCheckId(
      @Param("checkId") UUID checkId,
      @Param("before") Instant before,
      org.springframework.data.domain.Pageable pageable);

  @Query(
      """
      SELECT e FROM ExecutionResult e
      WHERE e.checkId = :checkId
      ORDER BY e.startedAt DESC
      """)
  List<ExecutionResult> findRecentByCheckId(
      @Param("checkId") UUID checkId, org.springframework.data.domain.Pageable pageable);

  @Query("SELECT e FROM ExecutionResult e WHERE e.id = :id AND e.checkId = :checkId")
  Optional<ExecutionResult> findByIdAndCheckId(
      @Param("id") UUID id, @Param("checkId") UUID checkId);
}
