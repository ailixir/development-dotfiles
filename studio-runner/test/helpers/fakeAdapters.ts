import type {
  BrowserAdapter,
  LocatorHandle,
  ResolvedMatcher,
} from '../../src/executor/adapters/BrowserAdapter.js';
import type {
  Clock,
  StepFinishedEvent,
  StepReporter,
  StepStartedEvent,
} from '../../src/executor/adapters/StepReporter.js';
import type {
  ActionOptions,
  ClickOptions,
  ContainTextOptions,
  GotoOptions,
  HaveUrlOptions,
  LocatorChain,
  PressOptions,
  TimeoutOptions,
} from '../../src/executor/operations.js';

/**
 * Fake adapters for the unit tier (ADR-001 §7.1). They launch nothing: they record the calls the
 * executor made, in order, so tests can assert the exact trusted-call sequence for a reference
 * artifact and assert *no* call at all for an adversarial one.
 */

export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

interface FakeLocatorHandle extends LocatorHandle {
  readonly chain: LocatorChain;
  readonly id: number;
}

export interface FakeBrowserAdapter extends BrowserAdapter {
  readonly calls: readonly RecordedCall[];
  /**
   * The secret id each `fill` carried, in order (`undefined` for a non-secret value). Kept apart
   * from `calls` so the reference corpus's recorded call shapes are unchanged.
   */
  readonly fillSecretIds: readonly (string | undefined)[];
  /** Makes the next call to `method` reject, so failure paths can be exercised. */
  failOn(method: string, error: Error): void;
}

export function createFakeBrowserAdapter(): FakeBrowserAdapter {
  const calls: RecordedCall[] = [];
  const fillSecretIds: (string | undefined)[] = [];
  const failures = new Map<string, Error>();
  let handleId = 0;

  const record = (method: string, ...args: unknown[]): void => {
    calls.push({ method, args });
    const failure = failures.get(method);
    if (failure !== undefined) {
      failures.delete(method);
      throw failure;
    }
  };

  return {
    calls,
    fillSecretIds,
    failOn(method: string, error: Error): void {
      failures.set(method, error);
    },
    goto(url: string, options?: GotoOptions): Promise<void> {
      record('goto', url, options);
      return Promise.resolve();
    },
    waitForURL(url: ResolvedMatcher, options?: GotoOptions): Promise<void> {
      record('waitForURL', url, options);
      return Promise.resolve();
    },
    locate(chain: LocatorChain): Promise<LocatorHandle> {
      record('locate', chain);
      handleId += 1;
      const handle: FakeLocatorHandle = { kind: 'locator-handle', chain, id: handleId };
      return Promise.resolve(handle);
    },
    click(target: LocatorHandle, options?: ClickOptions): Promise<void> {
      record('click', describe(target), options);
      return Promise.resolve();
    },
    fill(
      target: LocatorHandle,
      value: string,
      options?: ActionOptions,
      secretId?: string,
    ): Promise<void> {
      fillSecretIds.push(secretId);
      record('fill', describe(target), value, options);
      return Promise.resolve();
    },
    press(target: LocatorHandle, key: string, options?: PressOptions): Promise<void> {
      record('press', describe(target), key, options);
      return Promise.resolve();
    },
    check(target: LocatorHandle, options?: ActionOptions): Promise<void> {
      record('check', describe(target), options);
      return Promise.resolve();
    },
    uncheck(target: LocatorHandle, options?: ActionOptions): Promise<void> {
      record('uncheck', describe(target), options);
      return Promise.resolve();
    },
    hover(target: LocatorHandle, options?: ActionOptions): Promise<void> {
      record('hover', describe(target), options);
      return Promise.resolve();
    },
    selectOption(target: LocatorHandle, value: string, options?: ActionOptions): Promise<void> {
      record('selectOption', describe(target), value, options);
      return Promise.resolve();
    },
    expectVisible(target: LocatorHandle, options?: TimeoutOptions): Promise<void> {
      record('expectVisible', describe(target), options);
      return Promise.resolve();
    },
    expectContainText(
      target: LocatorHandle,
      expected: ResolvedMatcher,
      options?: ContainTextOptions,
    ): Promise<void> {
      record('expectContainText', describe(target), expected, options);
      return Promise.resolve();
    },
    expectValue(
      target: LocatorHandle,
      expected: ResolvedMatcher,
      options?: TimeoutOptions,
    ): Promise<void> {
      record('expectValue', describe(target), expected, options);
      return Promise.resolve();
    },
    expectUrl(expected: ResolvedMatcher, options?: HaveUrlOptions): Promise<void> {
      record('expectUrl', expected, options);
      return Promise.resolve();
    },
    expectTitle(expected: ResolvedMatcher, options?: TimeoutOptions): Promise<void> {
      record('expectTitle', expected, options);
      return Promise.resolve();
    },
  };
}

function describe(target: LocatorHandle): LocatorChain | string {
  return isFakeHandle(target) ? target.chain : 'unknown-handle';
}

function isFakeHandle(target: LocatorHandle): target is FakeLocatorHandle {
  return 'chain' in target;
}

export interface RecordingStepReporter extends StepReporter {
  readonly started: readonly StepStartedEvent[];
  readonly finished: readonly StepFinishedEvent[];
}

export function createRecordingStepReporter(): RecordingStepReporter {
  const started: StepStartedEvent[] = [];
  const finished: StepFinishedEvent[] = [];
  return {
    started,
    finished,
    stepStarted(event: StepStartedEvent): void {
      started.push(event);
    },
    stepFinished(event: StepFinishedEvent): void {
      finished.push(event);
    },
  };
}

/** Deterministic monotonic clock: each read advances by a fixed tick. */
export function createFakeClock(startMs = 1_000, tickMs = 10): Clock {
  let current = startMs - tickMs;
  return {
    now(): number {
      current += tickMs;
      return current;
    },
  };
}

