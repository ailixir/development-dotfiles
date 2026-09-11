/**
 * In-process doubles for the browser child (10.12).
 *
 * They exist so the whole of the parent↔child protocol, the run's four exit paths, the evidence
 * vocabulary and the popup refusal can be exercised in the **unit tier**, which stays browser-free
 * (AC-25). `test/fixtures-tier/` drives the same code against real Chromium.
 *
 * Like `test/helpers/runner.ts`, these live under `test/` rather than `src/`: a fake browser has
 * no business shipping inside the image whose entire job is to be the only thing that launches a
 * real one, and keeping them out of `src/` keeps them out of the coverage gate.
 */
import type { BrowserFactory, BrowserHandle, BrowserLaunchRequest } from '../../src/run/browserFactory.js';
import type { LocatorLike, PageLike, QueryRoot } from '../../src/run/playwrightAdapter.js';
import type {
  ChildProcessHandle,
  ChildSpawnRequest,
  ChildSpawner,
} from '../../src/run/launcher.js';
import type { ParentMessage } from '../../src/run/protocol.js';

// ── A page that records what it was asked to do ───────────────────────────────────────────────

export interface RecordedPageCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface FakePage extends PageLike {
  readonly calls: RecordedPageCall[];
  /** Text every `textContent`/`innerText` read returns. */
  text: string;
  value: string;
  currentUrl: string;
  currentTitle: string;
  /** Makes the next call to `method` reject. */
  failOn(method: string, error: Error): void;
  /** Makes `waitFor` never satisfy, so an assertion has to time out. */
  neverVisible: boolean;
}

export function createFakePage(): FakePage {
  const calls: RecordedPageCall[] = [];
  const failures = new Map<string, Error>();

  const page: FakePage = {
    calls,
    text: 'hello world',
    value: 'typed',
    currentUrl: 'http://127.0.0.1/',
    currentTitle: 'Checks — Home',
    neverVisible: false,
    failOn(method: string, error: Error): void {
      failures.set(method, error);
    },
    goto(url: string, options?: Record<string, unknown>): Promise<unknown> {
      calls.push({ method: 'goto', args: [url, options] });
      return maybeFail(failures, 'goto') ?? Promise.resolve(null);
    },
    waitForURL(url: string | RegExp, options?: Record<string, unknown>): Promise<void> {
      calls.push({ method: 'waitForURL', args: [describe(url), options] });
      return maybeFail(failures, 'waitForURL') ?? Promise.resolve();
    },
    url(): string {
      return page.currentUrl;
    },
    title(): Promise<string> {
      return maybeFail(failures, 'title') ?? Promise.resolve(page.currentTitle);
    },
  } as FakePage;

  Object.assign(page, locatorFactories(page, calls, 'page'));
  return page;
}

function describe(value: string | RegExp): string {
  return value instanceof RegExp ? `/${value.source}/${value.flags}` : value;
}

function maybeFail(failures: Map<string, Error>, method: string): Promise<never> | null {
  const failure = failures.get(method);
  if (failure === undefined) return null;
  failures.delete(method);
  return Promise.reject(failure);
}

/**
 * Builds the locator factories for a root, recording the chain as it is applied.
 *
 * The chain is recorded as a path string (`page.getByRole(button).locator(.x)`) so a test can
 * assert the adapter built the locator the corpus asked for without reaching into Playwright.
 */
function locatorFactories(
  page: FakePage,
  calls: RecordedPageCall[],
  path: string,
): Pick<
  QueryRoot,
  'getByRole' | 'getByText' | 'getByLabel' | 'getByPlaceholder' | 'getByTestId' | 'locator'
> {
  const child = (method: string, ...args: unknown[]): LocatorLike => {
    const next = `${path}.${method}(${args.map((arg) => describeArg(arg)).join(',')})`;
    calls.push({ method, args });
    return createFakeLocator(page, calls, next);
  };
  return {
    getByRole: (role, options) => child('getByRole', role, options),
    getByText: (text, options) => child('getByText', describe(text), options),
    getByLabel: (text, options) => child('getByLabel', describe(text), options),
    getByPlaceholder: (text, options) => child('getByPlaceholder', describe(text), options),
    getByTestId: (testId) => child('getByTestId', testId),
    locator: (selector) => child('locator', selector),
  };
}

function describeArg(arg: unknown): string {
  if (arg === undefined) return '';
  if (typeof arg === 'string') return arg;
  return JSON.stringify(arg);
}

export function createFakeLocator(
  page: FakePage,
  calls: RecordedPageCall[],
  path: string,
): LocatorLike {
  const record = (method: string, ...args: unknown[]): void => {
    calls.push({ method: `${path}.${method}`, args });
  };
  const locator: LocatorLike = {
    ...locatorFactories(page, calls, path),
    click(options?: Record<string, unknown>): Promise<void> {
      record('click', options);
      return Promise.resolve();
    },
    fill(value: string, options?: Record<string, unknown>): Promise<void> {
      record('fill', value, options);
      page.value = value;
      return Promise.resolve();
    },
    press(key: string, options?: Record<string, unknown>): Promise<void> {
      record('press', key, options);
      return Promise.resolve();
    },
    check(options?: Record<string, unknown>): Promise<void> {
      record('check', options);
      return Promise.resolve();
    },
    uncheck(options?: Record<string, unknown>): Promise<void> {
      record('uncheck', options);
      return Promise.resolve();
    },
    hover(options?: Record<string, unknown>): Promise<void> {
      record('hover', options);
      return Promise.resolve();
    },
    selectOption(values: string, options?: Record<string, unknown>): Promise<readonly string[]> {
      record('selectOption', values, options);
      return Promise.resolve([values]);
    },
    waitFor(options?: Record<string, unknown>): Promise<void> {
      record('waitFor', options);
      return page.neverVisible
        ? Promise.reject(new Error('TimeoutError: locator did not become visible'))
        : Promise.resolve();
    },
    textContent(): Promise<string | null> {
      return Promise.resolve(page.text);
    },
    innerText(): Promise<string> {
      return Promise.resolve(page.text);
    },
    inputValue(): Promise<string> {
      return Promise.resolve(page.value);
    },
  };
  return locator;
}

// ── A browser factory that launches nothing ───────────────────────────────────────────────────

export interface FakeBrowserFactory extends BrowserFactory {
  readonly requests: BrowserLaunchRequest[];
  readonly page: FakePage;
  readonly handles: BrowserHandle[];
  /** Number of times `close` completed. Every exit path must reach it exactly once. */
  readonly closed: number;
  readonly disposed: number;
  /** Makes the next launch reject, so the launch-failure path can be driven. */
  failNextLaunch(error: Error): void;
  /** Path `close` reports having produced; `null` means no file. */
  producedPath: string | null;
  /** Makes `close` reject, so the flush-failure path can be driven. */
  failClose: Error | null;
  hosts: string[];
  /** Fires the extra-page listener, as a popup would. */
  openExtraPage(): void;
}

export function createFakeBrowserFactory(): FakeBrowserFactory {
  const requests: BrowserLaunchRequest[] = [];
  const handles: BrowserHandle[] = [];
  const page = createFakePage();
  let failure: Error | null = null;
  let closed = 0;
  let disposed = 0;
  let extraPageListener: (() => void) | null = null;

  const factory: FakeBrowserFactory = {
    requests,
    page,
    handles,
    producedPath: '/scratch/run-1/video/page.webm',
    failClose: null,
    hosts: ['127.0.0.1:8123'],
    get closed(): number {
      return closed;
    },
    get disposed(): number {
      return disposed;
    },
    failNextLaunch(error: Error): void {
      failure = error;
    },
    openExtraPage(): void {
      extraPageListener?.();
    },
    launch(request: BrowserLaunchRequest): Promise<BrowserHandle> {
      if (failure !== null) {
        const error = failure;
        failure = null;
        return Promise.reject(error);
      }
      requests.push(request);
      const handle: BrowserHandle = {
        page,
        onExtraPage(listener: () => void): void {
          extraPageListener = listener;
        },
        observedHosts: () => factory.hosts,
        close(): Promise<string | null> {
          closed += 1;
          if (factory.failClose !== null) return Promise.reject(factory.failClose);
          return Promise.resolve(factory.producedPath);
        },
        dispose(): Promise<void> {
          disposed += 1;
          return Promise.resolve();
        },
      };
      handles.push(handle);
      return Promise.resolve(handle);
    },
  };
  return factory;
}

// ── A spawner that spawns nothing ─────────────────────────────────────────────────────────────

export interface FakeChildProcess extends ChildProcessHandle {
  readonly sent: ParentMessage[];
  /** Delivers a message to the parent, as the real child would over IPC. */
  emit(value: unknown): void;
  /** Ends the process, as an exit would. */
  end(code?: number): void;
  readonly killed: number;
}

export interface FakeSpawner extends ChildSpawner {
  /** Every spawn request, exactly as it would have been handed to the operating system. */
  readonly requests: ChildSpawnRequest[];
  readonly children: FakeChildProcess[];
}

export function createFakeSpawner(): FakeSpawner {
  const requests: ChildSpawnRequest[] = [];
  const children: FakeChildProcess[] = [];
  return {
    requests,
    children,
    spawn(request: ChildSpawnRequest): FakeChildProcess {
      requests.push(request);
      const sent: ParentMessage[] = [];
      const messageListeners: ((value: unknown) => void)[] = [];
      const exitListeners: ((code: number | null, signal: string | null) => void)[] = [];
      let killed = 0;
      let ended = false;
      const child: FakeChildProcess = {
        sent,
        pid: 4242,
        get killed(): number {
          return killed;
        },
        send(message: ParentMessage): void {
          sent.push(message);
        },
        onMessage(listener: (value: unknown) => void): void {
          messageListeners.push(listener);
        },
        onExit(listener: (code: number | null, signal: string | null) => void): void {
          exitListeners.push(listener);
        },
        kill(): void {
          killed += 1;
          child.end();
        },
        emit(value: unknown): void {
          for (const listener of messageListeners) listener(value);
        },
        end(code = 0): void {
          if (ended) return;
          ended = true;
          for (const listener of exitListeners) listener(code, null);
        },
      };
      children.push(child);
      return child;
    },
  };
}
