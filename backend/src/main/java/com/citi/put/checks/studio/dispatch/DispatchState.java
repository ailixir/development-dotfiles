package com.citi.put.checks.studio.dispatch;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The dispatch ledger's state machine (AC-2, AC-3).
 *
 * <p>The vocabulary is <em>inherited</em> from {@code V13}, not chosen here: {@code V13} already
 * ships three partial indexes written against {@code state IN ('QUEUED','CLAIMED','DISPATCHING')}
 * and {@code state &lt;&gt; 'DONE'}, so it already assumes exactly these seven values and a single
 * absorbing terminal state. Widening or renaming the set would strand the indexes the reapers query
 * through.
 *
 * <p>This is a <em>dispatch</em> state and never an outcome. {@code DONE} covers success, error,
 * disablement and reaped work alike; the outcome and its {@code error_code} live on the execution
 * history row (§8.2) and are not duplicated here.
 *
 * <p>The matrix below is the Java-side mirror of the {@code VALUES} list embedded in {@link
 * StudioDispatchLedgerStatements#TRANSITION_MATRIX}. The SQL copy is the enforcing one — the guard
 * is intrinsic to the statement — and a test asserts the two agree, so this enum can be read
 * without being trusted.
 */
public enum DispatchState {
  QUEUED,
  CLAIMED,
  DISPATCHING,
  ADMITTED,
  RUNNING,
  FINALIZING,
  DONE;

  /** The seven values {@code V13} enumerated, in the order it enumerated them. */
  public static final List<DispatchState> ALL =
      List.of(QUEUED, CLAIMED, DISPATCHING, ADMITTED, RUNNING, FINALIZING, DONE);

  private static final Set<Transition> PERMITTED = buildPermitted();

  /** One ordered pair of the transition matrix. */
  public record Transition(DispatchState from, DispatchState to) {

    @Override
    public String toString() {
      return from + "->" + to;
    }
  }

  private static Set<Transition> buildPermitted() {
    Set<Transition> permitted = new LinkedHashSet<>();
    permitted.add(new Transition(QUEUED, CLAIMED));
    permitted.add(new Transition(CLAIMED, DISPATCHING));
    permitted.add(new Transition(DISPATCHING, ADMITTED));
    permitted.add(new Transition(ADMITTED, RUNNING));
    permitted.add(new Transition(RUNNING, FINALIZING));
    permitted.add(new Transition(FINALIZING, DONE));
    // Lease expiry with no attempt issued.
    permitted.add(new Transition(CLAIMED, QUEUED));
    // A definite runner 429 only; the next send must carry a fresh attempt_id.
    permitted.add(new Transition(DISPATCHING, QUEUED));
    // The reapers and the kill switch close any non-terminal row.
    for (DispatchState from : ALL) {
      if (from != DONE) {
        permitted.add(new Transition(from, DONE));
      }
    }
    return Set.copyOf(permitted);
  }

  /** Every permitted ordered pair. Nothing leaves {@link #DONE}. */
  public static Set<Transition> permittedTransitions() {
    return PERMITTED;
  }

  public static boolean isPermitted(DispatchState from, DispatchState to) {
    return PERMITTED.contains(new Transition(from, to));
  }

  /** Terminal is absorbing: no permitted pair starts at {@code DONE}. */
  public boolean isTerminal() {
    return this == DONE;
  }

  public static DispatchState of(String value) {
    return valueOf(value.toUpperCase(Locale.ROOT));
  }
}
