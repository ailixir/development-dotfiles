package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.util.AccessPattern;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The cumulative snapshot the runner posts (§5.3, §8.4), closed to unknown fields.
 *
 * <p>Every report is full current state and never a delta, so two lost deliveries are recovered by
 * the third and nothing has to be replayed — which is what lets progress delivery be best-effort
 * from a component that holds no durable state.
 *
 * <p><b>This is not {@code ExecutionSnapshot}</b>, and conflating them was the divergence ADR-002
 * §INT-4 settles. {@code RunnerReportProjection} translates one into the other.
 *
 * @param browserStartedAt the single wall-clock instant the runner holds for a run, read at the
 *     same instant as the run clock's zero. A report carrying {@code null} here carries <b>no
 *     reading at all</b> — every {@code atMs} is null and {@code steps} is empty. A report that
 *     breaks that invariant is a {@code 400}, not a partially derived snapshot (ADR-002 §11.2)
 * @param payloadReduced set when bounding had to shed logs, then steps, to fit the callback bound
 * @param secretUse names-only usage facts for declared secrets; never resolved values
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunnerReport(
    UUID executionId,
    UUID attemptId,
    UUID admissionId,
    String runnerInstanceId,
    String kind,
    Long runnerSequence,
    Instant reportedAt,
    Instant browserStartedAt,
    List<RunnerStepState> steps,
    List<RunnerLogEntry> logs,
    Boolean logsTruncated,
    Map<String, Object> runtimeVersions,
    RunOutcome outcome,
    RunnerEvidence evidence,
    Boolean payloadReduced,
    @JsonDeserialize(using = SecretUseDeserializer.class) Map<String, String> secretUse) {

  public RunnerReport {
    secretUse = secretUse == null ? Map.of() : Map.copyOf(secretUse);
    if (STARTED.equals(kind) && !secretUse.isEmpty()
        || PROGRESS.equals(kind)
            && secretUse.values().stream().anyMatch(value -> !"USED".equals(value))) {
      throw new IllegalArgumentException("Invalid secret usage report kind");
    }
    if (secretUse.size() > 64
        || secretUse.entrySet().stream()
            .anyMatch(
                entry ->
                    !entry.getKey().matches("[A-Za-z0-9_.-]{1,64}")
                        || !Set.of("USED", "NOT_USED", "REFUSED").contains(entry.getValue()))) {
      throw new IllegalArgumentException("Invalid secret usage report");
    }
  }

  /** Optional absence is empty; an explicit null is outside the closed wire contract. */
  public static final class SecretUseDeserializer extends JsonDeserializer<Map<String, String>> {
    @Override
    public Map<String, String> deserialize(JsonParser parser, DeserializationContext context)
        throws IOException {
      return context.readValue(
          parser, context.getTypeFactory().constructMapType(Map.class, String.class, String.class));
    }

    @Override
    public Map<String, String> getAbsentValue(DeserializationContext context) {
      return Map.of();
    }

    @Override
    public Map<String, String> getNullValue(DeserializationContext context)
        throws JsonMappingException {
      return context.reportInputMismatch(Map.class, "Secret usage must be an object");
    }

    @Override
    public AccessPattern getNullAccessPattern() {
      return AccessPattern.DYNAMIC;
    }
  }

  public static final String STARTED = "STARTED";
  public static final String PROGRESS = "PROGRESS";
  public static final String FINAL = "FINAL";
}
