/**
 * The guided child as the fixtures tier runs it (SC008-E15): the product's `serveGuidedChild` over the product's `launchGuidedBrowser`, plus the
 * three things a test needs from INSIDE the process that now owns the browser, none of which the product exposes:
 *
 * - `probe`: a local socket on which the test process asks a closed set of questions about the Playwright page (`childPage.ts`). The product child
 *   has no such door; this one exists only in the test entries, and only the fixtures-tier tests fork it. The questions are named operations,
 *   never code sent over the socket.
 * - `beforeSecretFill`: the seam the old runtime option offered, now a service option (the entry that wants it passes it).
 * - `hangLaunch`: `chromium.launchPersistentContext` never returns (the oracle of the stop-before-spawn case, now in the child that launches).
 *
 * Plain JavaScript over `dist/`, because a fork starts from a file on disk. The socket sits next to the child's private temporary directory, named
 * by the server's pid and the child's, so the test can find it without any channel the product protocol does not have.
 */
import { createServer } from 'node:net';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
// eslint-disable-next-line no-restricted-imports -- Test entry of the child: the launch-promise fault oracle of guidedCloseBound F4 patches the SDK in the process that launches.
import { chromium } from 'playwright';
import { launchGuidedBrowser } from '../../../dist/run/browser.js';
import { serveGuidedChild } from '../../../dist/run/guidedChildService.js';

/** Where the probe of the child `childPid` forked by `serverPid` listens, given the server's temporary root. */
export const probePath = (tmpRoot, serverPid, childPid) => join(tmpRoot, `guided-probe-${String(serverPid)}-${String(childPid)}.sock`);

/** The closed set of questions the test may ask about the page. */
async function operate(page, request) {
  switch (request.op) {
    case 'url': return page.url();
    case 'inputValue': return page.locator(request.selector).inputValue();
    case 'count': return page.locator(request.selector).count();
    case 'allEmpty': return page.locator(request.selector).evaluateAll((elements) => elements.every((element) => element.value === ''));
    case 'remove': return page.locator(request.selector).evaluate((element) => { element.remove(); });
    case 'insertHtml': return page.evaluate((html) => { globalThis.document.body.insertAdjacentHTML('beforeend', html); }, request.html);
    case 'globals': return page.evaluate((names) => Object.fromEntries(names.map((name) => [name, globalThis[name]])), request.names);
    // The message of Playwright's own error for a click that cannot complete: the control that shows a leak oracle can see page text.
    case 'clickError': {
      try { await page.locator(request.selector).click({ timeout: request.timeoutMs }); return ''; } catch (error) { return error instanceof Error ? error.message : String(error); }
    }
    // A second copy of the label around the element, with the given id: the strict-mode ambiguity the mixed-prefix case plants.
    case 'duplicateLabelOf': return page.locator(request.selector).evaluate((element, id) => {
      const label = element.closest('label');
      if (label === null) throw new Error('LABEL');
      const twin = label.cloneNode(true);
      twin.id = id;
      label.after(twin);
    }, request.twinId);
    default: throw new Error('UNKNOWN_PROBE_OPERATION');
  }
}

function startProbe(pageOf) {
  const path = probePath(dirname(process.env.TMPDIR), process.ppid, process.pid);
  const server = createServer((socket) => {
    let text = '';
    socket.on('data', (chunk) => {
      text += chunk.toString();
      for (let end = text.indexOf('\n'); end >= 0; end = text.indexOf('\n')) {
        const line = text.slice(0, end);
        text = text.slice(end + 1);
        void answer(line, socket);
      }
    });
    socket.on('error', () => undefined);
  });
  const answer = async (line, socket) => {
    const request = JSON.parse(line);
    let reply;
    try {
      const page = pageOf();
      if (page === null) throw new Error('NO_PAGE');
      reply = { id: request.id, ok: true, value: (await operate(page, request)) ?? null };
    } catch (error) {
      reply = { id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    socket.write(`${JSON.stringify(reply)}\n`);
  };
  server.listen(path);
  const remove = () => { try { rmSync(path, { force: true }); } catch { /* gone */ } };
  process.on('exit', remove);
}

export function runTestChild(options = {}) {
  if (options.hangLaunch === true) chromium.launchPersistentContext = () => new Promise(() => undefined);
  let page = null;
  const launch = async (...args) => {
    const browser = await launchGuidedBrowser(...args);
    page = browser.handle?.page ?? null;
    return browser;
  };
  startProbe(() => page);
  serveGuidedChild({
    send: (frame) => { process.send?.(frame); },
    onMessage: (listener) => { process.on('message', listener); },
    onDisconnect: (listener) => { process.on('disconnect', listener); },
    exit: () => { process.exit(0); },
  }, { launch, ...(options.beforeSecretFill === undefined ? {} : { beforeSecretFill: options.beforeSecretFill }) });
}
