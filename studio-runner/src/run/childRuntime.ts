/**
 * The run, inside the child process (AC-3, AC-5, AC-6a, AC-7, AC-8, AC-10, AC-15).
 *
 * ## Why the run is here and not in the parent
 *
 * ADR-002 §11.6 puts the run clock's zero at recording-context readiness, observed **once**, with
 * `browserStartedAt` read adjacently to it (AC-11.2). Readiness is something only the process
 * holding the browser can observe, so the clock is created here and `executeSteps` is driven here
 * with it injected. A parent that took the origin when a "ready" message arrived would have
 * folded the inter-process latency into the zero, which is precisely the kind of term §6.4's
 * 500 ms budget cannot absorb — and the parent would then be the second place a timeline origin
 * is decided, which ADR-002 §11.5 rejects.
 *
 * The parent therefore receives readings it never re-bases: `browserStartedAt` and `startedAtMs`
 * arrive together in the `ready` message and pass through to the wire unchanged.
 *
 * ## Two phases, because `BrowserLauncher` has two things to mean
 *
 * `launch` → the browser starts, the recording context and page are created, the origin is taken,
 * `ready` goes back. Only then does `BrowserLauncher.launch` resolve in the parent, which is what
 * makes `browserStartedAt` mean "Chromium has actually started" rather than "a launch call began"
 * (AC-20). `execute` → the validated operation list arrives and the steps run.
 *
 * ## What crosses the boundary
 *
 * Data. The validator's typed operation list and the resolved values those operations reference,
 * validated on arrival by `parseExecuteMessage`, which is default-deny on keys and names the
 * source-shaped ones explicitly. No artifact text, no `code` string, nothing a loader could be
 * pointed at (AC-3).
 *
 * ## Exit
 *
 * The child exits on **every** path — success, step failure, launch failure, error — and the
 * browser and context are closed before it does (AC-5). `close` is the ordered path, and it is
 * awaited, because awaiting the context close is what flushes the webm (§6.1); `dispose` is the
 * last resort when the ordered path itself fails.
 */

import { readFile, stat } from 'node:fs/promises';

import type { ValueResolver } from '../executor/adapters/BrowserAdapter.js';
import type {
  Clock,
  StepFinishedEvent,
  StepReporter,
  StepStartedEvent,
} from '../executor/adapters/StepReporter.js';
import { executeSteps } from '../executor/index.js';
import type { ExecutableStep } from '../executor/index.js';
import type { BrowserFactory, BrowserHandle } from './browserFactory.js';
import type { RunFailureKind } from './errors.js';
import { createPlaywrightAdapter } from './playwrightAdapter.js';
import type { ChildMessage, ExecuteMessage, LaunchMessage, RecordingReport } from './protocol.js';
import { parseExecuteMessage, parseLaunchMessage } from './protocol.js';
import type { RecordingObservation } from './recording.js';
import { evidenceFor, hasWebmHeader } from './recording.js';
import { isSandboxFailure } from './sandbox.js';
import type { OriginSource } from './timeline.js';
import { takeRunOrigin } from './timeline.js';

/** The transport, injected so the whole child runtime runs in-process in the unit tier. */
export interface ChildChannel {
  onMessage(listener: (value: unknown) => void): void;
  send(message: ChildMessage): void;
  /** Called once the run has reported its result. Every path reaches it (AC-5). */
  exit(code: number): void;
}

export interface ChildRuntimeDependencies {
  readonly channel: ChildChannel;
  readonly browsers: BrowserFactory;
  /** The two adjacent reads of the run origin. Injected only so a test can drive them. */
  readonly originSource?: OriginSource | undefined;
  /** Reads the produced recording. Injected so the evidence branches are testable. */
  readonly inspectRecording?: ((path: string | null) => Promise<RecordingObservation>) | undefined;
}

/** No recording was ever attempted, so there is nothing to have failed (AC-9). */
const NO_RECORDING: RecordingReport = { path: null, bytes: null, error: null, state: 'UNAVAILABLE' };

const UNSUPPORTED_MULTI_PAGE_MESSAGE =
  'UnsupportedWorkflow: the page opened a second page or popup. V1 records and drives exactly ' +
  'one page; the extra page was closed, execution did not continue on it, and no second ' +
  'recording was created or merged (architecture §5.2).';

/** Reads the produced file: its size and whether it begins with a readable webm header. */
async function inspectRecordingFile(path: string | null): Promise<RecordingObservation> {
  if (path === null) {
    return { attempted: true, path: null, bytes: null, header: false, error: null };
  }
  try {
    const stats = await stat(path);
    const head = await readFile(path);
    return {
      attempted: true,
      path,
      bytes: stats.size,
      header: hasWebmHeader(head.subarray(0, 4)),
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      path,
      bytes: null,
      header: false,
      error: error instanceof Error ? error.name : 'unknown',
    };
  }
}

/**
 * A resolver over the message's two value maps.
 *
 * `knownValues` returns variables **and** secrets: it is what `executeSteps` builds its redactor
 * from, and a variable that happens to carry a canary must be redacted for the same reason a
 * secret is (AC-21).
 */
function createChildResolver(message: ExecuteMessage): ValueResolver {
  const variables = new Map(Object.entries(message.variables));
  const secrets = new Map(Object.entries(message.secrets));
  return {
    variable(name: string): string {
      const value = variables.get(name);
      if (value === undefined) throw new Error(`Variable "${name}" was not resolved for this run.`);
      return value;
    },
    secret(id: string): string {
      const value = secrets.get(id);
      if (value === undefined) throw new Error(`Secret "${id}" was not resolved for this run.`);
      return value;
    },
    knownValues(): readonly string[] {
      return [...variables.values(), ...secrets.values()];
    },
  };
}

/** Forwards the executor's per-step events across the process boundary, unchanged (AC-16). */
function createForwardingReporter(channel: ChildChannel): StepReporter {
  return {
    stepStarted(event: StepStartedEvent): void {
      channel.send({
        kind: 'step-started',
        stepIndex: event.stepIndex,
        startedAtMs: event.startedAtMs,
      });
    },
    stepFinished(event: StepFinishedEvent): void {
      channel.send({
        kind: 'step-finished',
        stepIndex: event.stepIndex,
        status: event.status,
        startedAtMs: event.startedAtMs,
        finishedAtMs: event.finishedAtMs,
        durationMs: event.durationMs,
        failure: event.failure,
      });
    },
  };
}

/** Keeps a message to one line so a stack trace cannot become a report body. */
export function firstLine(message: string): string {
  return (message.split('\n')[0] ?? message).slice(0, 400);
}

/**
 * Which failure, if any, the run had — **evidence deliberately absent from this decision** (AC-8).
 *
 * The easiest wrong implementation of this story is a `try` around the whole run that turns a
 * recording failure into `ERROR`. It cannot happen here, because the recording is not an input:
 * a passing run with a broken video is `PASSED` with failed evidence, and a failing step with a
 * perfect video is `FAILED` with healthy evidence. §6.1: *"Upload failure never overwrites a known
 * assertion outcome."*
 */
export function failureKindOf(input: {
  readonly unsupportedPage: boolean;
  readonly runFault: string | null;
  readonly ok: boolean;
}): RunFailureKind | null {
  if (input.unsupportedPage) return 'unsupported-multi-page';
  if (input.runFault !== null) return 'run-fault';
  if (!input.ok) return 'step';
  return null;
}

/**
 * The child's own state machine.
 *
 * Held as one object rather than closure variables so the launch phase and the execute phase can
 * be driven independently by a test, and so every exit path has one place to tear down.
 */
interface ChildState {
  handle: BrowserHandle | null;
  unsupportedPage: boolean;
  /** The run clock, created at recording-context readiness and used for every reading. */
  clock?: Clock | undefined;
}

/** Phase one: start the browser, take the origin, answer `ready`. */
export async function launchInChild(
  message: LaunchMessage,
  dependencies: ChildRuntimeDependencies,
  state: ChildState,
): Promise<boolean> {
  const { channel, browsers } = dependencies;
  let handle: BrowserHandle;
  try {
    handle = await browsers.launch({
      browser: message.browser,
      viewport: message.viewport,
      recording: message.recording,
      scratchPath: message.scratchPath,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : 'unknown';
    // No relaunch, and never with different arguments: §9.3 forbids disabling the sandbox to make
    // something run, so the only honest answer is to report which failure this was (AC-6a).
    channel.send({
      kind: 'result',
      ok: false,
      executorVersion: '',
      failureKind: isSandboxFailure(text)
        ? ('sandbox-unavailable' satisfies RunFailureKind)
        : ('browser-launch' satisfies RunFailureKind),
      failureMessage: firstLine(text),
      recording: NO_RECORDING,
      observedHosts: [],
    });
    return false;
  }

  state.handle = handle;
  handle.onExtraPage(() => {
    state.unsupportedPage = true;
  });

  // ── The origin. One instant, observed twice, at recording-context readiness (AC-10, AC-11). ──
  const origin = takeRunOrigin(dependencies.originSource);
  state.clock = origin.clock;
  channel.send({
    kind: 'ready',
    browserStartedAt: origin.browserStartedAt.toISOString(),
    // A reading of the run clock, computed from the sample that defined the zero — not a literal.
    startedAtMs: origin.startedAtMs,
  });
  return true;
}

/** Phase two: run the validated operation list and report what happened. */
export async function executeInChild(
  message: ExecuteMessage,
  dependencies: ChildRuntimeDependencies,
  state: ChildState,
): Promise<void> {
  const { channel } = dependencies;
  const inspect = dependencies.inspectRecording ?? inspectRecordingFile;
  const handle = state.handle;
  const clock = state.clock;
  if (handle === null || clock === undefined) {
    channel.send({
      kind: 'result',
      ok: false,
      executorVersion: '',
      failureKind: 'run-fault' satisfies RunFailureKind,
      failureMessage: 'The child was asked to execute before the browser was started.',
      recording: NO_RECORDING,
      observedHosts: [],
    });
    return;
  }

  const resolver = createChildResolver(message);
  const adapter = createPlaywrightAdapter({
    page: handle.page,
    defaultTimeoutMs: message.stepTimeoutMs,
    resolveVariable: (name) => resolver.variable(name),
    guard: () => (state.unsupportedPage ? UNSUPPORTED_MULTI_PAGE_MESSAGE : null),
  });

  const steps: ExecutableStep[] = message.steps.map((step) => ({
    stepIndex: step.stepIndex,
    operations: step.operations,
  }));

  let ok = false;
  let executorVersion = '';
  let runFault: string | null = null;
  try {
    const result = await executeSteps({
      steps,
      adapter,
      reporter: createForwardingReporter(channel),
      resolver,
      // AC-11.1: explicitly supplied. There is no process-origin default to fall back to.
      clock,
      maxFailureMessageLength: message.maxFailureMessageLength,
    });
    ok = result.ok;
    executorVersion = result.executorVersion;
  } catch (error) {
    runFault = firstLine(error instanceof Error ? error.message : 'unknown');
  }

  const observedHosts = handle.observedHosts();

  // Closing the context is what flushes the file; the evidence state is read from what it left.
  let producedPath: string | null = null;
  let closeError: string | null = null;
  try {
    producedPath = await handle.close();
  } catch (error) {
    closeError = firstLine(error instanceof Error ? error.message : 'unknown');
    await handle.dispose().catch(() => undefined);
  }
  state.handle = null;

  const observation: RecordingObservation =
    closeError === null
      ? await inspect(producedPath)
      : { attempted: true, path: producedPath, bytes: null, header: false, error: closeError };
  const evidence = evidenceFor(observation);

  channel.send({
    kind: 'result',
    ok,
    executorVersion,
    failureKind: failureKindOf({ unsupportedPage: state.unsupportedPage, runFault, ok }),
    failureMessage: state.unsupportedPage ? UNSUPPORTED_MULTI_PAGE_MESSAGE : runFault,
    recording: {
      path: evidence.path,
      bytes: evidence.bytes,
      error: evidence.error,
      state: evidence.state,
    },
    observedHosts,
  });
}

/**
 * Wires a channel to the two phases and guarantees the process leaves on every path.
 *
 * Each message is parsed before anything acts on it. A refusal at the launch message is a refusal
 * *before a browser exists*, which mirrors the ordering AC-2 enforces on the parent side — this
 * one guards the case where the parent's own protocol drifts.
 */
export function attachChildRuntime(dependencies: ChildRuntimeDependencies): void {
  const { channel } = dependencies;
  const state: ChildState = { handle: null, unsupportedPage: false };
  let phase: 'idle' | 'launched' | 'done' = 'idle';
  let queue: Promise<void> = Promise.resolve();

  const refuse = (failureMessage: string): void => {
    channel.send({
      kind: 'result',
      ok: false,
      executorVersion: '',
      failureKind: 'run-fault' satisfies RunFailureKind,
      failureMessage,
      recording: NO_RECORDING,
      observedHosts: [],
    });
  };

  const teardown = async (): Promise<void> => {
    const handle = state.handle;
    state.handle = null;
    if (handle !== null) await handle.dispose().catch(() => undefined);
  };

  const handleLaunch = async (value: unknown): Promise<void> => {
    const parsed = parseLaunchMessage(value);
    if (!parsed.ok) {
      refuse(describeProblems(parsed.problems));
      phase = 'done';
      channel.exit(0);
      return;
    }
    const started = await launchInChild(parsed.message, dependencies, state);
    if (!started) {
      phase = 'done';
      channel.exit(0);
      return;
    }
    phase = 'launched';
  };

  const handleExecute = async (value: unknown): Promise<void> => {
    const parsed = parseExecuteMessage(value);
    if (!parsed.ok) {
      refuse(describeProblems(parsed.problems));
      await teardown();
      phase = 'done';
      channel.exit(0);
      return;
    }
    try {
      await executeInChild(parsed.message, dependencies, state);
    } catch (error) {
      refuse(firstLine(error instanceof Error ? error.message : 'unknown'));
    }
    await teardown();
    phase = 'done';
    channel.exit(0);
  };

  /**
   * Messages are **queued, then dispatched** — never dispatched on the phase the parent happened
   * to be in when the message arrived.
   *
   * The parent sends `execute` as soon as `launch` resolves, and `launch` resolves the moment the
   * child answers `ready` — which happens *inside* the launch phase, before it finishes. Deciding
   * order at arrival time would therefore race a correct parent into an out-of-order refusal.
   * Deciding it when the queued item runs cannot: the queue is serial, so the launch phase has
   * always completed by then.
   */
  channel.onMessage((value: unknown) => {
    const kind = kindOf(value);
    queue = queue.then(async () => {
      if (kind === 'stop') {
        if (phase === 'done') return;
        await teardown();
        phase = 'done';
        channel.exit(0);
        return;
      }
      if (phase === 'done') return;
      if (kind === 'launch' && phase === 'idle') {
        await handleLaunch(value);
        return;
      }
      if (kind === 'execute' && phase === 'launched') {
        await handleExecute(value);
        return;
      }
      // Anything else is a protocol violation: refuse, tear down, leave.
      refuse(`The child received an out-of-order message (${String(kind)}).`);
      await teardown();
      phase = 'done';
      channel.exit(0);
    });
  });
}

function describeProblems(problems: readonly { code: string; field: string }[]): string {
  return `The child refused the request: ${problems
    .map((problem) => `${problem.code} ${problem.field}`)
    .join(', ')}`;
}

function kindOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : null;
}
