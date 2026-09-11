package com.citi.put.checks.studio.compile;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Bounded compile work (Story 10.8, AC-17, AC-18; architecture &sect;4.3 "bounded compile
 * concurrency", &sect;5.4 "Bound dispatcher threads/connections, compile work, ...").
 *
 * <h2>No unbounded queue</h2>
 *
 * <p>The pool is a fixed number of threads over a {@link SynchronousQueue} with an abort policy, so
 * a submission either starts immediately on a free thread or is refused. It is deliberately not a
 * {@code LinkedBlockingQueue}: an unbounded queue converts saturation into unbounded latency and
 * unbounded memory, and does it silently — the symptom is a draft that says {@code COMPILING} for
 * an hour rather than one that says {@code STALE} and offers a retry. The refusal is the feature.
 *
 * <p>The threads are separate from request-serving threads, so a saturated compile pool leaves
 * {@code POST /tests} and {@code GET /tests} untouched, and {@link #submit} never blocks its
 * caller.
 *
 * <h2>Per-attempt budget and the late result</h2>
 *
 * <p>Each attempt carries a total wall-clock budget covering prompt assembly, the gateway call,
 * parsing, {@code /v1/validate} and persistence — distinct from, and strictly larger than, the
 * gateway's own request timeout. On expiry the attempt is abandoned and its expiry handler runs.
 *
 * <p>The abandoned work may still finish afterwards: a blocked stub releases, a socket read
 * returns. {@link Settlement} makes that harmless. It is a single compare-and-set that exactly one
 * of the two racers wins — the deadline timer or the worker thread — and only the winner is allowed
 * to publish. A late result is therefore dropped <em>in process</em>, without calling any publish
 * method at all.
 *
 * <p>This is belt-and-braces on top of 10.4's conditional publish, and the braces are load-bearing:
 * the conditional publish discards a result whose draft <em>moved on</em>, but an abandoned attempt
 * on a draft where nothing moved would still match its own guard and publish.
 */
@Component
public class CompileExecutor {

  private static final Logger LOGGER = LoggerFactory.getLogger(CompileExecutor.class);

  private final ThreadPoolExecutor pool;
  private final ScheduledExecutorService deadlines;
  private final Duration attemptBudget;

  @Autowired
  public CompileExecutor(StudioCompileProperties properties) {
    this(properties.pipeline().concurrency(), properties.pipeline().attemptBudget());
  }

  /** Visible for tests that need a smaller pool or a shorter budget than a deployment has. */
  CompileExecutor(int concurrency, Duration attemptBudget) {
    this.attemptBudget = attemptBudget;
    this.pool =
        new ThreadPoolExecutor(
            concurrency,
            concurrency,
            0L,
            TimeUnit.MILLISECONDS,
            new SynchronousQueue<>(),
            named("studio-compile-"),
            new ThreadPoolExecutor.AbortPolicy());
    this.deadlines = Executors.newSingleThreadScheduledExecutor(named("studio-compile-deadline-"));
  }

  /**
   * Claim on the right to settle one compile attempt.
   *
   * <p>{@link #claim()} returns {@code true} to exactly one caller for the life of an attempt.
   * Everything that would change persistent state must be behind it.
   */
  public interface Settlement {

    /**
     * Claims the right to publish this attempt's outcome.
     *
     * @return true for the first caller only
     */
    boolean claim();

    /**
     * Whether this attempt has already been settled — by the budget, or by an earlier stage.
     *
     * @return true once claimed
     */
    boolean isSettled();
  }

  /** One attempt's body. Receives the settlement so every publish can be guarded by it. */
  @FunctionalInterface
  public interface AttemptBody {

    /**
     * Runs the attempt.
     *
     * @param settlement the claim guarding this attempt's publications
     */
    void run(Settlement settlement);
  }

  /**
   * Submits one compile attempt, or refuses it.
   *
   * <p>Never blocks the caller and never queues. A refusal is reported by the return value rather
   * than an exception: refusal at saturation is an expected outcome of a bounded pipeline, and the
   * caller turns it into a retryable {@code STALE} with a code.
   *
   * @param body the attempt
   * @param onBudgetExpired run, once, if the budget elapses before the body settles
   * @return true when the attempt started, false when the pool was saturated
   */
  public boolean submit(AttemptBody body, Runnable onBudgetExpired) {
    Claim claim = new Claim();
    try {
      pool.execute(
          () -> {
            try {
              body.run(claim);
            } catch (RuntimeException e) {
              LOGGER.warn("studio.compile.attempt_failed", e);
            }
          });
    } catch (RejectedExecutionException rejected) {
      return false;
    }
    deadlines.schedule(
        () -> {
          if (claim.claim()) {
            LOGGER.warn("studio.compile.budget_expired budgetMs={}", attemptBudget.toMillis());
            onBudgetExpired.run();
          }
        },
        attemptBudget.toMillis(),
        TimeUnit.MILLISECONDS);
    return true;
  }

  /**
   * Attempts currently occupying a pool thread.
   *
   * @return the active count, for saturation assertions
   */
  public int activeCount() {
    return pool.getActiveCount();
  }

  /**
   * The configured pool size.
   *
   * @return the fixed concurrency
   */
  public int concurrency() {
    return pool.getMaximumPoolSize();
  }

  /** Stops both pools on shutdown; in-flight attempts are interrupted rather than awaited. */
  @PreDestroy
  public void shutdown() {
    pool.shutdownNow();
    deadlines.shutdownNow();
  }

  private static ThreadFactory named(String prefix) {
    AtomicInteger counter = new AtomicInteger();
    return runnable -> {
      Thread thread = new Thread(runnable, prefix + counter.incrementAndGet());
      thread.setDaemon(true);
      return thread;
    };
  }

  private static final class Claim implements Settlement {

    private final AtomicBoolean settled = new AtomicBoolean(false);

    @Override
    public boolean claim() {
      return settled.compareAndSet(false, true);
    }

    @Override
    public boolean isSettled() {
      return settled.get();
    }
  }
}
