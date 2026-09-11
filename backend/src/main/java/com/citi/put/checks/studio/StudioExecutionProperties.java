package com.citi.put.checks.studio;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

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
 * bounds how long an admitted run may take to report a browser start, and {@link #runDeadline()}
 * bounds the browser runtime plus finalization and delivery margins. Sharing one timestamp across
 * those three is the implementation AC-19 exists to fail.
 *
 * @param enabled the kill switch (§8.5). When false, new executions are refused {@code 503
 *     DISPATCH_DISABLED}, queued undispatched work is closed explicitly, and admitted work,
 *     callbacks, reads and recovery all stay active
 * @param pendingSla how long an accepted execution may remain undispatched before it is closed
 * @param startDeadline how long an admitted execution may take to report a browser start
 * @param runDeadline browser runtime cap plus bounded finalization and delivery margins
 * @param admissionTimeout the dispatcher's HTTP timeout on {@code POST /v1/runs}
 */
@ConfigurationProperties(prefix = "studio.execution")
public record StudioExecutionProperties(
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
    return runDeadline == null ? Duration.ofSeconds(600) : runDeadline;
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
