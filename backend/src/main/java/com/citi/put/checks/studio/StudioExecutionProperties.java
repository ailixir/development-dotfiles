package com.citi.put.checks.studio;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

/**
 * The one configuration source for Studio execution (Architecture §8.5).
 *
 * <p>Every bound this story installs is named here — the kill switch, the pending quotas, the three
 * deadlines, the callback bounds and the dispatcher budget — so that AC-38's inventory has a single
 * place to read and no bound can exist without a name.
 *
 * <p>The values are §8.5's <em>starting</em> values, tuned against staging measurements (§10), not
 * commitments. Queue time and browser runtime are separate budgets on purpose: {@link
 * #pendingSla()} bounds how long an execution may wait for a browser, {@link #startDeadline()}
 * bounds how long an admitted run may take to report a browser start, {@link #totalRuntime()} is
 * the browser runtime the job carries to the runner, and {@link #runDeadline()} bounds that runtime
 * plus finalization and delivery margins. Sharing one timestamp across those is the implementation
 * AC-19 exists to fail.
 *
 * <p>{@link #totalRuntime()} and a revision's {@code configuration.timeoutSeconds} are two
 * different budgets (architecture §5.2: "Default step timeout is 30 seconds and total browser
 * runtime 120 seconds"). The per-step value travels on the job's configuration and the runner
 * clamps it per step; the whole-run value travels on {@code deadlines.totalRuntimeMs} and comes
 * from here. Deriving one from the other made every run die at the per-step value, which is the
 * defect this property exists to close.
 *
 * @param enabled the kill switch (§8.5). When false, new executions are refused {@code 503
 *     DISPATCH_DISABLED}, queued undispatched work is closed explicitly, and admitted work,
 *     callbacks, reads and recovery all stay active
 * @param pendingSla how long an accepted execution may remain undispatched before it is closed
 * @param startDeadline how long an admitted execution may take to report a browser start
 * @param runDeadline browser runtime cap plus bounded finalization and delivery margins
 * @param totalRuntime the total browser runtime budget sent on every job (§5.2, §8.5); strictly
 *     inside {@code runDeadline} so finalization and delivery keep their margin
 * @param admissionTimeout the dispatcher's HTTP timeout on {@code POST /v2/runs}
 */
@ConfigurationProperties(prefix = "studio.execution")
public record StudioExecutionProperties(
    Boolean enabled,
    Duration pendingSla,
    Duration startDeadline,
    Duration runDeadline,
    Duration totalRuntime,
    Duration admissionTimeout,
    Duration evidenceRetention,
    String referenceCanary,
    Quotas quotas,
    Dispatcher dispatcher,
    Callback callback,
    Sse sse) {

  /** §5.2's total browser runtime, the starting value the runner's own maximum mirrors. */
  static final Duration DEFAULT_TOTAL_RUNTIME = Duration.ofSeconds(120);

  /** §8.5's run deadline: browser runtime plus finalization and delivery margins. */
  static final Duration DEFAULT_RUN_DEADLINE = Duration.ofSeconds(600);

  /**
   * Refuses, at bind time, a total runtime the run deadline cannot contain.
   *
   * <p>{@code run-deadline} is what the running reaper closes a run at; a browser budget at or past
   * it would have the reaper close rows under a live, in-budget runner and refuse its {@code
   * FINAL}. The check uses the effective values, so an unconfigured deployment (120 s inside 600 s)
   * binds, and only an explicit misconfiguration is refused.
   */
  @ConstructorBinding
  public StudioExecutionProperties {
    Duration effectiveTotalRuntime = totalRuntime == null ? DEFAULT_TOTAL_RUNTIME : totalRuntime;
    Duration effectiveRunDeadline = runDeadline == null ? DEFAULT_RUN_DEADLINE : runDeadline;
    if (effectiveTotalRuntime.isZero() || effectiveTotalRuntime.isNegative()) {
      throw new IllegalArgumentException(
          "studio.execution.total-runtime ("
              + effectiveTotalRuntime
              + ") must be greater than zero: it is the browser runtime every job is sent");
    }
    if (effectiveTotalRuntime.compareTo(effectiveRunDeadline) >= 0) {
      throw new IllegalArgumentException(
          "studio.execution.total-runtime ("
              + effectiveTotalRuntime
              + ") must be strictly shorter than studio.execution.run-deadline ("
              + effectiveRunDeadline
              + "): the run deadline is the browser runtime plus finalization and delivery"
              + " margins, and a budget that reaches it leaves the running reaper closing rows"
              + " under a live, in-budget runner.");
    }
  }

  /**
   * The eleven-argument form from before {@code total-runtime} existed, kept so callers that
   * construct the record by position keep compiling; the budget takes its default.
   */
  public StudioExecutionProperties(
      Boolean enabled,
      Duration pendingSla,
      Duration startDeadline,
      Duration runDeadline,
      Duration admissionTimeout,
      Duration evidenceRetention,
      String referenceCanary,
      Quotas quotas,
      Dispatcher dispatcher,
      Callback callback,
      Sse sse) {
    this(
        enabled,
        pendingSla,
        startDeadline,
        runDeadline,
        null,
        admissionTimeout,
        evidenceRetention,
        referenceCanary,
        quotas,
        dispatcher,
        callback,
        sse);
  }

  /**
   * Pending-row bounds (§5.1.1, §5.4). The per-CSI bound and the global bound are independent: a
   * full CSI must not block a different CSI, and one accepted row consumes one unit of each.
   */
  public record Quotas(Integer perCsi, Integer global, Integer maxStepsPerTest) {

    public int perCsiOrDefault() {
      return perCsi == null ? 20 : perCsi;
    }

    public int globalOrDefault() {
      return global == null ? 200 : global;
    }

    public int maxStepsPerTestOrDefault() {
      return maxStepsPerTest == null ? 200 : maxStepsPerTest;
    }
  }

  /** Dispatcher budget on the worker profile (§5.4). */
  public record Dispatcher(
      Boolean enabled, Integer threads, Integer batchSize, Duration lease, Duration pollInterval) {

    public boolean enabledOrDefault() {
      return enabled == null || enabled;
    }

    public int threadsOrDefault() {
      return threads == null ? 4 : threads;
    }

    public int batchSizeOrDefault() {
      return batchSize == null ? 20 : batchSize;
    }

    public Duration leaseOrDefault() {
      return lease == null ? Duration.ofSeconds(60) : lease;
    }

    public Duration pollIntervalOrDefault() {
      return pollInterval == null ? Duration.ofSeconds(2) : pollInterval;
    }
  }

  /**
   * Callback bounds (§5.4). A body over {@link #maxBodyBytes()} is {@code 413} and changes nothing:
   * the report is rejected on its head, before anything is applied.
   */
  public record Callback(
      Integer maxBodyBytes,
      Integer maxSteps,
      Integer maxLogEntries,
      Integer maxLogEntryChars,
      String serviceToken) {

    public int maxBodyBytesOrDefault() {
      return maxBodyBytes == null ? 262_144 : maxBodyBytes;
    }

    public int maxStepsOrDefault() {
      return maxSteps == null ? 500 : maxSteps;
    }

    public int maxLogEntriesOrDefault() {
      return maxLogEntries == null ? 500 : maxLogEntries;
    }

    public int maxLogEntryCharsOrDefault() {
      return maxLogEntryChars == null ? 2000 : maxLogEntryChars;
    }
  }

  /** SSE bounds (§5.5). */
  public record Sse(
      Duration heartbeat,
      Duration lifetime,
      Duration readInterval,
      Duration authorizationRefresh,
      Integer maxStreamsPerUser,
      Integer maxStreamsPerPod,
      Integer maxWatchedExecutions,
      Integer senderThreads) {

    public Duration heartbeatOrDefault() {
      return heartbeat == null ? Duration.ofSeconds(15) : heartbeat;
    }

    public Duration lifetimeOrDefault() {
      return lifetime == null ? Duration.ofSeconds(60) : lifetime;
    }

    public Duration readIntervalOrDefault() {
      return readInterval == null ? Duration.ofMillis(750) : readInterval;
    }

    public Duration authorizationRefreshOrDefault() {
      return authorizationRefresh == null ? Duration.ofSeconds(30) : authorizationRefresh;
    }

    public int maxStreamsPerUserOrDefault() {
      return maxStreamsPerUser == null ? 5 : maxStreamsPerUser;
    }

    public int maxStreamsPerPodOrDefault() {
      return maxStreamsPerPod == null ? 200 : maxStreamsPerPod;
    }

    public int maxWatchedExecutionsOrDefault() {
      return maxWatchedExecutions == null ? 200 : maxWatchedExecutions;
    }

    public int senderThreadsOrDefault() {
      return senderThreads == null ? 4 : senderThreads;
    }
  }

  public boolean enabledOrDefault() {
    return enabled == null || enabled;
  }

  public Duration pendingSlaOrDefault() {
    return pendingSla == null ? Duration.ofSeconds(600) : pendingSla;
  }

  public Duration startDeadlineOrDefault() {
    return startDeadline == null ? Duration.ofSeconds(30) : startDeadline;
  }

  public Duration runDeadlineOrDefault() {
    return runDeadline == null ? DEFAULT_RUN_DEADLINE : runDeadline;
  }

  /**
   * The total browser runtime every job carries as {@code deadlines.totalRuntimeMs} (§5.2, §8.5).
   *
   * <p>Server configuration, never a per-test value: the runner clamps what it receives to its own
   * {@code STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS}, so this is the value a deployment asks for and the
   * runner's maximum is the value it is allowed. Validated against {@link #runDeadlineOrDefault()}
   * at bind time.
   */
  public Duration totalRuntimeOrDefault() {
    return totalRuntime == null ? DEFAULT_TOTAL_RUNTIME : totalRuntime;
  }

  public Duration admissionTimeoutOrDefault() {
    return admissionTimeout == null ? Duration.ofSeconds(10) : admissionTimeout;
  }

  /**
   * Evidence retention (§6.2). {@code AVAILABLE} and {@code EXPIRED} are the API's judgment against
   * this window and are never reported by a runner, which holds no Get and no List permission.
   */
  public Duration evidenceRetentionOrDefault() {
    return evidenceRetention == null ? Duration.ofDays(30) : evidenceRetention;
  }

  public Quotas quotasOrDefault() {
    return quotas == null ? new Quotas(null, null, null) : quotas;
  }

  public Dispatcher dispatcherOrDefault() {
    return dispatcher == null ? new Dispatcher(null, null, null, null, null) : dispatcher;
  }

  public Callback callbackOrDefault() {
    return callback == null ? new Callback(null, null, null, null, null) : callback;
  }

  public Sse sseOrDefault() {
    return sse == null ? new Sse(null, null, null, null, null, null, null, null) : sse;
  }
}
