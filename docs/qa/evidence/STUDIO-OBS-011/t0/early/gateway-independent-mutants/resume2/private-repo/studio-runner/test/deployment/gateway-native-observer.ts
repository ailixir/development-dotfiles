/** Scratch-only pass-through observation. Never used by the product or copied Helm harness. */
import { execFileSync as esmExecFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';

// Require returns the mutable builtin export object; an ESM namespace object is immutable.
const childProcess = createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process');
export interface NativeFrame {
  executable: string; argv: string[]; argvSha256: string; cwd: string;
  optionsMatched: boolean; chartBeforeSha256: string | null; chartAfterSha256: string | null;
  nativeExit: number | null; signal: string | null; signalKnown: boolean;
  setupErrorCode: string | null; spawnErrorPresent: boolean;
  nativeThrew: boolean; stdoutKnown: boolean; stdoutSha256: string | null;
  stderrKnown: boolean; stderrSha256: string | null;
  messageKnown: boolean; messageSha256: string | null; mergedErrorSha256: string | null;
  observerComplete: boolean;
  exitSource: 'EXECFILESYNC_RETURN' | 'THROWN_NATIVE_STATUS' | 'UNOBSERVED';
}
export interface ExpectedNative {
  argvSha256: string; cwd: string; chartSha256: string;
}
export interface Observation<T> {
  outcome: T; frames: NativeFrame[]; nativeErrors: unknown[]; observerErrors: unknown[];
  builtinRestored: boolean;
}
export function byteHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export function argvHash(argv: readonly string[]): string {
  return byteHash(JSON.stringify(argv));
}
function output(value: unknown): string | Buffer | null {
  return typeof value === 'string' || Buffer.isBuffer(value) ? value : null;
}
let observerPoisoned = false;
export function observeHelmRender<T>(run: () => T, chartHash: (chart: string) => string): Observation<T> {
  if (observerPoisoned) throw new Error('prior scratch observation failure holds further native calls');
  const original = childProcess.execFileSync;
  const frames: NativeFrame[] = [];
  const nativeErrors: unknown[] = [];
  const observerErrors: unknown[] = [];
  let builtinRestored = false;
  // The one cast preserves the builtin's overloaded signatures; all arguments/results are passed unchanged.
  const wrapper = function (this: unknown, ...call: unknown[]): unknown {
    const file = call[0];
    const args = call[1];
    if (file !== 'helm' || !Array.isArray(args) || args[0] !== 'template') {
      return Reflect.apply(original, this, call);
    }
    let frame: NativeFrame | undefined;
    let chart: string | undefined;
    try {
      if (!args.every((entry: unknown) => typeof entry === 'string')) throw new Error('native argv is not a string array');
      if (typeof args[2] !== 'string') throw new Error('actual template chart path is missing');
      chart = args[2];
      const options = call[2] as Record<string, unknown> | undefined;
      const cwd = options?.cwd === undefined ? process.cwd()
        : typeof options.cwd === 'string' ? resolve(options.cwd) : '';
      const argv = [file, ...(args as string[])];
      frame = { executable: file, argv, argvSha256: argvHash(argv), cwd,
        optionsMatched: options?.encoding === 'utf8'
          && JSON.stringify(options.stdio) === '["ignore","pipe","pipe"]'
          && options.input === undefined && options.shell === undefined,
        chartBeforeSha256: null, chartAfterSha256: null,
        nativeExit: null, signal: null, signalKnown: false, setupErrorCode: null,
        spawnErrorPresent: false, nativeThrew: false, stdoutKnown: false, stdoutSha256: null,
        stderrKnown: false, stderrSha256: null, messageKnown: false, messageSha256: null,
        mergedErrorSha256: null, observerComplete: false, exitSource: 'UNOBSERVED' };
      frames.push(frame);
      frame.chartBeforeSha256 = chartHash(chart);
    } catch (error) { observerErrors.push(error); }
    let result: unknown;
    try {
      // Exactly one call to the original builtin; no changed argument, options, this or second render.
      result = Reflect.apply(original, this, call);
    } catch (nativeError) {
      nativeErrors.push(nativeError);
      try {
        if (frame === undefined || chart === undefined) throw new Error('native failure lacks its frame');
        frame.nativeThrew = true;
        if (nativeError === null || typeof nativeError !== 'object') throw new Error('native failure has no status object');
        const shaped = nativeError as Record<string, unknown>;
        frame.nativeExit = typeof shaped.status === 'number' && Number.isInteger(shaped.status) ? shaped.status : null;
        frame.signalKnown = shaped.signal === null || typeof shaped.signal === 'string';
        frame.signal = typeof shaped.signal === 'string' ? shaped.signal : null;
        frame.setupErrorCode = shaped.code === undefined || shaped.code === null ? null
          : typeof shaped.code === 'string' ? shaped.code : 'NON_STRING_NATIVE_ERROR_CODE';
        frame.spawnErrorPresent = shaped.error !== undefined && shaped.error !== null;
        const stdout = output(shaped.stdout);
        const stderr = output(shaped.stderr);
        frame.stdoutKnown = stdout !== null;
        frame.stdoutSha256 = stdout === null ? null : byteHash(stdout);
        frame.stderrKnown = stderr !== null;
        frame.stderrSha256 = stderr === null ? null : byteHash(stderr);
        frame.messageKnown = typeof shaped.message === 'string';
        frame.messageSha256 = typeof shaped.message === 'string' ? byteHash(shaped.message) : null;
        // The unchanged harness merges UTF8 stderr and message with exactly this newline.
        frame.mergedErrorSha256 = typeof shaped.stderr === 'string' && typeof shaped.message === 'string'
          ? byteHash([shaped.stderr, shaped.message].join('\n')) : null;
        frame.chartAfterSha256 = chartHash(chart);
        frame.exitSource = 'THROWN_NATIVE_STATUS';
        frame.observerComplete = true;
      } catch (observerError) { observerErrors.push(observerError); }
      throw nativeError;
    }
    try {
      if (frame === undefined || chart === undefined) throw new Error('native success lacks its frame');
      const stdout = output(result);
      frame.nativeExit = 0; frame.signal = null; frame.signalKnown = true;
      frame.stdoutKnown = stdout !== null;
      frame.stdoutSha256 = stdout === null ? null : byteHash(stdout);
      // execFileSync exposes only returned stdout on success, never invent empty native stderr.
      frame.chartAfterSha256 = chartHash(chart);
      frame.exitSource = 'EXECFILESYNC_RETURN';
      frame.observerComplete = true;
    } catch (observerError) { observerErrors.push(observerError); }
    return result;
  } as typeof childProcess.execFileSync;
  let outcome: T | undefined;
  let callbackThrew = false;
  let callbackError: unknown;
  try {
    childProcess.execFileSync = wrapper;
    syncBuiltinESMExports();
    if (esmExecFileSync !== wrapper) throw new Error('scratch builtin ESM observer binding missing');
    outcome = run();
  } catch (error) { callbackThrew = true; callbackError = error; }
  finally {
    try {
      if (childProcess.execFileSync !== wrapper) throw new Error('scratch builtin writer ownership changed');
      childProcess.execFileSync = original;
      syncBuiltinESMExports();
      builtinRestored = childProcess.execFileSync === original && esmExecFileSync === original;
    } catch (error) { observerErrors.push(error); }
  }
  if (!builtinRestored || observerErrors.length > 0) observerPoisoned = true;
  if (callbackThrew) {
    if (observerErrors.length === 0) throw callbackError;
    throw new AggregateError([callbackError, ...nativeErrors, ...observerErrors], 'render and observer errors preserved');
  }
  // The callback returns a RenderOutcome. An impossible missing return is rejected by its caller.
  return { outcome: outcome as T, frames, nativeErrors, observerErrors, builtinRestored };
}
export function validateNativeObservation<T extends { ok: boolean; raw: string; error: string }>(
  observed: Observation<T>, expected: ExpectedNative, accepts: boolean,
): NativeFrame {
  const { frames, outcome, observerErrors, builtinRestored } = observed;
  if (frames.length !== 1) throw new Error('one actual native template invocation is required');
  const f = frames[0];
  if (f === undefined) throw new Error('actual native template frame missing');
  // Closed, source-extracted clauses also exercised by the light Python fake contracts.
  const checks: [string, boolean][] = [
    ['BUILTIN_RESTORED', builtinRestored === true],
    ['NO_OBSERVER_FAILURE', observerErrors.length === 0],
    ['COMPLETE_FRAME', f.observerComplete === true],
    ['HELM_AND_OPTIONS', f.executable === 'helm' && f.optionsMatched === true],
    ['ARGV_SELF_BINDING', argvHash(f.argv) === f.argvSha256],
    ['ARGV_BINDING', f.argvSha256 === expected.argvSha256],
    ['CWD_BINDING', f.cwd === expected.cwd],
    ['INPUT_BINDING', f.chartBeforeSha256 === expected.chartSha256 && f.chartAfterSha256 === expected.chartSha256],
    ['REAL_EXIT', f.nativeExit !== null && Number.isInteger(f.nativeExit) && f.nativeExit >= 0],
    ['NO_SIGNAL', f.signalKnown === true && f.signal === null],
    ['NO_SPAWN_ERROR', f.setupErrorCode === null && f.spawnErrorPresent === false],
    ['STDOUT_BINDING', f.stdoutKnown === true && f.stdoutSha256 === byteHash(outcome.raw)],
    ['PARSED_OUTCOME', outcome.ok === accepts],
    ['EXPECTED_NATIVE_EXIT', (!accepts || f.nativeExit === 0) && (accepts || f.nativeExit !== 0)],
    ['EXPECTED_NATIVE_THROW', (!accepts || f.nativeThrew === false) && (accepts || f.nativeThrew === true)],
    ['EXPECTED_EXIT_SOURCE', (!accepts || f.exitSource === 'EXECFILESYNC_RETURN') && (accepts || f.exitSource === 'THROWN_NATIVE_STATUS')],
    ['ERROR_OUTPUT_BINDING', (!accepts || outcome.error === '') && (accepts || (f.stderrKnown === true && f.messageKnown === true && f.mergedErrorSha256 === byteHash(outcome.error)))],
  ];
  for (const [name, valid] of checks) if (!valid) throw new Error(`native observation rejected: ${name}`);
  return f;
}
