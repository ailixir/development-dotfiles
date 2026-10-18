package com.citi.put.checks.studio.guided.evidence;

import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The deterministic object keys of one guided learn-run recording (STUDIO-OBS-013, ruling AR-1 R5).
 *
 * <ul>
 *   <li>video: {@code studio/{csiId}/guided/{sessionId}.webm}
 *   <li>manifest: {@code studio/{csiId}/guided/{sessionId}.manifest.json}
 * </ul>
 *
 * <p>The runner derives the same strings from the same two values ({@code guided/evidence.ts}); the
 * shared golden vector {@code fixtures.json guidedRecordingKeyVector} is tested on both sides, so
 * no key ever crosses the wire. Every segment must match {@code ^[A-Za-z0-9_-]{1,256}$}; otherwise
 * derivation fails closed and returns empty, which keeps a crafted CSI or session id from reaching
 * another CSI's prefix. There is no collision with execution keys, whose identity segments are
 * UUIDs under {@code studio/{csiId}/{testId}/...}, because {@code guided} is not a UUID.
 *
 * <p>Keys are server-side only: they are stored in V20 for lifecycle and audit, re-derived on read,
 * and never appear in a public body, header or problem detail.
 */
public final class GuidedRecordingKeys {

  private static final Pattern SEGMENT = Pattern.compile("^[A-Za-z0-9_-]{1,256}$");

  private GuidedRecordingKeys() {}

  /** The two keys. */
  public record Keys(String videoKey, String manifestKey) {}

  /**
   * Derives both keys, or empty when either segment is outside the key alphabet.
   *
   * @param csiId the session's {@code scope.csiId}
   * @param sessionId the session id
   * @return the keys, or empty (fail closed)
   */
  public static Optional<Keys> derive(String csiId, String sessionId) {
    if (!segment(csiId) || !segment(sessionId)) {
      return Optional.empty();
    }
    String prefix = "studio/" + csiId + "/guided/" + sessionId;
    return Optional.of(new Keys(prefix + ".webm", prefix + ".manifest.json"));
  }

  static boolean segment(String value) {
    return value != null && SEGMENT.matcher(value).matches();
  }
}
