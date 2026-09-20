package com.citi.put.checks.studio.internal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * What the runner knows about evidence: whether it stored the objects whose keys the job gave it.
 *
 * <p>Deliberately not the public {@code VideoStatus}: two of those values are the API's judgment
 * and not the runner's. {@code AVAILABLE} depends on retention and {@code EXPIRED} the runner can
 * never observe, because it holds no Get and no List permission (§6.1, §6.2).
 *
 * @param partial whether the recording covers the whole browser session it was recording (ADR-002
 *     §17, story 10.14 AC-10). <b>Nullable, matching the contract's optional property</b>, and
 *     absent means {@code false} (§17.5) — but absent is unreachable from the merged runner, which
 *     declares its evidence with {@code partial: false} before the {@code try} and hands it to
 *     {@code sendFinal} non-optionally. Until this component existed the record was three wide and
 *     closed to unknown fields, and {@link
 *     com.citi.put.checks.studio.internal.StrictInternalBodyReader} reads internal bodies with
 *     {@code FAIL_ON_UNKNOWN_PROPERTIES} enabled: <b>every</b> {@code FINAL} the runner sent was
 *     refused {@code 400 INVALID_REPORT}, retried until abandoned and reaped (`DEF-02`). It is a
 *     fact about the <b>recording</b> and is never derived from {@code outcome} in either
 *     direction, by either component (§17.4)
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record RunnerEvidence(String videoKey, String manifestKey, String state, Boolean partial) {

  public static final String PENDING = "PENDING";
  public static final String STORED = "STORED";
  public static final String FAILED = "FAILED";
  public static final String UNAVAILABLE = "UNAVAILABLE";
}
