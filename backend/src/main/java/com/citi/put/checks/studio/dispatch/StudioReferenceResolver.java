package com.citi.put.checks.studio.dispatch;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The one seam through which a declared variable or secret reference becomes a value (AC-10a,
 * AC-13a).
 *
 * <p>Two operations, deliberately separated, because §5.1.1 and §5.1.3 place them at different
 * points in the lifecycle and the separation is the security property:
 *
 * <ul>
 *   <li>{@link #preflight} runs at <b>acceptance</b> and resolves nothing. It checks that the
 *       declared names are references this CSI is permitted to use. An unknown or unpermitted
 *       reference is a {@code 400} naming the reference and never its value.
 *   <li>{@link #resolve} runs at <b>dispatch</b>, immediately before the send, and nowhere else.
 *       The values it returns are ephemeral: they are never written to the ledger, the history row,
 *       a log line, a retry buffer, a manifest or an SSE payload, and they are cleared on every
 *       exit path including the error path — which is what {@link Resolved} being {@link
 *       AutoCloseable} is for.
 * </ul>
 *
 * <p>Real vault integration and real secret-use authorization are story 10.17 (`ED-02`). What ships
 * here is this seam and the canary that proves values do not leak.
 */
public interface StudioReferenceResolver {

  /** Names only. Throws when a name is unknown to, or not permitted for, this CSI. */
  void preflight(String csiId, List<String> referenceNames);

  /** Values, at dispatch only. Throws {@link ReferenceUnavailableException} for a vanished one. */
  Resolved resolve(String csiId, List<String> referenceNames);

  /** A reference that existed at preflight and does not exist at dispatch (AC-13a). */
  class ReferenceUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final String referenceName;

    public ReferenceUnavailableException(String referenceName) {
      super("Reference '" + referenceName + "' is no longer available at dispatch");
      this.referenceName = referenceName;
    }

    public String getReferenceName() {
      return referenceName;
    }
  }

  /**
   * Resolved values, held as {@code char[]} so that {@link #close()} can actually erase them rather
   * than leaving an interned {@link String} on the heap until a collection it cannot force.
   */
  final class Resolved implements AutoCloseable {

    private final Map<String, char[]> values;

    public Resolved(Map<String, char[]> values) {
      this.values = new LinkedHashMap<>(values);
    }

    public Map<String, char[]> values() {
      return Map.copyOf(values);
    }

    public boolean isEmpty() {
      return values.isEmpty();
    }

    @Override
    public void close() {
      values.values().forEach(value -> Arrays.fill(value, '\0'));
      values.clear();
    }
  }
}
