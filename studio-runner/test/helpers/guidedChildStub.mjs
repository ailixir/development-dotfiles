// A real guided child process without Chromium (SC008-E15): the BUILT `serveGuidedChild` (dist) over a fake browser and page, forked by the
// production proxy in test/run/guidedChild.test.ts. Plain .mjs: it runs under plain Node and cannot import the TypeScript helpers.
//
// Behaviour is chosen by the launch request's `contextId`, which the child echoes back as its evidence: `<id>?launch=hang`, `orderly=0`,
// `finalize=<ms>|hang`, `video=outside` (the reported video is outside the recording directory), `hostile=oversize|malformed|order|fence`
// (a forged frame in answer to the first `current` request) or `hostile=claim` (a forged step reply that claims a crossed fence).
/* eslint-disable @typescript-eslint/no-empty-function, no-restricted-imports -- a fake: every Playwright method is an empty async stub, and the fake browser's own process stand-in is the one thing it spawns (a fixed command, no artifact data) */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URLSearchParams } from 'node:url';

import { hashObserved } from '../../dist/validator/observedReferencePolicy.js';
import { serveGuidedChild } from '../../dist/run/guidedChildService.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const tmp = process.env.TMPDIR;
const fixture = JSON.parse(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8'));
let hostile = null;

// Registered before the service's own listener, so a hostile frame goes out ahead of the honest reply.
process.on('message', raw => {
  if (hostile === 'claim' && raw?.op === 'step') {
    const receipt = { closedCode: null, stepHash: hashObserved(raw.step.operation), fenceCrossed: true, effects: [], effectsTruncated: false, offscreen: false };
    process.send({ kind: 'reply', id: raw.id, ok: true, value: { receipt, captured: {}, fenceReached: true, secretUse: {} } });
    return;
  }
  if (hostile === null || raw?.op !== 'current') return;
  const frames = {
    oversize: { kind: 'reply', id: raw.id, ok: true, value: 'x'.repeat(2_000_000) },
    malformed: { kind: 'bogus' },
    order: { kind: 'reply', id: 9999, ok: true, value: true },
    fence: { kind: 'fence', req: 1 },
  };
  process.send(frames[hostile]);
});

// Minimal Playwright-shaped objects: classes (the binding recognises Playwright objects by their methods on a class instance).
class FakeLocator {
  constructor(owner) { this.owner = owner; }
  async waitFor() {}
  async count() { return 1; }
  async evaluate() { return true; }
  async click() {}
  async fill() {}
  filter() { return this; }
  first() { return this; }
  and() { return { count: async () => 1 }; }
  locator() { return new FakeLocator(this.owner); }
  page() { return this.owner; }
}
class FakeFrame {
  async goto() {}
  childFrames() { return []; }
  parentFrame() { return null; }
}
class FakePage {
  constructor() { this.frame = new FakeFrame(); }
  url() { return 'https://orders.example.test/'; }
  video() { return null; }
  async close() {}
  mainFrame() { return this.frame; }
  frames() { return [this.frame]; }
  locator() { return new FakeLocator(this); }
  setDefaultTimeout() {}
  setDefaultNavigationTimeout() {}
}
class FakeContext {
  pages() { return []; }
  async newPage() { return new FakePage(); }
  async newCDPSession() { return {}; }
  browser() { return null; }
  async close() {}
  setDefaultTimeout() {}
  setDefaultNavigationTimeout() {}
}
const expectFake = Object.assign(() => ({}), { configure: () => expectFake });

async function launch(config, contextId, _onLost, recording) {
  const params = new URLSearchParams(contextId.split('?')[1] ?? '');
  hostile = params.get('hostile');
  // A "browser": a descendant that leads its own process group, as Chromium does. Its pid is for the test to find.
  const browserProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  browserProcess.unref();
  writeFileSync(join(tmp, 'grandchild.pid'), String(browserProcess.pid));
  if (params.get('launch') === 'hang') await new Promise(() => undefined);
  recording?.ready(true);

  let generation = 0;
  const page = new FakePage();
  const session = {
    async observe() {
      generation += 1;
      const observation = { ...fixture.documents.observation.observation, generation, documentId: 'document-1' };
      return { observation, json: JSON.stringify(observation), bytes: 100, observationHash: 'h'.repeat(64) };
    },
    commitCapture() {},
    invalidate() {},
    documentCurrent: () => true,
    documentEpoch: () => 0,
    async withhold() {},
    async preparePassword() {},
    // The value is never written down: only its digest, for the test to compare, and its length for the log.
    async fillPassword(_target, _origin, _allowed, value) {
      appendFileSync(join(tmp, 'fill.log'), `${createHash('sha256').update(value).digest('hex').slice(0, 16)}\n`);
      console.error(`fill length=${String(value.length)}`);
    },
    async dispose() {},
  };
  const orderly = params.get('orderly') !== '0';
  const finalize = params.get('finalize');
  return {
    evidence: { kind: 'initialBlank', sessionId: config.sessionId, contextId, creationId: 'creation-1', documentId: 'blank-document-1', bootstrapId: 'bootstrap-1', url: 'about:blank', origin: null, generation: 0 },
    scratchDirectory: join(tmp, 'scratch'),
    observations: session,
    blankMatches: async () => true,
    handle: {
      stepApi: {
        page, context: new FakeContext(), expect: expectFake,
        async awaitWhitelistedMainFrame() {}, beginStep() {}, async endStep() {}, adopt() {}, adoptedPages: () => [],
      },
    },
    // A graceful close leaves the browser process alone (the recorder may still be writing); only the hard teardown ends it.
    async close() {},
    async terminate() { try { process.kill(-browserProcess.pid, 'SIGKILL'); } catch { /* already gone */ } },
    orderlyClosed: () => orderly,
    recordedVideo: async () => (params.get('video') === 'outside' || recording === undefined ? '/stub/recording.webm' : join(recording.dir, 'stub.webm')),
    finalizeRecording: async () => {
      if (finalize === 'hang') await new Promise(() => undefined);
      await delay(Number(finalize ?? 0));
      return true;
    },
  };
}

serveGuidedChild({
  send: frame => { process.send(frame); },
  onMessage: listener => { process.on('message', listener); },
  onDisconnect: listener => { process.on('disconnect', listener); },
  exit: () => { process.exit(0); },
}, { launch });
