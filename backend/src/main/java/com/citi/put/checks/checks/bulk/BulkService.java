package com.citi.put.checks.checks.bulk;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class BulkService {

  private static final Logger LOG = LoggerFactory.getLogger(BulkService.class);

  private final CheckRepository checkRepository;
  private final CsiOwnershipEvaluator ownershipEvaluator;
  private final PlatformTransactionManager txManager;
  private final MeterRegistry registry;

  public BulkService(
      CheckRepository checkRepository,
      CsiOwnershipEvaluator ownershipEvaluator,
      PlatformTransactionManager txManager,
      MeterRegistry registry) {
    this.checkRepository = checkRepository;
    this.ownershipEvaluator = ownershipEvaluator;
    this.txManager = txManager;
    this.registry = registry;
  }

  public BulkResponseDto execute(BulkRequestDto request, Authentication auth) {
    String correlationId = UUID.randomUUID().toString();
    MDC.put("bulk_correlation_id", correlationId);

    try {
      List<BulkOperation> ops = request.operations();

      List<UUID> ids = ops.stream().map(BulkOperation::id).toList();
      Map<UUID, Check> checkMap =
          checkRepository.findAllById(ids).stream().collect(Collectors.toMap(Check::getId, c -> c));

      Set<String> csiIds = new HashSet<>();
      boolean allFound = true;
      for (BulkOperation op : ops) {
        Check check = checkMap.get(op.id());
        if (check != null) {
          csiIds.add(check.getCsiId());
        } else {
          allFound = false;
        }
      }

      boolean singleCsi = allFound && csiIds.size() == 1;

      List<BulkResponseDto.OpResult> results;
      if (singleCsi) {
        results = executeSingleCsi(ops, checkMap, auth, correlationId);
      } else {
        results = executePerOp(ops, checkMap, auth, correlationId);
      }

      long successCount = results.stream().filter(r -> "SUCCESS".equals(r.status())).count();
      long failCount = results.size() - successCount;
      registry
          .counter("checks_bulk_operations_total", "op", "delete", "outcome", "success")
          .increment(successCount);
      registry
          .counter("checks_bulk_operations_total", "op", "delete", "outcome", "failed")
          .increment(failCount);
      registry.summary("checks_bulk_batch_size").record(results.size());

      return new BulkResponseDto(results);
    } finally {
      MDC.remove("bulk_correlation_id");
    }
  }

  private List<BulkResponseDto.OpResult> executeSingleCsi(
      List<BulkOperation> ops,
      Map<UUID, Check> checkMap,
      Authentication auth,
      String correlationId) {
    String csiId = checkMap.values().iterator().next().getCsiId();
    if (!ownershipEvaluator.canWrite(auth, csiId)) {
      return IntStream.range(0, ops.size())
          .mapToObj(
              i -> failResult(i, ops.get(i).id(), "FORBIDDEN", "No write access to CSI " + csiId))
          .toList();
    }

    TransactionTemplate tx = new TransactionTemplate(txManager);
    try {
      return tx.execute(
          status -> {
            List<UUID> ids = ops.stream().map(BulkOperation::id).toList();
            Map<UUID, Check> managed =
                checkRepository.findAllById(ids).stream()
                    .collect(Collectors.toMap(Check::getId, c -> c));

            List<BulkResponseDto.OpResult> results = new ArrayList<>();
            for (int i = 0; i < ops.size(); i++) {
              Check check = managed.get(ops.get(i).id());
              check.setDeletedAt(Instant.now());
              results.add(new BulkResponseDto.OpResult(i, "SUCCESS", ops.get(i).id(), null));
              LOG.info(
                  "bulk op_index={} check_id={} outcome=success correlation={}",
                  i,
                  ops.get(i).id(),
                  correlationId);
            }
            return results;
          });
    } catch (Exception e) {
      LOG.error("Single-CSI batch rolled back: {}", e.getMessage());
      return IntStream.range(0, ops.size())
          .mapToObj(i -> failResult(i, ops.get(i).id(), "TRANSACTION_FAILED", e.getMessage()))
          .toList();
    }
  }

  private List<BulkResponseDto.OpResult> executePerOp(
      List<BulkOperation> ops,
      Map<UUID, Check> checkMap,
      Authentication auth,
      String correlationId) {
    TransactionTemplate tx = new TransactionTemplate(txManager);
    tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

    List<BulkResponseDto.OpResult> results = new ArrayList<>();
    for (int i = 0; i < ops.size(); i++) {
      BulkOperation op = ops.get(i);
      Check check = checkMap.get(op.id());

      if (check == null) {
        results.add(failResult(i, op.id(), "NOT_FOUND", "Check not found: " + op.id()));
        LOG.info(
            "bulk op_index={} check_id={} outcome=failed reason=NOT_FOUND correlation={}",
            i,
            op.id(),
            correlationId);
        continue;
      }

      if (!ownershipEvaluator.canWrite(auth, check.getCsiId())) {
        results.add(
            failResult(i, op.id(), "FORBIDDEN", "No write access to CSI " + check.getCsiId()));
        LOG.info(
            "bulk op_index={} check_id={} outcome=failed reason=FORBIDDEN correlation={}",
            i,
            op.id(),
            correlationId);
        continue;
      }

      try {
        tx.executeWithoutResult(
            status -> {
              Check c = checkRepository.findById(op.id()).orElseThrow();
              c.setDeletedAt(Instant.now());
            });
        results.add(new BulkResponseDto.OpResult(i, "SUCCESS", op.id(), null));
        LOG.info(
            "bulk op_index={} check_id={} outcome=success correlation={}",
            i,
            op.id(),
            correlationId);
      } catch (Exception e) {
        results.add(failResult(i, op.id(), "INTERNAL_ERROR", e.getMessage()));
        LOG.error(
            "bulk op_index={} check_id={} outcome=failed error={} correlation={}",
            i,
            op.id(),
            e.getMessage(),
            correlationId);
      }
    }
    return results;
  }

  private BulkResponseDto.OpResult failResult(int idx, UUID id, String code, String message) {
    return new BulkResponseDto.OpResult(
        idx, "FAILED", id, new BulkResponseDto.OpError(code, message));
  }
}
