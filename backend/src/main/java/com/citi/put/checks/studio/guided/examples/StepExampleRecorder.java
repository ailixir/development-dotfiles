package com.citi.put.checks.studio.guided.examples;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Stores one example per PASSED step of a revision once its model-free proof receipts exist
 * (ADR-SC-008 D6, FR-13). The recorder is the binding between a receipt and the stored text: it
 * recomputes {@code hash(code) == sourceHash} and {@code hash(operation record) ==
 * receipt.step_hash} from the revision artifact before it sanitizes anything. The V35 trigger then
 * checks the receipt tuple and the artifact's sourceHash again.
 */
@Component
public class StepExampleRecorder {
  private static final Logger LOG = LoggerFactory.getLogger(StepExampleRecorder.class);

  private final JdbcTemplate jdbc;
  private final StepExampleStore store;
  private final ObjectMapper mapper;
  private final TransactionTemplate fresh;

  public StepExampleRecorder(
      JdbcTemplate jdbc,
      StepExampleStore store,
      ObjectMapper mapper,
      PlatformTransactionManager transactions) {
    this.jdbc = jdbc;
    this.store = store;
    this.mapper = mapper;
    this.fresh = new TransactionTemplate(transactions);
    this.fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * Records after the surrounding transaction commits (directly when there is none), in a fresh
   * transaction. Never throws: a failure is logged as a closed code only, so the caller's promotion
   * is unaffected, and a rolled-back caller records nothing.
   */
  public void recordProvenAfterCommit(UUID revisionId) {
    Runnable run =
        () -> {
          try {
            fresh.executeWithoutResult(status -> recordProven(revisionId));
          } catch (RuntimeException e) {
            LOG.warn("step example recording failed code=EXAMPLE_RECORD_FAILED");
          }
        };
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.registerSynchronization(
          new TransactionSynchronization() {
            @Override
            public void afterCommit() {
              run.run();
            }
          });
    } else {
      run.run();
    }
  }

  /**
   * @return how many examples were stored (steps already stored or unstorable do not count)
   */
  public int recordProven(UUID revisionId) {
    List<Map<String, Object>> revisions =
        jdbc.queryForList(
            "SELECT v.csi_id, v.artifact::text AS artifact, v.authoring::text AS authoring,"
                + " t.variables::text AS variables FROM ui_test_revisions v JOIN ui_tests t ON t.id = v.test_id"
                + " WHERE v.id = ?",
            revisionId);
    if (revisions.isEmpty()) {
      return 0;
    }
    Map<String, Object> revision = revisions.get(0);
    JsonNode artifact = read((String) revision.get("artifact"));
    JsonNode authoring = read((String) revision.get("authoring"));
    Map<String, String> known = plainValues((String) revision.get("variables"));
    int stored = 0;
    List<Map<String, Object>> receipts =
        jdbc.queryForList(
            "SELECT step_ordinal, proof_execution_id, step_hash FROM studio_step_receipts"
                + " WHERE revision_id = ? AND status = 'PASSED' AND step_hash IS NOT NULL"
                + " ORDER BY step_ordinal",
            revisionId);
    for (Map<String, Object> receipt : receipts) {
      int ordinal = ((Number) receipt.get("step_ordinal")).intValue();
      JsonNode step = artifact.path("steps").path(ordinal);
      JsonNode operation = step.path("operations").path(0).path("operation");
      JsonNode code = operation.path("code");
      String stepHash = ((String) receipt.get("step_hash")).trim();
      if (!code.isTextual()
          || !GuidedContracts.hash(code).equals(operation.path("sourceHash").asText())
          || !GuidedContracts.hash(operation).equals(stepHash)) {
        continue;
      }
      String text = stepText(authoring, step.path("stepId").asText(""));
      if (text == null) {
        continue;
      }
      var cleaned = StepExampleSanitizer.forStore(text, code.asText(), known);
      if (cleaned.isEmpty()) {
        continue;
      }
      boolean inserted =
          store.insert(
              new StepExampleStore.NewExample(
                  (String) revision.get("csi_id"),
                  revisionId,
                  ordinal,
                  (UUID) receipt.get("proof_execution_id"),
                  stepHash,
                  operation.path("sourceHash").asText(),
                  cleaned.get().stepText(),
                  originHost(artifact, step.path("operations").path(0).path("guardId").asText("")),
                  cleaned.get().code()));
      stored += inserted ? 1 : 0;
    }
    return stored;
  }

  private static String stepText(JsonNode authoring, String stepId) {
    for (JsonNode candidate : authoring.path("steps")) {
      if (candidate.path("id").asText().equals(stepId) && candidate.path("text").isTextual()) {
        return candidate.path("text").asText();
      }
    }
    return null;
  }

  private static String originHost(JsonNode artifact, String guardId) {
    for (JsonNode guard : artifact.path("guards")) {
      if (guard.path("guardId").asText().equals(guardId) && guard.path("origin").isTextual()) {
        try {
          String host = URI.create(guard.path("origin").asText()).getHost();
          return host == null ? null : host.toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
          return null;
        }
      }
    }
    return null;
  }

  /** Plain variable value to variable name; secret references carry no value. */
  private Map<String, String> plainValues(String variables) {
    Map<String, String> known = new HashMap<>();
    if (variables == null) {
      return known;
    }
    for (JsonNode variable : read(variables)) {
      if ("plain".equals(variable.path("kind").asText())
          && variable.path("value").isTextual()
          && !variable.path("value").asText().isBlank()) {
        known.put(variable.path("value").asText(), variable.path("name").asText());
      }
    }
    return known;
  }

  private JsonNode read(String json) {
    try {
      return json == null ? mapper.createObjectNode() : mapper.readTree(json);
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Stored revision JSON is unreadable", e);
    }
  }
}
