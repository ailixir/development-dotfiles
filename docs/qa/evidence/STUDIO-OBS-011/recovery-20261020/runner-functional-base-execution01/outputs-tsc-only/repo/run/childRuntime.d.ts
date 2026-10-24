/**
 * The observed replay run, inside the child process (`/v2/runs`).
 *
 * ## Why the run is here and not in the parent
 *
 * ADR-002 §11.6 puts the run clock's zero at recording-context readiness, observed **once**, with
 * `browserStartedAt` read adjacently to it (AC-11.2). Readiness is something only the process
 * holding the browser can observe, so the clock is created here and the observed replay executor
 * is driven here with it injected. The parent receives readings it never re-bases:
 * `browserStartedAt` and `startedAtMs` arrive together in the `Ready3` frame and pass through to
 * the wire unchanged.
 *
 * ## Two phases
 *
 * `Launch3` → the browser starts, the recording context and page are created, the origin is taken,
 * `Ready3` goes back. `Execute3` → the learned plan replays and the steps are reported. Every frame
 * is validated against the closed `replay-ipc` schema before anything acts on it.
 *
 * ## Exit
 *
 * The child exits on **every** path — success, step failure, launch failure, refusal, stop — and
 * the browser and context are closed before it does. `close` is the ordered path, and it is
 * awaited, because awaiting the context close is what flushes the webm (§6.1); `dispose` is the
 * last resort when the ordered path itself fails.
 *
 * STUDIO-OBS-012A AC-3 carved the artifact-1 child protocol out of this module (the legacy
 * `launch`/`execute` messages and their runtime, the Playwright operation adapter and
 * the family selection on the first frame): the child now speaks the observed family only.
 */
import type { BuildIdentity } from '../executor/observedOperations.js';
import type { ObservedChildMessage } from './protocol.js';
import type { BrowserFactory } from './browserFactory.js';
import type { RecordingObservation } from './recording.js';
import type { OriginSource } from './timeline.js';
import { publishAppVideoOwner } from './appVideoOwnership.js';
/** The transport, injected so the whole child runtime runs in-process in the unit tier. */
export interface ChildChannel {
    onMessage(listener: (value: unknown) => void): void;
    send(message: ObservedChildMessage): void;
    /** Called once the run has reported its result. Every path reaches it. */
    exit(code: number): void;
}
export interface ChildRuntimeDependencies {
    readonly channel: ChildChannel;
    readonly browsers: BrowserFactory;
    readonly observedBuild?: BuildIdentity;
    /** Unit lifecycle seam; the actual child always uses closed native ownership publication. */
    readonly publishAppVideoOwner?: typeof publishAppVideoOwner;
    /** The two adjacent reads of the run origin. Injected only so a test can drive them. */
    readonly originSource?: OriginSource | undefined;
    /** Reads the produced recording. Injected so the evidence branches are testable. */
    readonly inspectRecording?: ((path: string | null, orderlyClose: boolean) => Promise<RecordingObservation>) | undefined;
    /**
     * The wall-clock wait the tail settle uses (see {@link TAIL_SETTLE_HOLD_MS}). Injected so the
     * unit tier can observe the hold without spending it; the child itself uses a real timer.
     */
    readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}
/**
 * How long the recorder runs on past the last operation before the ordinary close.
 *
 * The replay resolves the instant the last operation's promise does, and a click that triggered a
 * navigation resolves when the navigation *commits* — not when the new document paints. Closing
 * the context right there stops the recorder before the final action's result has composited, so
 * the recording would end on the state *before* the last step. The hold is a few frame quanta (the
 * recorder samples at 25 fps, 40 ms apart), never longer than the run deadline that remains, and
 * an out-of-band `stop` is never delayed by it.
 */
export declare const TAIL_SETTLE_HOLD_MS = 300;
/** Binds the observed child runtime to its channel. The first frame must be a valid `Launch3`. */
export declare function attachChildRuntime(dependencies: ChildRuntimeDependencies): void;
