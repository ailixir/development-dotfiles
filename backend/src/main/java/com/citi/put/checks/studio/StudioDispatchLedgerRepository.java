package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.StudioDispatchLedger;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Dispatch ledger repository (AC-6, AC-18).
 *
 * <p>The unique {@code (principal, idempotency_key)} constraint is what makes execute idempotency
 * durable across API replicas and restarts: a retry finds the committed row here rather than
 * relying on one replica's in-memory filter.
 */
public interface StudioDispatchLedgerRepository extends JpaRepository<StudioDispatchLedger, UUID> {

  Optional<StudioDispatchLedger> findByPrincipalAndIdempotencyKey(
      String principal, String idempotencyKey);
}
