package com.citi.put.checks.scheduling;

import com.citi.put.checks.scheduling.entity.FailedDispatch;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FailedDispatchRepository extends JpaRepository<FailedDispatch, UUID> {

  @Query(
      "SELECT f FROM FailedDispatch f WHERE f.dispatchType = :type"
          + " AND f.nextRetryAt <= :now AND f.retryCount < f.maxRetries"
          + " ORDER BY f.nextRetryAt ASC")
  List<FailedDispatch> findDueRetries(String type, Instant now, Pageable pageable);

  @Query(
      "SELECT COUNT(f) FROM FailedDispatch f WHERE f.dispatchType = :type"
          + " AND f.retryCount < f.maxRetries")
  long countPending(String type);

  @Query(
      "SELECT COUNT(f) FROM FailedDispatch f WHERE f.retryCount >= f.maxRetries"
          + " AND f.createdAt >= :since")
  long countDeadLetteredSince(Instant since);

  @Query(
      "SELECT COUNT(f) FROM FailedDispatch f WHERE f.dispatchType = :type"
          + " AND f.retryCount >= f.maxRetries")
  long countDeadLettered(String type);
}
