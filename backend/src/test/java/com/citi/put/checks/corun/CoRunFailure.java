package com.citi.put.checks.corun;

/**
 * A co-run failure that names <b>which component refused what</b>.
 *
 * <p>This type exists because of a specific, measured problem. The epic's two HIGH integration
 * defects were both invisible to every green suite and were found by reading rather than running,
 * and the reason nothing could have found them by running is that nothing ran the API and the
 * runner together. The first harness that does has one job beyond going red: when it goes red it
 * must say which of the two processes objected, to what, and in what words — because a harness that
 * reports "the co-run failed" hands the reader exactly the ambiguity the co-run was built to
 * remove, and the compound first failure it was built to prevent in staging.
 *
 * <p>Every instance therefore carries three parts and renders them in a fixed shape:
 *
 * <pre>
 * CO-RUN FAILURE
 *   component : studio-runner
 *   refused   : POST /v1/runs with 401 IDENTITY_MISSING
 *   detail    : the API's dispatch client sent no Authorization header
 * </pre>
 *
 * <p><b>Nothing here ever carries a dispatch body.</b> Since story 10.17 the {@code POST /v1/runs}
 * body carries resolved variable and secret values, and the production client is built so the body
 * reaches no log, message or cause chain. A harness that printed it while diagnosing a refusal
 * would create the leak the client is written to avoid, so the details below are statuses, codes,
 * header names and route paths only.
 */
final class CoRunFailure extends AssertionError {

  private static final long serialVersionUID = 1L;

  private final transient String component;
  private final transient String refusal;

  CoRunFailure(String component, String refusal, String detail) {
    super(render(component, refusal, detail));
    this.component = component;
    this.refusal = refusal;
  }

  String component() {
    return component;
  }

  String refusal() {
    return refusal;
  }

  private static String render(String component, String refusal, String detail) {
    return "CO-RUN FAILURE\n"
        + "  component : "
        + component
        + "\n"
        + "  refused   : "
        + refusal
        + "\n"
        + "  detail    : "
        + detail;
  }
}
