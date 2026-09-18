package com.citi.put.checks.studio.recovery;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * How long a healthy runner may take to finish a cancel, and therefore how long the running reaper
 * waits before it closes one itself (Studio v1 WP16, ADR-002 §29).
 *
 * <p><b>Why this is not the start deadline.</b> Until WP16 the reaper closed an unfinished cancel
 * once {@code start-deadline} (30 s) had passed since it was requested. The runner's own path from
 * a recorded cancel to its accepted {@code FINAL} is bounded by five runner settings, and with the
 * shipped values they add up to far more than 30 s — so a runner whose object store or whose
 * callback was merely slow could have its row closed under it, its {@code FINAL} refused {@code
 * EXECUTION_SETTLED}, and the recording it had stored lost from the row. The reaper is a backstop
 * for a runner that is gone, and a backstop that can fire before a live runner answers is a race.
 *
 * <p><b>The worst case, term by term</b>, each the runner's own bound on that phase:
 *
 * <ol>
 *   <li><b>Observe</b> — {@code controlPollInterval + 2 × reportTimeout}. The control read is the
 *       one signal that always reaches the owning pod. A read already in flight when the cancel
 *       commits may answer "not cancelled" as late as one timeout later; the next read starts one
 *       interval after that and answers within one more timeout. The DELETE relay and the progress
 *       acknowledgement are usually faster, but neither is guaranteed to reach the owner.
 *   <li><b>Stop</b> — {@code stopGrace}: the ordered stop, after which the tree is killed.
 *   <li><b>Settle progress</b> — {@code reportTimeout}: in-flight progress deliveries are awaited
 *       before the terminal report is built, each one attempt bounded by that timeout.
 *   <li><b>Evidence</b> — {@code evidenceWindow}: the whole upload-and-manifest phase.
 *   <li><b>Delivery</b> — {@code deliveryWindow}: the terminal report's bounded retry.
 * </ol>
 *
 * <p>Deliberately <b>not</b> included: the browser launch. A cancel that lands while a browser is
 * launching is obeyed when the launch returns, and a healthy launch takes about a second; a launch
 * that hangs is bounded by the runner's own launch timeout and is the start deadline's business.
 *
 * <p><b>Each value mirrors a runner setting and reads the runner's own environment name</b> ({@code
 * STUDIO_RUNNER_*}), so a deployment that renders the runner's values into the worker as well
 * configures both sides from one fact. The poll interval is a runner constant ({@code
 * CONTROL_POLL_INTERVAL_MS} in {@code runCoordinator.ts}), not a setting.
 *
 * <p><b>The margin is derived, or validated.</b> Unset, it is the worst case plus {@link #slack()}.
 * Set, it must be at least the worst case, and a margin below it is refused when the configuration
 * is bound — at startup, with every term named — because the failure it would otherwise produce is
 * a recording silently missing from a cancelled run, in production, some of the time.
 *
 * @param controlPollInterval the runner's control-read cadence
 * @param reportTimeout the runner's bound on one callback request ({@code
 *     STUDIO_RUNNER_ADMISSION_TIMEOUT_MS}, which the runner also uses for progress and control)
 * @param stopGrace the runner's ordered-stop grace ({@code STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS})
 * @param evidenceWindow the runner's evidence phase ({@code STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS})
 * @param deliveryWindow the runner's terminal delivery ({@code
 *     STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS})
 * @param slack added to the worst case when the margin is derived
 * @param margin an explicit margin, or {@code null} to derive it
 */
@ConfigurationProperties(prefix = "studio.execution.cancel")
public record RunnerCancelBudget(
    Duration controlPollInterval,
    Duration reportTimeout,
    Duration stopGrace,
    Duration evidenceWindow,
    Duration deliveryWindow,
    Duration slack,
    Duration margin) {

  /**
   * The runner's defaults ({@code studio-runner/src/server/config.ts}), used when a key is unset.
   */
  static final Duration DEFAULT_CONTROL_POLL_INTERVAL = Duration.ofSeconds(2);

  static final Duration DEFAULT_REPORT_TIMEOUT = Duration.ofSeconds(10);
  static final Duration DEFAULT_STOP_GRACE = Duration.ofSeconds(5);
  static final Duration DEFAULT_EVIDENCE_WINDOW = Duration.ofSeconds(15);
  static final Duration DEFAULT_DELIVERY_WINDOW = Duration.ofSeconds(30);
  static final Duration DEFAULT_SLACK = Duration.ofSeconds(10);

  /** Refuses, at bind time, an explicit margin the runner's own bounds can outlast. */
  public RunnerCancelBudget {
    requirePositive("control-poll-interval", controlPollInterval);
    requirePositive("report-timeout", reportTimeout);
    requirePositive("stop-grace", stopGrace);
    requirePositive("evidence-window", evidenceWindow);
    requirePositive("delivery-window", deliveryWindow);
    if (slack != null && slack.isNegative()) {
      throw new IllegalArgumentException("studio.execution.cancel.slack must not be negative");
    }
    if (margin != null) {
      Duration worstCase =
          worstCase(
              orDefault(controlPollInterval, DEFAULT_CONTROL_POLL_INTERVAL),
              orDefault(reportTimeout, DEFAULT_REPORT_TIMEOUT),
              orDefault(stopGrace, DEFAULT_STOP_GRACE),
              orDefault(evidenceWindow, DEFAULT_EVIDENCE_WINDOW),
              orDefault(deliveryWindow, DEFAULT_DELIVERY_WINDOW));
      if (margin.compareTo(worstCase) < 0) {
        throw new IllegalArgumentException(
            "studio.execution.cancel.margin ("
                + margin
                + ") is shorter than a healthy runner's worst-case cancel path ("
                + worstCase
                + " = control-poll-interval "
                + orDefault(controlPollInterval, DEFAULT_CONTROL_POLL_INTERVAL)
                + " + 2 x report-timeout "
                + orDefault(reportTimeout, DEFAULT_REPORT_TIMEOUT)
                + " + stop-grace "
                + orDefault(stopGrace, DEFAULT_STOP_GRACE)
                + " + report-timeout "
                + orDefault(reportTimeout, DEFAULT_REPORT_TIMEOUT)
                + " + evidence-window "
                + orDefault(evidenceWindow, DEFAULT_EVIDENCE_WINDOW)
                + " + delivery-window "
                + orDefault(deliveryWindow, DEFAULT_DELIVERY_WINDOW)
                + "). The running reaper would close cancelled rows under a live runner and"
                + " refuse its FINAL. Raise the margin, or unset it to derive one.");
      }
    }
  }

  /** The defaults throughout: what an unconfigured deployment gets. */
  public static RunnerCancelBudget defaults() {
    return new RunnerCancelBudget(null, null, null, null, null, null, null);
  }

  /** The longest a healthy runner can take from a recorded cancel to an accepted {@code FINAL}. */
  public Duration worstCase() {
    return worstCase(
        controlPollIntervalOrDefault(),
        reportTimeoutOrDefault(),
        stopGraceOrDefault(),
        evidenceWindowOrDefault(),
        deliveryWindowOrDefault());
  }

  /**
   * How long after a cancel was requested the running reaper may close it: the explicit margin,
   * which binding has already proven covers {@link #worstCase()}, or the worst case plus slack.
   */
  public Duration effectiveMargin() {
    return margin != null ? margin : worstCase().plus(slackOrDefault());
  }

  public Duration controlPollIntervalOrDefault() {
    return orDefault(controlPollInterval, DEFAULT_CONTROL_POLL_INTERVAL);
  }

  public Duration reportTimeoutOrDefault() {
    return orDefault(reportTimeout, DEFAULT_REPORT_TIMEOUT);
  }

  public Duration stopGraceOrDefault() {
    return orDefault(stopGrace, DEFAULT_STOP_GRACE);
  }

  public Duration evidenceWindowOrDefault() {
    return orDefault(evidenceWindow, DEFAULT_EVIDENCE_WINDOW);
  }

  public Duration deliveryWindowOrDefault() {
    return orDefault(deliveryWindow, DEFAULT_DELIVERY_WINDOW);
  }

  public Duration slackOrDefault() {
    return orDefault(slack, DEFAULT_SLACK);
  }

  private static Duration worstCase(
      Duration controlPollInterval,
      Duration reportTimeout,
      Duration stopGrace,
      Duration evidenceWindow,
      Duration deliveryWindow) {
    Duration observe = controlPollInterval.plus(reportTimeout.multipliedBy(2));
    return observe.plus(stopGrace).plus(reportTimeout).plus(evidenceWindow).plus(deliveryWindow);
  }

  private static Duration orDefault(Duration value, Duration fallback) {
    return value == null ? fallback : value;
  }

  private static void requirePositive(String key, Duration value) {
    if (value != null && (value.isNegative() || value.isZero())) {
      throw new IllegalArgumentException(
          "studio.execution.cancel." + key + " must be positive, was " + value);
    }
  }
}
