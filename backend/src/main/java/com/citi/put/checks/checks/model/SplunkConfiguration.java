package com.citi.put.checks.checks.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Locale;
import java.util.Set;

public record SplunkConfiguration(
    @JsonProperty("type") String type,
    @JsonProperty("query") String query,
    @JsonProperty("index") String index,
    @JsonProperty("timeRange") String timeRange,
    @JsonProperty("expectedCount") Integer expectedCount,
    @JsonProperty("countOperator") String countOperator)
    implements CheckConfiguration {

  private static final Set<String> OPERATORS = Set.of(">", ">=", "<", "<=", "==", "=");

  public SplunkConfiguration {
    if (type == null) {
      type = "SPLUNK";
    }
    if (query == null || query.isBlank()) {
      throw new IllegalArgumentException("SPLUNK query is required");
    }
    if (timeRange == null || timeRange.isBlank()) {
      timeRange = "15m";
    }
    if (expectedCount == null) {
      expectedCount = 0;
    }
    if (expectedCount < 0) {
      throw new IllegalArgumentException("SPLUNK expectedCount must be >= 0");
    }
    if (countOperator == null || countOperator.isBlank()) {
      countOperator = ">";
    }
    countOperator = countOperator.trim();
    if ("===".equals(countOperator)) {
      countOperator = "==";
    }
    if (!OPERATORS.contains(countOperator)) {
      throw new IllegalArgumentException(
          "Unsupported SPLUNK countOperator: " + countOperator + ". Allowed: " + OPERATORS);
    }
    if (index != null) {
      index = index.isBlank() ? null : index.trim();
    }
    type = type.toUpperCase(Locale.ROOT);
  }
}
