/**
 * AC-1 — the real `BrowserAdapter`, exercised without a browser.
 *
 * The adapter is written against the structural page/locator surface in
 * `src/run/playwrightAdapter.ts`, not against Playwright, so every branch — matcher compilation,
 * locator-chain construction, option mapping, each assertion's polling and timeout behaviour —
 * runs here against a hand-written page. `test/fixtures-tier/` proves the same code against real
 * Chromium (AC-18a); together they are what lets the unit tier stay browser-free (AC-25).
 *
 * The locator chain assertions matter more than they look: the accepted language's chains are the
 * thing the fake-adapter tier of story 10.3 could only record, never resolve.
 */
import { describe, expect, it } from 'vitest';

import { compileMatcher, createPlaywrightAdapter } from '../../src/run/playwrightAdapter.js';
import type { LocatorChain } from '../../src/executor/operations.js';
import { createFakePage } from '../helpers/child.js';
import type { FakePage } from '../helpers/child.js';

function adapterFor(page: FakePage, overrides: Record<string, unknown> = {}) {
  return createPlaywrightAdapter({
    page,
    defaultTimeoutMs: 100,
    pollIntervalMs: 1,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

function chain(...segments: LocatorChain['segments']): LocatorChain {
  return { segments };
}

describe('matchers arrive as data and are compiled here', () => {
  it('keeps a literal a literal', () => {
    expect(compileMatcher({ kind: 'string', value: 'Sign in' })).toBe('Sign in');
  });

  it('compiles {source, flags} into a RegExp', () => {
    const compiled = compileMatcher({ kind: 'pattern', source: '^/dash', flags: 'i' });
    expect(compiled).toBeInstanceOf(RegExp);
    expect((compiled as RegExp).flags).toBe('i');
  });

  it('does not let a global pattern’s lastIndex flip a polled assertion', async () => {
    // A `/g` pattern carries `lastIndex` between `test` calls. Polling with one would alternate
    // between matching and not matching for the same unchanged page.
    const page = createFakePage();
    page.currentTitle = 'Checks — Dashboard';
    const adapter = adapterFor(page);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        adapter.expectTitle({ kind: 'pattern', source: 'Dashboard', flags: 'g' }),
      ).resolves.toBeUndefined();
    }
  });
});

describe('locator chains are built segment by segment', () => {
  it('applies each segment to the previous locator', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    const handle = await adapter.locate(
      chain(
        { kind: 'getByRole', role: 'row', options: { name: { kind: 'literal', value: 'Alice' } } },
        { kind: 'getByText', text: { kind: 'literal', value: 'Edit' }, options: { exact: true } },
      ),
    );
    await adapter.click(handle);

    expect(page.calls.map((call) => call.method)).toEqual([
      'getByRole',
      'getByText',
      'page.getByRole(row,{"name":"Alice"}).getByText(Edit,{"exact":true}).click',
    ]);
  });

  it('resolves a CSS selector segment, which the fake-adapter tier could not', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    await adapter.locate(chain({ kind: 'locator', selector: '.toolbar button.primary' }));
    expect(page.calls[0]).toMatchObject({ method: 'locator', args: ['.toolbar button.primary'] });
  });

  it('passes every permitted getByRole state through', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    await adapter.locate(
      chain({
        kind: 'getByRole',
        role: 'checkbox',
        options: {
          name: { kind: 'literal', value: 'Ship it' },
          exact: true,
          checked: false,
          disabled: false,
          expanded: true,
          selected: false,
          pressed: true,
          level: 2,
        },
      }),
    );
    expect(page.calls[0]?.args[1]).toEqual({
      name: 'Ship it',
      exact: true,
      checked: false,
      disabled: false,
      expanded: true,
      selected: false,
      pressed: true,
      level: 2,
    });
  });

  it('resolves a declared variable inside a locator, and refuses when none can be', async () => {
    const page = createFakePage();
    const resolved = adapterFor(page, { resolveVariable: (name: string) => `value-of-${name}` });
    await resolved.locate(chain({ kind: 'getByText', text: { kind: 'variable', name: 'LABEL' } }));
    expect(page.calls[0]?.args[0]).toBe('value-of-LABEL');

    const unresolved = adapterFor(createFakePage());
    await expect(
      unresolved.locate(chain({ kind: 'getByLabel', text: { kind: 'variable', name: 'LABEL' } })),
    ).rejects.toThrow(/cannot be resolved/u);
  });

  it('compiles a regular expression used as a locator argument', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    await adapter.locate(
      chain({ kind: 'getByPlaceholder', text: { kind: 'regex', source: 'user.*', flags: 'i' } }),
    );
    expect(page.calls[0]?.args[0]).toBe('/user.*/i');
  });

  it('refuses a handle it did not produce', async () => {
    const adapter = adapterFor(createFakePage());
    await expect(adapter.click({ kind: 'locator-handle' })).rejects.toThrow(
      /was not produced by this adapter/u,
    );
  });
});

describe('actions map the permitted options, and nothing else', () => {
  it('passes every click option through', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'button' }));
    await adapter.click(handle, {
      button: 'right',
      clickCount: 2,
      delay: 10,
      force: true,
      trial: false,
      timeout: 5_000,
    });
    expect(page.calls.at(-1)?.args[0]).toEqual({
      button: 'right',
      clickCount: 2,
      delay: 10,
      force: true,
      trial: false,
      timeout: 5_000,
    });
  });

  it('falls back to the configured default timeout, not a library default', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'input' }));
    await adapter.fill(handle, 'value');
    expect(page.calls.at(-1)?.args[1]).toMatchObject({ timeout: 100 });
  });

  it('refuses trial mode defensively because it would report PASS without doing the action', async () => {
    const adapter = adapterFor(createFakePage());
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'button' }));
    await expect(adapter.click(handle, { trial: true })).rejects.toThrow(/skip the requested action/u);
    await expect(adapter.check(handle, { trial: true })).rejects.toThrow(/skip the requested action/u);
    await expect(adapter.hover(handle, { trial: true })).rejects.toThrow(/skip the requested action/u);
  });

  it.each([
    ['press', async (a: ReturnType<typeof adapterFor>, h: { kind: 'locator-handle' }) => a.press(h, 'Control+a')],
    ['check', async (a: ReturnType<typeof adapterFor>, h: { kind: 'locator-handle' }) => a.check(h)],
    ['uncheck', async (a: ReturnType<typeof adapterFor>, h: { kind: 'locator-handle' }) => a.uncheck(h)],
    ['hover', async (a: ReturnType<typeof adapterFor>, h: { kind: 'locator-handle' }) => a.hover(h)],
    [
      'selectOption',
      async (a: ReturnType<typeof adapterFor>, h: { kind: 'locator-handle' }) => a.selectOption(h, 'EU'),
    ],
  ] as const)('drives %s', async (method, call) => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#x' }));
    await call(adapter, handle as { kind: 'locator-handle' });
    expect(page.calls.at(-1)?.method).toContain(method);
  });

  it('navigates with the permitted goto options', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    await adapter.goto('http://127.0.0.1:8123/login', { waitUntil: 'domcontentloaded', timeout: 9 });
    expect(page.calls[0]).toEqual({
      method: 'goto',
      args: ['http://127.0.0.1:8123/login', { waitUntil: 'domcontentloaded', timeout: 9 }],
    });
  });

  it('waits for a URL matcher', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    await adapter.waitForURL({ kind: 'pattern', source: '/dash', flags: '' });
    // The compiled pattern, not the raw source: `new RegExp('/dash')` escapes the leading slash.
    expect(page.calls[0]?.args[0]).toBe('/\\/dash/');
  });
});

describe('assertions poll the live page, and fail with a bounded message', () => {
  it('passes when the condition already holds, without sleeping', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#x' }));
    await expect(
      adapter.expectContainText(handle, { kind: 'string', value: 'hello' }),
    ).resolves.toBeUndefined();
  });

  it('honours ignoreCase and useInnerText on toContainText', async () => {
    const page = createFakePage();
    page.text = 'HELLO WORLD';
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#x' }));
    await expect(
      adapter.expectContainText(handle, { kind: 'string', value: 'hello' }, { ignoreCase: true }),
    ).resolves.toBeUndefined();
    await expect(
      adapter.expectContainText(
        handle,
        { kind: 'string', value: 'HELLO' },
        { useInnerText: true },
      ),
    ).resolves.toBeUndefined();
  });

  it('fails a text assertion with the matcher and a truncated actual', async () => {
    const page = createFakePage();
    page.text = 'x'.repeat(400);
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#x' }));
    await expect(
      adapter.expectContainText(handle, { kind: 'string', value: 'nowhere' }),
    ).rejects.toThrow(/AssertionFailed: text content to contain expected "nowhere", last seen/u);
  });

  it('compares an input value exactly, and a pattern by match', async () => {
    const page = createFakePage();
    page.value = 'alice@example.test';
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'input' }));
    await expect(
      adapter.expectValue(handle, { kind: 'string', value: 'alice@example.test' }),
    ).resolves.toBeUndefined();
    await expect(
      adapter.expectValue(handle, { kind: 'pattern', source: '@example', flags: '' }),
    ).resolves.toBeUndefined();
    await expect(adapter.expectValue(handle, { kind: 'string', value: 'alice' })).rejects.toThrow(
      /input value to be/u,
    );
  });

  it('checks the page URL, with ignoreCase', async () => {
    const page = createFakePage();
    page.currentUrl = 'http://127.0.0.1:8123/Dashboard';
    const adapter = adapterFor(page);
    await expect(
      adapter.expectUrl(
        { kind: 'string', value: 'http://127.0.0.1:8123/dashboard' },
        { ignoreCase: true },
      ),
    ).resolves.toBeUndefined();
    await expect(
      adapter.expectUrl({ kind: 'string', value: 'http://127.0.0.1:8123/dashboard' }),
    ).rejects.toThrow(/the page URL to be/u);
  });

  it('waits for visibility and reports a timeout as an assertion failure', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#x' }));
    await expect(adapter.expectVisible(handle, { timeout: 7 })).resolves.toBeUndefined();

    page.neverVisible = true;
    await expect(adapter.expectVisible(handle, { timeout: 7 })).rejects.toThrow(
      /expected the locator to be visible within 7ms/u,
    );
  });

  it('treats a read that throws as a not-yet until the deadline', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page);
    page.failOn('title', new Error('TargetClosedError'));
    // The first read throws; the second succeeds, and the assertion passes without waiting out
    // the whole timeout.
    page.currentTitle = 'Checks — Home';
    await expect(
      adapter.expectTitle({ kind: 'string', value: 'Checks — Home' }),
    ).resolves.toBeUndefined();
  });
});

describe('AC-15 — the guard refuses every operation once the run is unsupported', () => {
  it('refuses before touching the page', async () => {
    const page = createFakePage();
    let unsupported = false;
    const adapter = adapterFor(page, { guard: () => (unsupported ? 'UnsupportedWorkflow: popup' : null) });
    await adapter.goto('http://127.0.0.1:8123/');
    unsupported = true;
    await expect(adapter.goto('http://127.0.0.1:8123/next')).rejects.toThrow(/UnsupportedWorkflow/u);
    await expect(adapter.locate(chain({ kind: 'locator', selector: '#x' }))).rejects.toThrow(
      /UnsupportedWorkflow/u,
    );
    // One navigation only: nothing was driven after the popup appeared.
    expect(page.calls.filter((call) => call.method === 'goto')).toHaveLength(1);
  });

  it('interrupts a polling assertion too', async () => {
    const page = createFakePage();
    page.text = 'nothing that matches';
    let unsupported = false;
    const adapter = adapterFor(page, {
      guard: () => (unsupported ? 'UnsupportedWorkflow: popup' : null),
      sleep: () => {
        unsupported = true;
        return Promise.resolve();
      },
    });
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#x' }));
    await expect(
      adapter.expectContainText(handle, { kind: 'string', value: 'nowhere' }, { timeout: 1_000 }),
    ).rejects.toThrow(/UnsupportedWorkflow/u);
  });
});

describe('a secret is filled only on an origin it is bound to', () => {
  const SECRET = 'secret-origin-canary';

  async function fillSecret(
    currentUrl: string,
    secretOrigins: Record<string, string[]> | undefined,
  ): Promise<{ page: FakePage; attempt: Promise<void> }> {
    const page = createFakePage();
    page.currentUrl = currentUrl;
    const adapter = adapterFor(page, secretOrigins === undefined ? {} : { secretOrigins });
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#pw' }));
    return { page, attempt: adapter.fill(handle, SECRET, undefined, 'LOGIN_PW') };
  }

  const fills = (page: FakePage) => page.calls.filter((call) => call.method.endsWith('fill'));

  it('fills when the page origin is listed for the secret', async () => {
    const { page, attempt } = await fillSecret('https://login.app.example/signin?x=1', {
      LOGIN_PW: ['https://other.example', 'https://login.app.example'],
    });
    await attempt;
    expect(fills(page)).toHaveLength(1);
  });

  it.each([
    ['a different host', 'https://evil.example/signin'],
    ['a different scheme', 'http://login.app.example/signin'],
    ['a different port', 'https://login.app.example:8443/signin'],
    ['about:blank', 'about:blank'],
  ])('refuses %s with SECRET_ORIGIN_NOT_ALLOWED and types nothing', async (_label, url) => {
    const { page, attempt } = await fillSecret(url, { LOGIN_PW: ['https://login.app.example'] });
    const error = await attempt.then(
      () => null,
      (rejection: unknown) => rejection,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('SECRET_ORIGIN_NOT_ALLOWED');
    expect((error as Error).message).toContain('"LOGIN_PW"');
    expect((error as Error).message).not.toContain(SECRET);
    expect((error as Error).message).not.toContain(url);
    expect(fills(page)).toHaveLength(0);
  });

  it.each([
    ['no secretOrigins at all', undefined],
    ['no entry for the secret', { OTHER: ['https://login.app.example'] }],
    ['an empty list', { LOGIN_PW: [] }],
  ])('fails closed with %s', async (_label, secretOrigins) => {
    const { page, attempt } = await fillSecret('https://login.app.example/', secretOrigins);
    await expect(attempt).rejects.toThrow(/Secret "LOGIN_PW" is not bound/u);
    expect(fills(page)).toHaveLength(0);
  });

  it('leaves a non-secret fill unchecked', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://anywhere.example/';
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#user' }));
    await adapter.fill(handle, 'alice');
    expect(fills(page)).toHaveLength(1);
  });
});
