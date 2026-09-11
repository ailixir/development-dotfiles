package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * What the runner knows about evidence: whether it stored the objects whose keys the job gave it.
 *
 * <p>Deliberately not the public {@code VideoStatus}: two of those values are the API's judgment
 * and not the runner's. {@code AVAILABLE} depends on retention and {@code EXPIRED} the runner can
 * never observe, because it holds no Get and no List permission (§6.1, §6.2).
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunnerEvidence(String videoKey, String manifestKey, String state) {

  public static final String PENDING = "PENDING";
  public static final String STORED = "STORED";
  public static final String FAILED = "FAILED";
  public static final String UNAVAILABLE = "UNAVAILABLE";
}
