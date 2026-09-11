package com.citi.put.checks.studio;

/**
 * The caller may not act on this Studio resource, or it does not exist (AC-4a).
 *
 * <p>The two cases are <b>deliberately indistinguishable</b>. §9.1 requires that a {@code 403} not
 * disclose existence; it equally requires that a {@code 404}-shaped answer not be reachable by
 * probing a CSI the caller cannot read. Answering one status for "forbidden" and another for
 * "absent" satisfies neither, because the pair of them is an existence oracle. So every per-id
 * Studio read and every execute answers the same {@code 403} with the same code and no resource
 * detail, whether the id is real and unreadable or simply not there.
 *
 * <p>The frozen contract agrees: {@code getTest}, {@code getExecution} and both callbacks declare
 * {@code 400/401/403} and no {@code 404}.
 */
public class StudioAccessDeniedException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** The one code. It names the decision and nothing about the resource. */
  public static final String CODE = "STUDIO_FORBIDDEN";

  public StudioAccessDeniedException() {
    super("Not permitted");
  }
}
