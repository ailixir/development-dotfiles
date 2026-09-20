package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestExecutionId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/** Ledger-first implementation of {@link UITestExecutionRepositoryCustom}. */
@Repository
public class UITestExecutionRepositoryCustomImpl implements UITestExecutionRepositoryCustom {

  @PersistenceContext private EntityManager entityManager;

  @Override
  public Optional<UITestExecution> findByExecutionId(UUID executionId) {
    List<Instant> locator =
        entityManager
            .createQuery(
                "SELECT l.executionAcceptedAt FROM StudioDispatchLedger l "
                    + "WHERE l.executionId = :executionId",
                Instant.class)
            .setParameter("executionId", executionId)
            .setMaxResults(1)
            .getResultList();
    if (locator.isEmpty()) {
      return Optional.empty();
    }
    return Optional.ofNullable(
        entityManager.find(
            UITestExecution.class, new UITestExecutionId(executionId, locator.get(0))));
  }
}
