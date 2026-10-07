import { describe, expect, it } from 'vitest';

import { createValueResolver, executeSteps } from '../src/executor/executor.js';
import {
  createFakeBrowserAdapter,
  createFakeClock,
  createRecordingStepReporter,
} from './helpers/fakeAdapters.js';
import type { FillValue, Operation } from '../src/executor/operations.js';
import { StepRefusal } from '../src/executor/refusals.js';

const gotoStep = (stepIndex: number, url: string): { stepIndex: number; operations: Operation[] } => ({
  stepIndex,
  operations: [{ op: 'goto', url: { kind: 'literal', value: url } }],
});

describe('trusted executor', () => {
  it('reports monotonic timings for every executed step (AC-14)', async () => {
    const adapter = createFakeBrowserAdapter();
    const reporter = createRecordingStepReporter();

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/'), gotoStep(1, 'https://b.example/')],
      adapter,
      reporter,
      resolver: createValueResolver({}),
      clock: createFakeClock(1000, 5),
    });

    expect(result.ok).toBe(true);
    expect(reporter.started.map((event) => event.stepIndex)).toEqual([0, 1]);
    const timestamps = reporter.finished.flatMap((event) => [event.startedAtMs, event.finishedAtMs]);
    for (let index = 1; index < timestamps.length; index += 1) {
      const previous = timestamps[index - 1];
      const current = timestamps[index];
      expect(previous).not.toBeNull();
      expect(current).not.toBeNull();
      expect(current ?? 0).toBeGreaterThan(previous ?? 0);
    }
    expect(result.steps.every((step) => step.status === 'PASS')).toBe(true);
  });

  it('stops at the first failing step and skips the rest with null timings (AC-14)', async () => {
    const adapter = createFakeBrowserAdapter();
    const reporter = createRecordingStepReporter();
    adapter.failOn('goto', new Error('navigation refused'));

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/'), gotoStep(1, 'https://b.example/'), gotoStep(2, 'https://c.example/')],
      adapter,
      reporter,
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => step.status)).toEqual(['FAIL', 'SKIPPED', 'SKIPPED']);
    expect(result.steps[0]?.failure).toContain('navigation refused');
    for (const skipped of result.steps.slice(1)) {
      expect(skipped.startedAtMs).toBeNull();
      expect(skipped.finishedAtMs).toBeNull();
      expect(skipped.durationMs).toBeNull();
      expect(skipped.failure).toBeNull();
    }
    // Only the first step reached the adapter.
    expect(adapter.calls.map((call) => call.method)).toEqual(['goto']);
    expect(reporter.started).toHaveLength(1);
  });

  it('bounds the failure message (AC-15)', async () => {
    const adapter = createFakeBrowserAdapter();
    adapter.failOn('goto', new Error('x'.repeat(5_000)));

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
      maxFailureMessageLength: 64,
    });

    expect(result.steps[0]?.failure?.length).toBeLessThanOrEqual(64);
  });

  it('resolves a variable only through the resolver', async () => {
    const adapter = createFakeBrowserAdapter();
    const result = await executeSteps({
      steps: [
        {
          stepIndex: 0,
          operations: [{ op: 'goto', url: { kind: 'variable', name: 'BASE_URL' } }],
        },
      ],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ variables: { BASE_URL: 'https://resolved.example/' } }),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(true);
    expect(adapter.calls[0]?.args[0]).toBe('https://resolved.example/');
  });

  it('fails the step when a reference cannot be resolved', async () => {
    const adapter = createFakeBrowserAdapter();
    const result = await executeSteps({
      steps: [
        { stepIndex: 0, operations: [{ op: 'goto', url: { kind: 'variable', name: 'MISSING' } }] },
      ],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0]?.failure).toContain('MISSING');
    expect(adapter.calls).toEqual([]);
  });

  it('survives a non-Error rejection without leaking its content', async () => {
    const adapter = createFakeBrowserAdapter();
    // The adapter contract says Error, but a hostile page can make Playwright reject with anything.
    adapter.failOn('goto', 'plain string failure' as unknown as Error);

    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.steps[0]?.failure).toBe('Non-error thrown: string');
  });

  /**
   * AC-11.1 — **there is no default clock any more.**
   *
   * The optional `clock` that defaulted to `performance.now()` was a defect generator: the seam
   * exists so the origin can be chosen, and the default quietly chose *process start* whenever a
   * caller forgot. `runCoordinator.ts` forgot, which is how the runner came to report step
   * offsets from process start while the browser-start log line carried a literal `0` — two
   * origins on a timeline ADR-002 §4.1 requires to have one.
   *
   * The type now requires it. This asserts the *run-time* half, reaching past the types the way
   * a compiled caller would, because a type-level guard is not one the emitted JavaScript
   * enforces.
   */
  it('refuses to run without an explicitly supplied run clock', async () => {
    const options = {
      steps: [gotoStep(0, 'https://a.example/')],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
    } as unknown as Parameters<typeof executeSteps>[0];

    await expect(executeSteps(options)).rejects.toThrow(/explicit run clock/u);
  });

  it('names the origin in the refusal, so the fix is obvious at the call site', async () => {
    const options = {
      steps: [],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
    } as unknown as Parameters<typeof executeSteps>[0];

    await expect(executeSteps(options)).rejects.toThrow(/recording-context readiness/u);
  });

  it('carries the clock it is given, at whatever scale it is given', async () => {
    // AC-11.3's control: the executor reports readings, it does not choose an origin. A clock
    // starting at 0 and one starting far away both reach the wire unaltered, which is why the
    // scale property has to be asserted where the origin is *taken*, not here.
    for (const startMs of [0, 1_000, 5_000_000]) {
      const result = await executeSteps({
        steps: [gotoStep(0, 'https://a.example/')],
        adapter: createFakeBrowserAdapter(),
        reporter: createRecordingStepReporter(),
        resolver: createValueResolver({}),
        clock: createFakeClock(startMs),
      });
      expect(result.steps[0]?.startedAtMs).toBe(startMs);
      expect(result.steps[0]?.durationMs).not.toBeNull();
    }
  });

  it('reports the executor version', async () => {
    const result = await executeSteps({
      steps: [],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });
    expect(result.executorVersion).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});

describe('variable-sourced goto URLs are scheme-checked at resolution', () => {
  const variableGoto = (value: string) =>
    executeSteps({
      steps: [{ stepIndex: 0, operations: [{ op: 'goto', url: { kind: 'variable', name: 'TARGET' } }] }],
      adapter: createFakeBrowserAdapter(),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ variables: { TARGET: value } }),
      clock: createFakeClock(),
    });

  it.each([
    ['file:', 'file:///etc/passwd'],
    ['javascript:', 'javascript:alert(document.cookie)'],
    ['data:', 'data:text/html,<h1>injected</h1>'],
    ['relative', '/admin/settings'],
    ['scheme-relative', '//evil.example/login'],
    ['empty', ''],
  ])('refuses a %s value with URL_SCHEME_NOT_PERMITTED and never echoes it', async (_label, value) => {
    const adapter = createFakeBrowserAdapter();
    const result = await executeSteps({
      steps: [{ stepIndex: 0, operations: [{ op: 'goto', url: { kind: 'variable', name: 'TARGET' } }] }],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ variables: { TARGET: value } }),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(false);
    expect(result.refusal).toBe('URL_SCHEME_NOT_PERMITTED');
    expect(result.steps[0]?.failure).toMatch(/^URL_SCHEME_NOT_PERMITTED: Variable "TARGET"/u);
    // The value is redacted anyway (it is a known value); the message must not carry it at all.
    if (value !== '') expect(result.steps[0]?.failure).not.toContain(value);
    expect(result.steps[0]?.failure).not.toContain('[REDACTED]');
    // Nothing reached the browser.
    expect(adapter.calls).toEqual([]);
  });

  it('lets an absolute https value through unchanged', async () => {
    const result = await variableGoto('https://app.example/login?next=%2Fhome');
    expect(result.ok).toBe(true);
    expect(result.refusal).toBeNull();
  });

  it('lets an absolute http value through', async () => {
    expect((await variableGoto('http://127.0.0.1:8080/')).ok).toBe(true);
  });

  it('reports no refusal for an ordinary step failure', async () => {
    const adapter = createFakeBrowserAdapter();
    adapter.failOn('goto', new Error('navigation refused'));
    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });
    expect(result.ok).toBe(false);
    expect(result.refusal).toBeNull();
  });
});

describe('a secret fill carries its id to the adapter', () => {
  const fillWith = (value: FillValue): Operation => ({
    op: 'fill',
    locator: { segments: [{ kind: 'getByTestId', testId: { kind: 'literal', value: 'pw' } }] },
    value,
  });

  it('passes the secret id for a secret value and nothing for a literal or variable', async () => {
    const adapter = createFakeBrowserAdapter();
    const result = await executeSteps({
      steps: [
        {
          stepIndex: 0,
          operations: [
            fillWith({ kind: 'secret', id: 'LOGIN_PW' }),
            fillWith({ kind: 'literal', value: 'plain' }),
            fillWith({ kind: 'variable', name: 'USER' }),
          ],
        },
      ],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ variables: { USER: 'alice' }, secrets: { LOGIN_PW: 'pw' } }),
      clock: createFakeClock(),
    });

    expect(result.ok).toBe(true);
    expect(adapter.fillSecretIds).toEqual(['LOGIN_PW', undefined, undefined]);
  });

  it('reports an adapter refusal as the run refusal', async () => {
    const adapter = createFakeBrowserAdapter();
    adapter.failOn(
      'fill',
      new StepRefusal('SECRET_ORIGIN_NOT_ALLOWED', 'Secret "LOGIN_PW" is not bound to this origin.'),
    );
    const result = await executeSteps({
      steps: [{ stepIndex: 0, operations: [fillWith({ kind: 'secret', id: 'LOGIN_PW' })] }],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ secrets: { LOGIN_PW: 'pw' } }),
      clock: createFakeClock(),
    });

    expect(result.refusal).toBe('SECRET_ORIGIN_NOT_ALLOWED');
    expect(result.steps[0]?.failure).toMatch(/^SECRET_ORIGIN_NOT_ALLOWED: Secret "LOGIN_PW"/u);
  });
});

describe('VAL-013 — a failed step names the page the browser was on', () => {
  const SECRET = 'tok-3f9a-secret-canary';

  async function failWithLocation(
    pageLocation: () => Promise<{ url: string; title: string | null } | null>,
    overrides: { maxFailureMessageLength?: number; pageLocationTimeoutMs?: number } = {},
  ): Promise<string | null> {
    const adapter = Object.assign(createFakeBrowserAdapter(), { pageLocation });
    adapter.failOn('goto', new Error('navigation refused'));
    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({ secrets: { pw: SECRET } }),
      clock: createFakeClock(),
      ...overrides,
    });
    return result.steps[0]?.failure ?? null;
  }

  it('appends origin + pathname and the title', async () => {
    const failure = await failWithLocation(() =>
      Promise.resolve({ url: 'https://www.google.com/sorry/index', title: 'Unusual traffic' }),
    );
    expect(failure).toBe(
      'Error: navigation refused (page: https://www.google.com/sorry/index — "Unusual traffic")',
    );
  });

  it('never emits the query, the fragment or the userinfo', async () => {
    const failure = await failWithLocation(() =>
      Promise.resolve({
        url: 'https://user:hunter2@app.example:8443/cb/login?code=abc123&state=s1#access_token=zz',
        title: null,
      }),
    );
    expect(failure).toBe('Error: navigation refused (page: https://app.example:8443/cb/login)');
    for (const leaked of ['hunter2', 'user', 'abc123', 'state', 'access_token', '?', '#']) {
      expect(failure).not.toContain(leaked);
    }
  });

  it('reduces a non-http scheme to the scheme, so a data: URL cannot carry the document', async () => {
    const failure = await failWithLocation(() =>
      Promise.resolve({ url: `data:text/html,<p>${SECRET}</p>`, title: null }),
    );
    expect(failure).toBe('Error: navigation refused (page: data:)');
  });

  it('redacts a known value in the path and in the title, and truncates the title', async () => {
    const failure = await failWithLocation(() =>
      Promise.resolve({
        url: `https://app.example/users/${SECRET}/edit`,
        title: `Welcome ${SECRET} ${'x'.repeat(300)}`,
      }),
    );
    expect(failure).not.toContain(SECRET);
    expect(failure).toContain('(page: https://app.example/users/[REDACTED]/edit — "Welcome [REDACTED] ');
    const title = /— "(.*)"\)$/u.exec(failure ?? '')?.[1] ?? '';
    expect(title.length).toBeLessThanOrEqual(120);
  });

  describe('VAL-020 — a URL inside the title is reduced like the location', () => {
    const at = (title: string): Promise<string | null> =>
      failWithLocation(() => Promise.resolve({ url: 'https://www.google.com/sorry/index', title }));

    it('reduces a title that is itself a URL (Google /sorry) to origin + path', async () => {
      const failure = await at(
        'https://www.google.com/search?q=hosting&sca_esv=ec734b9ba2f66c6f&sxsrf=APpeQnvXBQcXfUBg1nYM6YUtdTxB7B5lEw%3A1791159561700',
      );
      expect(failure).toBe(
        'Error: navigation refused (page: https://www.google.com/sorry/index — "https://www.google.com/search")',
      );
      for (const leaked of ['hosting', 'sca_esv', 'sxsrf', 'APpeQ', '?', '&']) {
        expect(failure).not.toContain(leaked);
      }
    });

    it('strips userinfo and fragment from a URL in the title', async () => {
      const failure = await at('https://user:hunter2@app.example/cb#access_token=zz');
      expect(failure).toBe(
        'Error: navigation refused (page: https://www.google.com/sorry/index — "https://app.example/cb")',
      );
    });

    it('sanitizes a URL embedded in prose in place, keeping the prose', async () => {
      const failure = await at(
        'Redirecting to https://app.example/next?token=abc123, see (//cdn.example/a?x=1) or www.help.example/faq#q',
      );
      expect(failure).toContain(
        '"Redirecting to https://app.example/next, see (//cdn.example/a) or www.help.example/faq"',
      );
      expect(failure).not.toContain('abc123');
      expect(failure).not.toContain('x=1');
    });

    it('leaves a plain-text title unchanged', async () => {
      const failure = await at('Sorry? Unusual traffic from your network #42');
      expect(failure).toBe(
        'Error: navigation refused (page: https://www.google.com/sorry/index — "Sorry? Unusual traffic from your network #42")',
      );
    });

    it('omits a title that, once sanitized, only repeats the location', async () => {
      const failure = await at('https://www.google.com/sorry/index?continue=https://x.example/');
      expect(failure).toBe('Error: navigation refused (page: https://www.google.com/sorry/index)');
    });
  });

  it('stays within the failure-message bound and keeps the location', async () => {
    const adapter = Object.assign(createFakeBrowserAdapter(), {
      pageLocation: () => Promise.resolve({ url: 'https://app.example/here', title: 'T' }),
    });
    adapter.failOn('goto', new Error('y'.repeat(5_000)));
    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
      maxFailureMessageLength: 120,
    });
    const failure = result.steps[0]?.failure ?? '';
    expect(failure.length).toBeLessThanOrEqual(120);
    expect(failure.endsWith(' (page: https://app.example/here — "T")')).toBe(true);
  });

  it('does not throw or wait when the page cannot be read', async () => {
    expect(await failWithLocation(() => Promise.reject(new Error('Target closed')))).toBe(
      'Error: navigation refused',
    );
    expect(
      await failWithLocation(() => {
        throw new Error('crashed');
      }),
    ).toBe('Error: navigation refused');
    expect(await failWithLocation(() => Promise.resolve(null))).toBe('Error: navigation refused');

    const started = Date.now();
    const hung = await failWithLocation(() => new Promise(() => undefined), {
      pageLocationTimeoutMs: 20,
    });
    expect(hung).toBe('Error: navigation refused');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('reads the step end before the location, so the read never lengthens the step', async () => {
    const reporter = createRecordingStepReporter();
    let reads = 0;
    const clock = { now: (): number => (reads += 1) * 10 };
    const adapter = Object.assign(createFakeBrowserAdapter(), {
      pageLocation: () => {
        // Any clock read after this point would be a third reading.
        return Promise.resolve({ url: 'https://app.example/', title: null });
      },
    });
    adapter.failOn('goto', new Error('navigation refused'));
    await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter,
      resolver: createValueResolver({}),
      clock,
    });
    expect(reads).toBe(2);
    expect(reporter.finished[0]?.durationMs).toBe(10);
  });

  it('leaves a passing step untouched and does not read the page', async () => {
    let read = false;
    const adapter = Object.assign(createFakeBrowserAdapter(), {
      pageLocation: () => {
        read = true;
        return Promise.resolve({ url: 'https://app.example/', title: null });
      },
    });
    const result = await executeSteps({
      steps: [gotoStep(0, 'https://a.example/')],
      adapter,
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });
    expect(result.steps[0]?.failure).toBeNull();
    expect(read).toBe(false);
  });
});
