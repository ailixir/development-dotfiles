/**
 * **The only module in this package that imports Playwright** (AC-1).
 *
 * `eslint.boundary-rules.js` restricts `playwright` and `playwright-core` everywhere else, with
 * proving fixtures under `fixtures/lint/`, and `test/run/playwright-confinement.test.ts` asserts
 * over the sources that no Playwright import appears in `src/validator/**`, `src/executor/**`,
 * `src/server/**` or `src/reporting/**`. Keeping the import to one small file is what makes that
 * claim checkable rather than aspirational.
 *
 * ## The sandbox
 *
 * `chromiumSandbox: true` is written literally below and there is **no** configuration key,
 * environment variable, job field or code path that can set it to `false` (AC-6a, §9.3, ADR-001
 * §8). Playwright's own default is `false` — it adds `--no-sandbox` — so the default is the wrong
 * way round and the requirement has to be a gate rather than a habit. `args` is an explicitly
 * empty array for the same reason: a reviewer cannot see an argument that was never written, and
 * an empty literal is something a diff can show being filled in.
 *
 * If Chromium will not start sandboxed, this module reports it. It does **not** retry without the
 * sandbox: `test/run/sandbox.test.ts` drives that path and asserts a single launch attempt with a
 * single set of arguments.
 *
 * ## One browser, one context, one page — and everything it writes is scratch
 *
 * `launchPersistentContext` is used rather than `launch` + `newContext` because it puts the
 * browser's own profile/user-data directory where AC-22 requires it: inside the per-run scratch
 * directory, which is cleared on every exit path. `downloadsPath` and `tracesDir` go there too,
 * and the child sets `TMPDIR` so Chromium's temp output follows. Recording is configured **at
 * context creation** with an explicit size (§6.1) and is never attached per page.
 */

import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { join } from 'node:path';

import type { BrowserFactory, BrowserHandle, BrowserLaunchRequest } from './browserFactory.js';
import type { PageLike } from './playwrightAdapter.js';
import { SCRATCH_SUBDIRECTORIES } from './scratchLayout.js';

/** Bounded so an adversarial page cannot grow the observation set without limit (AC-19). */
const MAX_OBSERVED_HOSTS = 64;

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'about:' || parsed.protocol === 'blob:' ? null : parsed.host || parsed.protocol;
  } catch {
    return null;
  }
}

export const playwrightBrowserFactory: BrowserFactory = {
  async launch(request: BrowserLaunchRequest): Promise<BrowserHandle> {
    if (request.browser !== 'chromium') {
      throw new Error(`Unsupported browser "${request.browser}": V1 launches Chromium only.`);
    }

    const videoDir = join(request.scratchPath, SCRATCH_SUBDIRECTORIES.video);

    const context: BrowserContext = await chromium.launchPersistentContext(
      join(request.scratchPath, SCRATCH_SUBDIRECTORIES.profile),
      {
        headless: true,
        // §9.3 / ADR-001 §8. Not configurable, not overridable, never retried without it.
        chromiumSandbox: true,
        // Explicitly empty: no `--no-sandbox`, no `--disable-setuid-sandbox`, no
        // `--disable-gpu-sandbox`, and a diff that adds one is visible (AC-6a).
        args: [],
        viewport: { width: request.viewport.width, height: request.viewport.height },
        // Configured at context creation, with an explicit size (§6.1, AC-7).
        recordVideo: {
          dir: videoDir,
          size: { width: request.recording.width, height: request.recording.height },
        },
        downloadsPath: join(request.scratchPath, SCRATCH_SUBDIRECTORIES.downloads),
        tracesDir: join(request.scratchPath, SCRATCH_SUBDIRECTORIES.traces),
        acceptDownloads: false,
      },
    );

    const [first] = context.pages();
    const page: Page = first ?? (await context.newPage());

    const hosts = new Set<string>();
    context.on('request', (request_) => {
      if (hosts.size >= MAX_OBSERVED_HOSTS) return;
      const host = hostOf(request_.url());
      if (host !== null) hosts.add(host);
    });

    let extraPageListener: (() => void) | null = null;
    context.on('page', (opened) => {
      if (opened === page) return;
      // Closed immediately: V1 supports one page, and a second recording is never created or
      // merged (§5.2, AC-15). The run refuses at its next operation.
      void opened.close().catch(() => undefined);
      extraPageListener?.();
    });

    let closed = false;

    return {
      page: page as unknown as PageLike,

      onExtraPage(listener: () => void): void {
        extraPageListener = listener;
      },

      observedHosts(): readonly string[] {
        return [...hosts].sort();
      },

      async close(): Promise<string | null> {
        if (closed) return null;
        closed = true;
        const video = page.video();
        // Awaited, because that is what flushes the file (§6.1, Playwright's documented
        // finalization behaviour). A recording nobody waited for is a recording nobody has.
        await context.close();
        await context.browser()?.close();
        if (video === null) return null;
        return await video.path();
      },

      async dispose(): Promise<void> {
        if (closed) return;
        closed = true;
        await context.close().catch(() => undefined);
        await context.browser()?.close().catch(() => undefined);
      },
    };
  },
};
