package com.citi.put.checks.studio.dto;

/**
 * Actual runtime versions observed for a run (Architecture §4.6).
 *
 * <p>All fields are null for legacy history: those rows never had a confirmed revision and acquire
 * no fabricated provenance (§8.1).
 */
public record RuntimeVersions(
    String playwright, String chromium, String validator, String executor, String image) {

  public static RuntimeVersions unknown() {
    return new RuntimeVersions(null, null, null, null, null);
  }
}
