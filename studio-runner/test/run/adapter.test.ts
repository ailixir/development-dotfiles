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

import {
  compileMatcher,
  createPlaywrightAdapter,
  describeActionFailure,
  describeNavigationFailure,
} from '../../src/run/playwrightAdapter.js';
import { createValueResolver, executeSteps } from '../../src/executor/executor.js';
import { createFakeClock, createRecordingStepReporter } from '../helpers/fakeAdapters.js';
import type { LocatorChain } from '../../src/executor/operations.js';
import { VISIBLE_SUFFIX, createFakeLocator, createFakePage } from '../helpers/child.js';
import type { FakePage } from '../helpers/child.js';
import type { LocatorLike } from '../../src/run/playwrightAdapter.js';

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
      // VAL-040: an action acts on the visible matches only; the narrowing is not a segment.
      'page.getByRole(row,{"name":"Alice"}).getByText(Edit,{"exact":true}).filter(visible).click',
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
      timeout: 5_000,
    });
    expect(page.calls.at(-1)?.args[0]).toEqual({
      button: 'right',
      clickCount: 2,
      delay: 10,
      force: true,
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
    await expect(adapter.click(handle, { trial: true } as never)).rejects.toThrow(/skip the requested action/u);
    await expect(adapter.check(handle, { trial: true } as never)).rejects.toThrow(/skip the requested action/u);
    await expect(adapter.hover(handle, { trial: true } as never)).rejects.toThrow(/skip the requested action/u);
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

describe('VAL-011 — a timed-out assertion says what it last read, or why it read nothing', () => {
  function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  /** A page whose `#x` locator rejects every text/value read with `error`. */
  function pageWhoseReadsFail(error: Error): FakePage {
    const page = createFakePage();
    page.locator = (selector: string) => ({
      ...createFakeLocator(page, page.calls, `page.locator(${selector})`),
      textContent: () => Promise.reject(error),
      innerText: () => Promise.reject(error),
      inputValue: () => Promise.reject(error),
    });
    return page;
  }

  it('says no element matched when every read timed out, and never files the error name as text', async () => {
    const page = pageWhoseReadsFail(namedError('TimeoutError', 'locator.textContent: Timeout 30ms'));
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'h1' }));
    const failure = adapter.expectContainText(
      handle,
      { kind: 'string', value: 'Example Domain' },
      { timeout: 30 },
    );
    await expect(failure).rejects.toThrow(
      'AssertionFailed: text content to contain expected "Example Domain", ' +
        'no element matched the locator within 30ms.',
    );
    await expect(failure).rejects.not.toThrow(/last seen/u);
  });

  it('names a strict-mode violation without quoting what it matched', async () => {
    const page = pageWhoseReadsFail(
      namedError('Error', "strict mode violation: getByRole('heading') resolved to 2 elements: secret text"),
    );
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'h1' }));
    const failure = adapter.expectValue(handle, { kind: 'string', value: 'v' }, { timeout: 30 });
    await expect(failure).rejects.toThrow(
      'AssertionFailed: input value to be expected "v", the locator matched more than one element within 30ms.',
    );
    await expect(failure).rejects.not.toThrow(/secret text/u);
  });

  it('keeps the error name, not the message, for any other read failure', async () => {
    const page = pageWhoseReadsFail(namedError('TargetClosedError', 'page closed while reading body text'));
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'h1' }));
    await expect(
      adapter.expectContainText(handle, { kind: 'string', value: 'x' }, { timeout: 30 }),
    ).rejects.toThrow(/no reading could be taken within 30ms \(TargetClosedError\)\.$/u);
  });

  it('keeps "last seen" with the text when text was read', async () => {
    const page = createFakePage();
    page.text = 'Something else';
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: 'h1' }));
    await expect(
      adapter.expectContainText(handle, { kind: 'string', value: 'Example Domain' }, { timeout: 30 }),
    ).rejects.toThrow(
      'AssertionFailed: text content to contain expected "Example Domain", last seen "Something else" after 30ms.',
    );
  });

  it('does not describe a page-level reading as a locator that matched nothing', async () => {
    const page = createFakePage();
    page.title = () => Promise.reject(namedError('TimeoutError', 'title'));
    const adapter = adapterFor(page);
    await expect(
      adapter.expectTitle({ kind: 'string', value: 'T' }, { timeout: 30 }),
    ).rejects.toThrow(/no reading could be taken within 30ms \(TimeoutError\)\.$/u);
  });
});

describe('VAL-028 — a failed action says what went wrong, never what the page contains', () => {
  function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  // Verbatim from live runs (already whitespace-collapsed as they were printed).
  const WIKIPEDIA =
    "locator.fill: Error: strict mode violation: getByPlaceholder('Search Wikipedia') resolved to 2 elements: " +
    '1) <input type="search" name="search" accesskey="f" id="searchInput" autocomplete="off" ' +
    'spellcheck="false" autocapitalize="none" aria-label="Search Wikipedia" ' +
    'placeholder="Search Wikipedia" title="Searc…';
  const GOOGLE =
    "locator.fill: Error: strict mode violation: getByLabel('Search') resolved to 6 elements: " +
    '1) <a class="gb_6" ... aria-label="Search for Images " ...';

  /** A fake locator whose actions fail, and whose visible-only narrowing (VAL-040) is itself. */
  function rejecting(base: LocatorLike, overrides: Partial<LocatorLike>): LocatorLike {
    const locator: LocatorLike = { ...base, ...overrides, filter: () => locator };
    return locator;
  }

  function expectNoMarkup(message: string): void {
    expect(message).not.toContain('<');
    expect(message).not.toMatch(/=["']|aria-label|placeholder=|class=|searchInput|gb_6/u);
  }

  it('maps the live Wikipedia strict-mode violation to a count, with no markup', () => {
    const message = describeActionFailure('fill', namedError('Error', WIKIPEDIA), 30_000);
    expect(message).toBe(
      'fill failed: the locator matched 2 elements; make the step more specific.',
    );
    expectNoMarkup(message);
  });

  it('maps the live Google strict-mode violation to a count, with no markup', () => {
    const message = describeActionFailure('fill', namedError('Error', GOOGLE), 30_000);
    expect(message).toBe(
      'fill failed: the locator matched 6 elements; make the step more specific.',
    );
    expectNoMarkup(message);
  });

  it('takes the count from the genuine head even when the listed markup repeats the phrase', () => {
    const message = describeActionFailure(
      'click',
      namedError(
        'Error',
        "locator.click: Error: strict mode violation: getByRole('button') resolved to 3 elements:\n" +
          '    1) <button title="resolved to 99 elements">Go</button> aka getByRole(…)\n    ...\n',
      ),
      100,
    );
    expect(message).toBe(
      'click failed: the locator matched 3 elements; make the step more specific.',
    );
  });

  it('says no element matched when a timeout never resolved the locator', () => {
    const message = describeActionFailure(
      'click',
      namedError(
        'TimeoutError',
        'locator.click: Timeout 5000ms exceeded.\nCall log:\n' +
          "  - waiting for getByRole('button', { name: 'Sign in' })\n",
      ),
      5000,
    );
    expect(message).toBe('click failed: no element matched the locator within 5000ms.');
  });

  it.each([
    ['visible', 'the element was not visible'],
    ['enabled', 'the element was not enabled'],
    ['editable', 'the element was not editable'],
    ['stable', 'the element did not stop moving'],
  ])('names a timeout on "element is not %s" with a fixed phrase', (state, phrase) => {
    const message = describeActionFailure(
      'fill',
      namedError(
        'TimeoutError',
        'locator.fill: Timeout 250ms exceeded.\nCall log:\n' +
          "  - waiting for locator('#q')\n" +
          '  -   locator resolved to <input id="q" value="private"/>\n' +
          '  - attempting fill action\n' +
          `  -   element is not ${state}\n` +
          '  - retrying fill action\n',
      ),
      250,
    );
    expect(message).toBe(`fill failed: ${phrase} within 250ms.`);
    expectNoMarkup(message);
  });

  // VAL-041: "detached" only when the element kept detaching; a locator that matched nothing
  // again after one detach must not be reported as a detach that hid a re-render.
  it('names repeated detaching as detached, including collapsed call-log lines', () => {
    for (const again of ['  -   locator resolved to <a href="/x">x</a>\n', '  - 3 × locator resolved to <a>x</a>\n']) {
      const message = describeActionFailure(
        'press',
        namedError(
          'TimeoutError',
          'locator.press: Timeout 100ms exceeded.\nCall log:\n' +
            '  -   locator resolved to <a href="/x">x</a>\n' +
            '  -   element was detached from the DOM, retrying\n' +
            again +
            '  -   element was detached from the DOM, retrying\n',
        ),
        100,
      );
      expect(message).toBe('press failed: the element was detached from the page within 100ms.');
      expectNoMarkup(message);
    }
  });

  it('names a detached element, and an element covered by another', () => {
    const detached = describeActionFailure(
      'click',
      namedError(
        'TimeoutError',
        'locator.click: Timeout 100ms exceeded.\nCall log:\n' +
          '  -   locator resolved to <a href="/x">x</a>\n' +
          '  -   element was detached from the DOM, retrying\n',
      ),
      100,
    );
    expect(detached).toBe(
      'click failed: the element was detached from the page and no element matched the locator ' +
        'again within 100ms.',
    );
    const covered = describeActionFailure(
      'click',
      namedError(
        'TimeoutError',
        'locator.click: Timeout 100ms exceeded.\nCall log:\n' +
          '  -   locator resolved to <a href="/x">x</a>\n' +
          '  -   <div class="overlay">secret</div> intercepts pointer events\n',
      ),
      100,
    );
    expect(covered).toBe('click failed: another element was covering it within 100ms.');
  });

  it('does not take a phrase from a markup line, and says the element matched but was not usable', () => {
    const message = describeActionFailure(
      'hover',
      namedError(
        'TimeoutError',
        'locator.hover: Timeout 100ms exceeded.\nCall log:\n' +
          '  -   locator resolved to <p>element is not visible</p>\n',
      ),
      100,
    );
    expect(message).toBe('hover failed: an element matched but could not be acted on within 100ms.');
  });

  it.each([
    ['locator.fill: Error: Element is not an <input>, <textarea> or [contenteditable] element', 'the element is not editable.'],
    ['locator.selectOption: Error: Element is not a <select> element', 'the element is not a select.'],
    ['locator.click: Error: Element is not attached to the DOM', 'the element was detached from the page.'],
    ['locator.click: Error: Element is not visible', 'the element is not visible.'],
    ['locator.click: Target page, context or browser has been closed', 'the page was closed.'],
  ])('maps the immediate refusal %j to a fixed phrase', (raw, phrase) => {
    const message = describeActionFailure('click', namedError('Error', raw), 100);
    expect(message).toBe(`click failed: ${phrase}`);
    expect(message).not.toContain('<');
  });

  it('keeps only the error name for anything else', () => {
    expect(
      describeActionFailure('press', namedError('Error', 'locator.press: Unknown key: "<b>x</b>"'), 1),
    ).toBe('press failed (Error).');
    expect(describeActionFailure('press', namedError('<img src=x>', 'boom'), 1)).toBe(
      'press failed (Error).',
    );
    expect(describeActionFailure('press', 'not an error', 1)).toBe('press failed (unknown).');
  });

  it('replaces the Playwright error on every locator action, using the action’s timeout', async () => {
    const strict = namedError('Error', WIKIPEDIA);
    const page = createFakePage();
    page.locator = (selector: string) =>
      rejecting(createFakeLocator(page, page.calls, `page.locator(${selector})`), {
        click: () => Promise.reject(strict),
        fill: () => Promise.reject(strict),
        press: () => Promise.reject(strict),
        check: () => Promise.reject(strict),
        uncheck: () => Promise.reject(strict),
        hover: () => Promise.reject(strict),
        selectOption: () => Promise.reject(namedError('TimeoutError', 'Timeout 9ms exceeded.')),
      });
    const adapter = adapterFor(page);
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#q' }));
    const tail = 'failed: the locator matched 2 elements; make the step more specific.';
    await expect(adapter.click(handle)).rejects.toThrow(`click ${tail}`);
    await expect(adapter.fill(handle, 'v')).rejects.toThrow(`fill ${tail}`);
    await expect(adapter.press(handle, 'Enter')).rejects.toThrow(`press ${tail}`);
    await expect(adapter.check(handle)).rejects.toThrow(`check ${tail}`);
    await expect(adapter.uncheck(handle)).rejects.toThrow(`uncheck ${tail}`);
    await expect(adapter.hover(handle)).rejects.toThrow(`hover ${tail}`);
    await expect(adapter.selectOption(handle, 'a', { timeout: 9 })).rejects.toThrow(
      'selectOption failed: no element matched the locator within 9ms.',
    );
  });

  it('leaves the runner’s own refusals unmapped', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page, { secretOrigins: {} });
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#pw' }));
    await expect(adapter.fill(handle, 'x', undefined, 'PW')).rejects.toThrow(
      /^Secret "PW" is not bound to the current page origin/u,
    );
  });

  it('keeps the page suffix and the length bound through the executor', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://en.wikipedia.org/wiki/Main_Page?search=x';
    page.currentTitle = 'Wikipedia, the free encyclopedia';
    page.locator = (selector: string) =>
      rejecting(createFakeLocator(page, page.calls, `page.locator(${selector})`), {
        fill: () => Promise.reject(namedError('Error', WIKIPEDIA)),
      });
    const run = (maxFailureMessageLength?: number) =>
      executeSteps({
        steps: [
          {
            stepIndex: 0,
            operations: [
              {
                op: 'fill',
                locator: { segments: [{ kind: 'locator', selector: '#q' }] },
                value: { kind: 'literal', value: 'Ada' },
              },
            ],
          },
        ],
        adapter: adapterFor(page),
        reporter: createRecordingStepReporter(),
        resolver: createValueResolver({}),
        clock: createFakeClock(),
        maxFailureMessageLength,
      });
    const result = await run();
    expect(result.steps[0]?.failure).toBe(
      'Error: fill failed: the locator matched 2 elements; make the step more specific. ' +
        '(page: https://en.wikipedia.org/wiki/Main_Page — "Wikipedia, the free encyclopedia")',
    );
    const bounded = (await run(80)).steps[0]?.failure ?? '';
    expect(bounded.length).toBeLessThanOrEqual(80);
    expect(bounded).not.toContain('<');
  });
});

describe('VAL-029 — a failed navigation never echoes a URL from the error', () => {
  function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }
  const URL_WITH_SECRETS = 'https://user:pw@app.example/login?token=abc#frag';
  const LEAKS = ['token=abc', '#frag', 'user:pw@', 'user', 'abc', 'app.example', 'https://'];

  function expectNoUrl(message: string): void {
    for (const leak of LEAKS) expect(message).not.toContain(leak);
  }

  it('maps a goto timeout, whose call log names the URL, to a fixed phrase', () => {
    const message = describeNavigationFailure(
      'goto',
      namedError(
        'TimeoutError',
        'page.goto: Timeout 30000ms exceeded.\nCall log:\n' +
          `  - navigating to "${URL_WITH_SECRETS}", waiting until "load"\n`,
      ),
      30_000,
    );
    expect(message).toBe('goto failed: the page did not load within 30000ms.');
    expectNoUrl(message);
  });

  it('keeps a net::ERR code and drops the URL after it', () => {
    const message = describeNavigationFailure(
      'goto',
      namedError(
        'Error',
        `page.goto: net::ERR_NAME_NOT_RESOLVED at ${URL_WITH_SECRETS}\nCall log:\n` +
          `  - navigating to "${URL_WITH_SECRETS}", waiting until "load"\n`,
      ),
      30_000,
    );
    expect(message).toBe(
      'goto failed: the address could not be reached (net::ERR_NAME_NOT_RESOLVED).',
    );
    expectNoUrl(message);
  });

  it('drops a net::ERR-looking token that is not a closed code', () => {
    const message = describeNavigationFailure(
      'goto',
      namedError('Error', `page.goto: net::ERR_X?token=abc#frag at ${URL_WITH_SECRETS}`),
      1,
    );
    expect(message).toBe('goto failed (Error).');
    expectNoUrl(message);
  });

  it('maps a waitForURL timeout, whose call log names the expected URL', () => {
    const message = describeNavigationFailure(
      'waitForURL',
      namedError(
        'TimeoutError',
        'page.waitForURL: Timeout 5000ms exceeded.\n=========================== logs ' +
          `===========================\nwaiting for navigation to "${URL_WITH_SECRETS}" until "load"\n` +
          `  navigated to "${URL_WITH_SECRETS}"\n`,
      ),
      5000,
    );
    expect(message).toBe('waitForURL failed: the page address did not match within 5000ms.');
    expectNoUrl(message);
  });

  it.each([
    [
      `page.goto: Navigation to "${URL_WITH_SECRETS}" is interrupted by another navigation to "${URL_WITH_SECRETS}"`,
      'goto failed: the navigation was interrupted by another navigation.',
    ],
    [
      `page.goto: Cannot navigate to invalid URL\nCall log:\n  - navigating to "${URL_WITH_SECRETS}"`,
      'goto failed: the address is not a valid URL.',
    ],
    [
      'page.goto: Target page, context or browser has been closed',
      'goto failed: the page was closed.',
    ],
    [`page.goto: NS_ERROR_UNKNOWN_HOST at ${URL_WITH_SECRETS}`, 'goto failed (Error).'],
  ])('maps %j to a fixed phrase', (raw, expected) => {
    const message = describeNavigationFailure('goto', namedError('Error', raw), 1);
    expect(message).toBe(expected);
    expectNoUrl(message);
  });

  it('replaces the Playwright error on goto and waitForURL, using the operation’s timeout', async () => {
    const page = createFakePage();
    page.failOn(
      'goto',
      namedError('Error', `page.goto: net::ERR_CONNECTION_REFUSED at ${URL_WITH_SECRETS}`),
    );
    page.failOn(
      'waitForURL',
      namedError('TimeoutError', `page.waitForURL: Timeout 7ms exceeded. ${URL_WITH_SECRETS}`),
    );
    const adapter = adapterFor(page);
    await expect(adapter.goto(URL_WITH_SECRETS)).rejects.toThrow(
      /^goto failed: the address could not be reached \(net::ERR_CONNECTION_REFUSED\)\.$/u,
    );
    await expect(
      adapter.waitForURL({ kind: 'string', value: URL_WITH_SECRETS }, { timeout: 7 }),
    ).rejects.toThrow(/^waitForURL failed: the page address did not match within 7ms\.$/u);
  });

  it('keeps the page suffix (origin + path only) through the executor', async () => {
    const page = createFakePage();
    page.currentUrl = URL_WITH_SECRETS;
    page.currentTitle = 'Sign in';
    page.failOn(
      'goto',
      namedError(
        'TimeoutError',
        `page.goto: Timeout 30ms exceeded.\nCall log:\n  - navigating to "${URL_WITH_SECRETS}"\n`,
      ),
    );
    const result = await executeSteps({
      steps: [
        {
          stepIndex: 0,
          operations: [
            { op: 'goto', url: { kind: 'literal', value: URL_WITH_SECRETS }, options: { timeout: 30 } },
          ],
        },
      ],
      adapter: adapterFor(page),
      reporter: createRecordingStepReporter(),
      resolver: createValueResolver({}),
      clock: createFakeClock(),
    });
    const failure = result.steps[0]?.failure ?? '';
    expect(failure).toBe(
      'Error: goto failed: the page did not load within 30ms. ' +
        '(page: https://app.example/login — "Sign in")',
    );
    for (const leak of ['token=abc', '#frag', 'user:pw@']) expect(failure).not.toContain(leak);
  });
});

describe('VAL-013 — the adapter reads where the page is, raw, and only while the run is live', () => {
  it('returns the URL and the title as read', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://www.google.com/sorry/index?continue=x';
    page.currentTitle = 'Unusual traffic';
    const adapter = adapterFor(page);
    await expect(adapter.pageLocation?.()).resolves.toEqual({
      url: 'https://www.google.com/sorry/index?continue=x',
      title: 'Unusual traffic',
    });
  });

  it('keeps the URL when the title cannot be read', async () => {
    const page = createFakePage();
    page.failOn('title', new Error('Target crashed'));
    const adapter = adapterFor(page);
    await expect(adapter.pageLocation?.()).resolves.toEqual({ url: 'http://127.0.0.1/', title: null });
  });

  it('reads nothing once the guard has stopped the run', async () => {
    const page = createFakePage();
    const adapter = adapterFor(page, { guard: () => 'Stopping' });
    await expect(adapter.pageLocation?.()).resolves.toBeNull();
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

  // 10.44 gate S-1: the origin is checked again against the element the value is typed into.
  it('refuses when the page navigates off the bound origin while the fill waits', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://login.app.example/';
    // The target is found only after the page has moved to another origin.
    page.countOf = () => {
      page.currentUrl = 'https://evil.example/capture';
      return 1;
    };
    const adapter = adapterFor(page, { secretOrigins: { LOGIN_PW: ['https://login.app.example'] } });
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#pw' }));
    const attempt = adapter.fill(handle, SECRET, undefined, 'LOGIN_PW');
    await expect(attempt).rejects.toMatchObject({ name: 'SECRET_ORIGIN_NOT_ALLOWED' });
    await expect(attempt).rejects.not.toThrow(SECRET);
    expect(fills(page)).toHaveLength(0);
    expect(page.calls.some((call) => call.method.endsWith('elementHandle.dispose'))).toBe(true);
  });

  it.each([
    ['another origin', 'https://evil.example/'],
    ['a detached document', null],
  ])('refuses when the pinned element sits in %s', async (_label, frameUrl) => {
    const page = createFakePage();
    page.currentUrl = 'https://login.app.example/';
    page.elementFrameUrl = frameUrl;
    const adapter = adapterFor(page, { secretOrigins: { LOGIN_PW: ['https://login.app.example'] } });
    const handle = await adapter.locate(chain({ kind: 'locator', selector: '#pw' }));
    await expect(adapter.fill(handle, SECRET, undefined, 'LOGIN_PW')).rejects.toMatchObject({
      name: 'SECRET_ORIGIN_NOT_ALLOWED',
    });
    expect(fills(page)).toHaveLength(0);
  });

  it('types the secret into the pinned element, never through the re-resolving locator', async () => {
    const { page, attempt } = await fillSecret('https://login.app.example/', {
      LOGIN_PW: ['https://login.app.example'],
    });
    await attempt;
    const methods = fills(page).map((call) => call.method);
    expect(methods).toHaveLength(1);
    expect(methods[0]).toMatch(/\.elementHandle\.fill$/u);
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

describe('assertion semantics v2', () => {
  it.each([
    ['', undefined, false], ['i', undefined, true], ['', true, true],
    ['i', true, true], ['i', false, false], ['', false, false],
  ] as const)('regex flags=%s ignoreCase=%s', async (flags, ignoreCase, passes) => {
    const page = createFakePage();
    page.text = 'HELLO';
    page.currentUrl = 'https://fixture.example/HELLO';
    let instant = 0;
    const adapter = adapterFor(page, { defaultTimeoutMs: 100, now: () => instant,
      sleep: (ms: number) => { instant += ms; return Promise.resolve(); } });
    const target = await adapter.locate(chain({ kind: 'locator', selector: '#text' }));
    const matcher = { kind: 'pattern' as const, source: 'hello', flags };
    const text = adapter.expectContainText(target, matcher, { ignoreCase });
    if (passes) await expect(text).resolves.toBeUndefined();
    else await expect(text).rejects.toThrow('AssertionFailed');
    const url = adapter.expectUrl(matcher, { ignoreCase });
    if (passes) await expect(url).resolves.toBeUndefined();
    else await expect(url).rejects.toThrow('AssertionFailed');
  });

  it('normalizes text and title strings on both sides, leaving regex and input literal', async () => {
    const page = createFakePage();
    page.text = '  Hello\n\t WORLD\u200b\u00ad  ';
    page.currentTitle = page.text;
    page.value = page.text;
    let instant = 0;
    const adapter = adapterFor(page, { defaultTimeoutMs: 100, now: () => instant,
      sleep: (ms: number) => { instant += ms; return Promise.resolve(); } });
    const target = await adapter.locate(chain({ kind: 'locator', selector: '#text' }));
    const matcher = { kind: 'string' as const, value: ' Hello\t WORLD ' };
    await expect(adapter.expectContainText(target, matcher)).resolves.toBeUndefined();
    await expect(adapter.expectTitle(matcher)).resolves.toBeUndefined();
    await expect(adapter.expectValue(target, matcher)).rejects.toThrow('AssertionFailed');
    await expect(adapter.expectTitle({ kind: 'pattern', source: 'Hello WORLD', flags: '' })).rejects.toThrow('AssertionFailed');
  });

  it('canonicalizes URL strings without supplying a base URL', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://fixture.example/AbC';
    let instant = 0;
    const adapter = adapterFor(page, { defaultTimeoutMs: 100, now: () => instant,
      sleep: (ms: number) => { instant += ms; return Promise.resolve(); } });
    await expect(adapter.expectUrl({ kind: 'string', value: ' HTTPS://FIXTURE.EXAMPLE:443/AbC ' })).resolves.toBeUndefined();
    await expect(adapter.expectUrl({ kind: 'string', value: '/AbC' })).rejects.toThrow('AssertionFailed');
  });
});

/**
 * VAL-031 ruling §4 — text-entry role equivalence (executor 2.1.0).
 *
 * A terminal `getByRole` on `textbox`/`searchbox`/`combobox`, for `fill`/`press` only: the
 * authored role first and always; the other two only after it has matched nothing for
 * `min(2 s, timeout/4)`, and only when exactly one element matches them.
 */
describe('VAL-031 — text-entry role equivalence on fill and press', () => {
  const SEARCHBOX = 'page.getByRole(searchbox,{})';
  const TEXTBOX = 'page.getByRole(textbox,{})';
  const COMBOBOX = 'page.getByRole(combobox,{})';
  const UNION = `${TEXTBOX}.or(${COMBOBOX})`;
  /** Since VAL-040 every action counts and acts on the visible matches only. */
  const V = (path: string) => `${path}${VISIBLE_SUFFIX}`;
  /**
   * Since VAL-041 a matched authored role is acted on together with its visible alternates, gated
   * on the page having no visible authored match left (a re-render that swaps the role).
   */
  const GATED = (authored: string, union: string) =>
    `${V(authored)}.or(page.locator(:root,{hasNot:${V(authored)}}).locator(${V(union)}))`;

  /** A clock that only moves when the adapter sleeps, so the settle window is exact. */
  function timedAdapter(page: FakePage, overrides: Record<string, unknown> = {}) {
    let t = 0;
    const equivalences: [string, string][] = [];
    const adapter = adapterFor(page, {
      defaultTimeoutMs: 1_000,
      pollIntervalMs: 50,
      now: () => t,
      sleep: (ms: number) => {
        t += ms;
        return Promise.resolve();
      },
      onTextEntryEquivalence: (authored: string, resolved: string) => {
        equivalences.push([authored, resolved]);
      },
      ...overrides,
    });
    return { adapter, equivalences, elapsed: () => t };
  }

  const counts = (table: Record<string, number>) => (path: string) => table[path] ?? 0;
  const actions = (page: FakePage, action: string) =>
    page.calls.filter((call) => call.method.endsWith(`.${action}`));

  it('uses an exact match as before and never counts the alternatives', async () => {
    const page = createFakePage();
    const { adapter, equivalences } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await adapter.fill(handle, 'hosting');

    expect(page.counts).toEqual([V(SEARCHBOX)]);
    expect(actions(page, 'fill')).toEqual([
      {
        method: `${GATED(SEARCHBOX, UNION)}.fill`,
        args: ['hosting', { force: undefined, timeout: 1_000 }],
      },
    ]);
    expect(equivalences).toEqual([]);
  });

  it('falls back to the one combobox when searchbox matches nothing, after the settle window', async () => {
    const page = createFakePage();
    page.countOf = counts({ [UNION]: 1, [TEXTBOX]: 0, [COMBOBOX]: 1 });
    const { adapter, equivalences, elapsed } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await adapter.fill(handle, 'hosting');

    // min(2 000, 1 000/4) = 250 ms of zero matches before the alternatives are considered.
    expect(elapsed()).toBe(250);
    expect(page.counts.filter((path) => path === V(UNION))).toHaveLength(1);
    const fills = actions(page, 'fill');
    expect(fills).toHaveLength(1);
    expect(fills[0]?.method).toBe(`${V(UNION)}.fill`);
    expect(fills[0]?.args[1]).toEqual({ force: undefined, timeout: 750 });
    expect(equivalences).toEqual([['searchbox', 'combobox']]);
  });

  it('applies to press as well, and names the alternative that matched', async () => {
    const page = createFakePage();
    // Authored textbox matches nothing; of searchbox and combobox, only searchbox matches.
    page.countOf = counts({ [`${SEARCHBOX}.or(${COMBOBOX})`]: 1, [SEARCHBOX]: 1 });
    const { adapter, equivalences } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'textbox' }));
    await adapter.press(handle, 'Enter');

    expect(actions(page, 'press')[0]?.method).toBe(`${V(`${SEARCHBOX}.or(${COMBOBOX})`)}.press`);
    expect(equivalences).toEqual([['textbox', 'searchbox']]);
  });

  it('acts on a matched authored role through the re-render gate on press too (VAL-041)', async () => {
    const page = createFakePage();
    const { adapter, equivalences } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await adapter.press(handle, 'Enter');

    // Only the authored role is counted; the gate is built, never counted by the adapter.
    expect(page.counts).toEqual([V(SEARCHBOX)]);
    expect(actions(page, 'press')).toEqual([
      { method: `${GATED(SEARCHBOX, UNION)}.press`, args: ['Enter', { delay: undefined, timeout: 1_000 }] },
    ]);
    expect(equivalences).toEqual([]);
  });

  it('gates on the unfiltered authored role when fill opts out with force (VAL-041)', async () => {
    const page = createFakePage();
    const { adapter } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await adapter.fill(handle, 'hosting', { force: true });

    expect(actions(page, 'fill')[0]?.method).toBe(
      `${SEARCHBOX}.or(page.locator(:root,{hasNot:${SEARCHBOX}}).locator(${UNION})).fill`,
    );
  });

  it('keeps the fixed strict failure when the authored role has two visible matches (VAL-041)', async () => {
    const page = createFakePage();
    page.countOf = counts({ [SEARCHBOX]: 2 });
    const { adapter } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));

    await expect(adapter.press(handle, 'Enter')).rejects.toThrow(
      new Error('press failed: the locator matched 2 elements; make the step more specific.'),
    );
    expect(actions(page, 'press')).toEqual([]);
  });

  it('refuses with a fixed message when two alternatives match, and types nothing', async () => {
    const page = createFakePage();
    page.countOf = counts({ [UNION]: 2, [TEXTBOX]: 1, [COMBOBOX]: 1 });
    const { adapter, equivalences } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));

    await expect(adapter.fill(handle, 'hosting')).rejects.toThrow(
      new Error(
        'fill failed: no searchbox matched; 2 other text-entry controls did — refusing to choose.',
      ),
    );
    expect(actions(page, 'fill')).toEqual([]);
    expect(equivalences).toEqual([]);
  });

  it('lets a late exact match inside the settle window win', async () => {
    const page = createFakePage();
    const { adapter, equivalences } = timedAdapter(page);
    let polls = 0;
    page.countOf = (path) => {
      if (path === SEARCHBOX) return (polls += 1) >= 3 ? 1 : 0;
      return 1;
    };
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await adapter.fill(handle, 'hosting');

    expect(page.counts.every((path) => path === V(SEARCHBOX))).toBe(true);
    expect(actions(page, 'fill')).toEqual([
      {
        method: `${GATED(SEARCHBOX, UNION)}.fill`,
        args: ['hosting', { force: undefined, timeout: 900 }],
      },
    ]);
    expect(equivalences).toEqual([]);
  });

  it('fails with the VAL-028 timeout message when nothing ever matches', async () => {
    const page = createFakePage();
    page.countOf = () => 0;
    const { adapter, elapsed } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));

    await expect(adapter.fill(handle, 'hosting')).rejects.toThrow(
      new Error('fill failed: no element matched the locator within 1000ms.'),
    );
    expect(elapsed()).toBe(1_000);
    expect(actions(page, 'fill')).toEqual([]);
  });

  it('builds the alternatives with the same name, exact and disabled options', async () => {
    const page = createFakePage();
    const named = '{"name":"Search","exact":true,"disabled":false}';
    page.countOf = counts({
      [`page.getByRole(textbox,${named}).or(page.getByRole(combobox,${named}))`]: 1,
    });
    const { adapter, equivalences } = timedAdapter(page);
    const handle = await adapter.locate(
      chain({
        kind: 'getByRole',
        role: 'searchbox',
        options: { name: { kind: 'literal', value: 'Search' }, exact: true, disabled: false },
      }),
    );
    await adapter.fill(handle, 'hosting');

    expect(actions(page, 'fill')[0]?.method).toBe(
      `${V(`page.getByRole(textbox,${named}).or(page.getByRole(combobox,${named}))`)}.fill`,
    );
    expect(equivalences).toEqual([['searchbox', 'combobox']]);
  });

  it('keeps the parent segment for the alternatives', async () => {
    const page = createFakePage();
    const form = 'page.locator(form.search)';
    page.countOf = counts({
      [`${form}.getByRole(textbox,{}).or(${form}.getByRole(combobox,{}))`]: 1,
    });
    const { adapter } = timedAdapter(page);
    const handle = await adapter.locate(
      chain({ kind: 'locator', selector: 'form.search' }, { kind: 'getByRole', role: 'searchbox' }),
    );
    await adapter.fill(handle, 'hosting');
    expect(actions(page, 'fill')[0]?.method).toBe(
      `${V(`${form}.getByRole(textbox,{}).or(${form}.getByRole(combobox,{}))`)}.fill`,
    );
  });

  it.each([
    ['expanded', { expanded: true }],
    ['checked', { checked: false }],
    ['level', { level: 1 }],
  ] as const)('does not apply when the role carries %s', async (_label, state) => {
    const page = createFakePage();
    page.countOf = () => 0;
    const { adapter, equivalences } = timedAdapter(page);
    const handle = await adapter.locate(
      chain({ kind: 'getByRole', role: 'combobox', options: state }),
    );
    // Nothing matches and no alternative is ever counted: the plain VAL-028 timeout.
    await expect(adapter.fill(handle, 'x')).rejects.toThrow(
      new Error('fill failed: no element matched the locator within 1000ms.'),
    );
    expect(page.counts.some((path) => path.includes('.or('))).toBe(false);
    expect(actions(page, 'fill')).toHaveLength(0);
    expect(equivalences).toEqual([]);
  });

  it('does not apply to a non-text-entry role or a non-terminal text-entry segment', async () => {
    const page = createFakePage();
    page.countOf = () => 0;
    const { adapter } = timedAdapter(page);
    const noMatch = new Error('fill failed: no element matched the locator within 1000ms.');
    await expect(
      adapter.fill(await adapter.locate(chain({ kind: 'getByRole', role: 'button' })), 'x'),
    ).rejects.toThrow(noMatch);
    await expect(
      adapter.fill(
        await adapter.locate(
          chain(
            { kind: 'getByRole', role: 'searchbox' },
            { kind: 'getByText', text: { kind: 'literal', value: 'x' } },
          ),
        ),
        'x',
      ),
    ).rejects.toThrow(noMatch);
    expect(page.counts.some((path) => path.includes('.or('))).toBe(false);
    expect(actions(page, 'fill')).toHaveLength(0);
  });

  it('leaves click, hover, check, selectOption and the assertions untouched', async () => {
    const page = createFakePage();
    page.countOf = () => 0;
    const { adapter } = timedAdapter(page, { defaultTimeoutMs: 100 });
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    // No fallback: each times out on the authored role alone, after the full timeout.
    const noMatch = (action: string) =>
      new Error(`${action} failed: no element matched the locator within 100ms.`);
    await expect(adapter.click(handle)).rejects.toThrow(noMatch('click'));
    await expect(adapter.hover(handle)).rejects.toThrow(noMatch('hover'));
    await expect(adapter.check(handle)).rejects.toThrow(noMatch('check'));
    await expect(adapter.selectOption(handle, 'EU')).rejects.toThrow(noMatch('selectOption'));
    expect(page.counts.some((path) => path.includes('.or('))).toBe(false);
    const counted = page.counts.length;
    await adapter.expectVisible(handle);
    await adapter.expectValue(handle, { kind: 'string', value: 'typed' });
    expect(page.counts).toHaveLength(counted);
  });

  it('refuses a secret on a disallowed origin before any resolution', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://elsewhere.example/';
    page.countOf = counts({ [UNION]: 1, [COMBOBOX]: 1 });
    const { adapter, equivalences } = timedAdapter(page, {
      secretOrigins: { PW: ['https://login.app.example'] },
    });
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await expect(adapter.fill(handle, 'value', undefined, 'PW')).rejects.toMatchObject({
      code: 'SECRET_ORIGIN_NOT_ALLOWED',
    });
    expect(page.counts).toEqual([]);
    expect(actions(page, 'fill')).toEqual([]);
    expect(equivalences).toEqual([]);
  });

  it('runs the guard before resolution, and between polls', async () => {
    const page = createFakePage();
    page.countOf = () => 0;
    let stop = false;
    const { adapter } = timedAdapter(page, { guard: () => (stop ? 'stopping' : null) });
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    page.countOf = () => {
      stop = true;
      return 0;
    };
    await expect(adapter.fill(handle, 'x')).rejects.toThrow('stopping');
    expect(page.counts).toEqual([V(SEARCHBOX)]);
  });

  it('caps the settle window at 2 s for a long timeout', async () => {
    const page = createFakePage();
    page.countOf = counts({ [UNION]: 1, [COMBOBOX]: 1 });
    const { adapter, elapsed } = timedAdapter(page, { defaultTimeoutMs: 30_000 });
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    await adapter.fill(handle, 'x');
    expect(elapsed()).toBe(2_000);
  });

  it('maps a count failure through the fixed action messages, never the raw error', async () => {
    const page = createFakePage();
    const { adapter } = timedAdapter(page);
    const handle = await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' }));
    page.countOf = () => {
      throw new Error('Target page, context or browser has been closed <b>x</b>');
    };
    await expect(adapter.fill(handle, 'x')).rejects.toThrow(
      new Error('fill failed: the page was closed.'),
    );
  });
});

describe('VAL-040 — actions resolve on visible elements only; assertions are unchanged', () => {
  const WIKI = 'page.getByPlaceholder(Search Wikipedia,{})';
  const SEARCHBOX = 'page.getByRole(searchbox,{})';
  const COMBOBOX = 'page.getByRole(combobox,{})';
  const UNION = `page.getByRole(textbox,{}).or(${COMBOBOX})`;
  const V = (path: string) => `${path}${VISIBLE_SUFFIX}`;

  /** A clock that only moves when the adapter sleeps; records both disclosures. */
  function timedAdapter(page: FakePage, overrides: Record<string, unknown> = {}) {
    let t = 0;
    const totals: number[] = [];
    const equivalences: [string, string][] = [];
    const adapter = adapterFor(page, {
      defaultTimeoutMs: 1_000,
      pollIntervalMs: 50,
      now: () => t,
      sleep: (ms: number) => {
        t += ms;
        return Promise.resolve();
      },
      onVisibleOnlyResolution: (total: number) => totals.push(total),
      onTextEntryEquivalence: (authored: string, resolved: string) => {
        equivalences.push([authored, resolved]);
      },
      ...overrides,
    });
    return { adapter, totals, equivalences, elapsed: () => t };
  }

  /** `total` matches for `path`, `hidden` of them hidden; anything else matches nothing. */
  function twin(page: FakePage, table: Record<string, readonly [number, number]>): void {
    page.countOf = (path) => table[path]?.[0] ?? 0;
    page.hiddenOf = (path) => table[path]?.[1] ?? 0;
  }

  const actions = (page: FakePage, action: string) =>
    page.calls.filter((call) => call.method.endsWith(`.${action}`));
  const wikiField = chain({
    kind: 'getByPlaceholder',
    text: { kind: 'literal', value: 'Search Wikipedia' },
  });

  it('acts on the one visible element when a hidden twin matches too, and discloses it', async () => {
    const page = createFakePage();
    twin(page, { [WIKI]: [2, 1] });
    const { adapter, totals, elapsed } = timedAdapter(page);
    await adapter.fill(await adapter.locate(wikiField), 'Alan Turing');

    expect(actions(page, 'fill')).toEqual([
      { method: `${V(WIKI)}.fill`, args: ['Alan Turing', { force: undefined, timeout: 1_000 }] },
    ]);
    expect(totals).toEqual([2]);
    expect(elapsed()).toBe(0);
  });

  it('keeps the strict-mode failure when two elements are visible, with N the visible count', async () => {
    const page = createFakePage();
    twin(page, { [WIKI]: [3, 1] });
    const { adapter, totals } = timedAdapter(page);
    await expect(adapter.fill(await adapter.locate(wikiField), 'x')).rejects.toThrow(
      new Error('fill failed: the locator matched 2 elements; make the step more specific.'),
    );
    expect(actions(page, 'fill')).toEqual([]);
    expect(totals).toEqual([]);
  });

  it.each([
    ['one hidden element', 1],
    ['two hidden elements (no strict-mode failure)', 2],
  ])('times out as "not visible" with %s and none visible', async (_label, hidden) => {
    const page = createFakePage();
    twin(page, { [WIKI]: [hidden, hidden] });
    const { adapter, totals, elapsed } = timedAdapter(page);
    await expect(adapter.fill(await adapter.locate(wikiField), 'x')).rejects.toThrow(
      new Error('fill failed: the element was not visible within 1000ms.'),
    );
    expect(elapsed()).toBe(1_000);
    expect(actions(page, 'fill')).toEqual([]);
    expect(totals).toEqual([]);
  });

  it('acts once the hidden element becomes visible within the timeout', async () => {
    const page = createFakePage();
    let polls = 0;
    page.countOf = () => 1;
    page.hiddenOf = () => ((polls += 1) >= 3 ? 0 : 1);
    const { adapter, totals } = timedAdapter(page);
    await adapter.click(await adapter.locate(wikiField));
    expect(actions(page, 'click')[0]?.args[0]).toMatchObject({ timeout: 900 });
    expect(totals).toEqual([]);
  });

  it('does not disclose a single, visible match', async () => {
    const page = createFakePage();
    twin(page, { [WIKI]: [1, 0] });
    const { adapter, totals } = timedAdapter(page);
    await adapter.fill(await adapter.locate(wikiField), 'x');
    expect(actions(page, 'fill')).toHaveLength(1);
    expect(totals).toEqual([]);
  });

  it('applies to every action the failure mapping covers', async () => {
    const page = createFakePage();
    const LABEL = 'page.getByLabel(Search,{})';
    twin(page, { [LABEL]: [6, 5] });
    const { adapter, totals } = timedAdapter(page);
    const handle = await adapter.locate(
      chain({ kind: 'getByLabel', text: { kind: 'literal', value: 'Search' } }),
    );
    await adapter.click(handle);
    await adapter.fill(handle, 'x');
    await adapter.press(handle, 'Enter');
    await adapter.check(handle);
    await adapter.uncheck(handle);
    await adapter.hover(handle);
    await adapter.selectOption(handle, 'EU');
    expect(page.calls.filter((call) => call.method.startsWith(`${V(LABEL)}.`)).map((call) => call.method)).toEqual(
      ['click', 'fill', 'press', 'check', 'uncheck', 'hover', 'selectOption'].map(
        (action) => `${V(LABEL)}.${action}`,
      ),
    );
    expect(totals).toEqual([6, 6, 6, 6, 6, 6, 6]);
  });

  it('leaves an explicit force: true unfiltered and uncounted, as before', async () => {
    const page = createFakePage();
    twin(page, { [WIKI]: [2, 1] });
    const { adapter, totals } = timedAdapter(page);
    const handle = await adapter.locate(wikiField);
    await adapter.click(handle, { force: true });
    await adapter.fill(handle, 'x', { force: true });
    expect(page.counts).toEqual([]);
    expect(actions(page, 'click')[0]?.method).toBe(`${WIKI}.click`);
    expect(actions(page, 'fill')[0]?.method).toBe(`${WIKI}.fill`);
    expect(totals).toEqual([]);
  });

  it('leaves the assertions unfiltered: a hidden twin changes nothing', async () => {
    const page = createFakePage();
    twin(page, { [WIKI]: [2, 1] });
    const { adapter, totals } = timedAdapter(page);
    const handle = await adapter.locate(wikiField);
    await adapter.expectVisible(handle);
    await adapter.expectValue(handle, { kind: 'string', value: 'typed' });
    await adapter.expectContainText(handle, { kind: 'string', value: 'hello' });
    expect(page.counts).toEqual([]);
    expect(page.calls.filter((call) => call.method.includes(VISIBLE_SUFFIX))).toEqual([]);
    expect(actions(page, 'waitFor')[0]?.method).toBe(`${WIKI}.waitFor`);
    expect(totals).toEqual([]);
  });

  it('composes with the text-entry fallback: a hidden authored role falls back to the one visible alternative', async () => {
    const page = createFakePage();
    // searchbox only hidden; textbox|combobox: two matches, one hidden.
    twin(page, { [SEARCHBOX]: [1, 1], [UNION]: [2, 1], [COMBOBOX]: [2, 1] });
    const { adapter, totals, equivalences, elapsed } = timedAdapter(page);
    await adapter.fill(await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' })), 'x');

    expect(elapsed()).toBe(250);
    expect(actions(page, 'fill')[0]?.method).toBe(`${V(UNION)}.fill`);
    expect(equivalences).toEqual([['searchbox', 'combobox']]);
    expect(totals).toEqual([2]);
  });

  it('composes with the text-entry fallback: hidden alternatives do not make it ambiguous, nor match', async () => {
    const page = createFakePage();
    twin(page, { [SEARCHBOX]: [1, 1], [UNION]: [2, 2], [COMBOBOX]: [2, 2] });
    const { adapter, equivalences } = timedAdapter(page);
    await expect(
      adapter.fill(await adapter.locate(chain({ kind: 'getByRole', role: 'searchbox' })), 'x'),
    ).rejects.toThrow(new Error('fill failed: the element was not visible within 1000ms.'));
    expect(equivalences).toEqual([]);
    expect(actions(page, 'fill')).toEqual([]);
  });

  it('runs the secret-origin check before counting anything', async () => {
    const page = createFakePage();
    page.currentUrl = 'https://elsewhere.example/';
    twin(page, { [WIKI]: [2, 1] });
    const { adapter } = timedAdapter(page, { secretOrigins: { PW: ['https://login.app.example'] } });
    await expect(
      adapter.fill(await adapter.locate(wikiField), 'v', undefined, 'PW'),
    ).rejects.toMatchObject({ code: 'SECRET_ORIGIN_NOT_ALLOWED' });
    expect(page.counts).toEqual([]);
  });
});
