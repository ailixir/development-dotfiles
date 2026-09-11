package com.citi.put.checks.studio.recovery;

import java.util.Optional;
import java.util.UUID;

/**
 * Reads a terminal result manifest at the <b>deterministic key the API derives</b> (§6.2, AC-31).
 *
 * <p>Three things this interface deliberately cannot do, because each is the shape of a real
 * failure:
 *
 * <ul>
 *   <li>It cannot <b>list</b>. Recovery reads one known key; a bucket listing would make recovery
 *       depend on permissions the API should not hold and on an enumeration that grows forever.
 *   <li>It cannot take a <b>runner-supplied key</b>. The key is derived here from immutable
 *       execution identity, so a compromised or buggy runner cannot point recovery at an object it
 *       chose.
 *   <li>It cannot follow a <b>durable callback URL</b>. There is no URL: there is an identity and a
 *       derivation.
 * </ul>
 *
 * <p>Real Sonic keys, write-only runner credentials, read-only API credentials and 30-day lifecycle
 * behaviour are `ED-03` and belong to stories 10.14 and 10.18. <b>The key derivation itself is not
 * deferred</b> and lives in {@link ManifestKeys}.
 */
public interface ResultManifestStore {

  Optional<ResultManifest> read(String key);

  /**
   * Whether the store is reachable at all; an unreachable store must not look like an absent key.
   */
  boolean isAvailable();

  /** Identity the key is derived from. Every component is immutable once acceptance commits. */
  record ExecutionIdentity(String csiId, UUID testId, UUID executionId, UUID attemptId) {}
}
