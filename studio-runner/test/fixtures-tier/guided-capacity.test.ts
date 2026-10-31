/**
 * STUDIO-FLEX-001 item 5, in real Chromium: one guided process, N learning sessions.
 *
 * With `STUDIO_RUNNER_GUIDED_CAPACITY=3` the ownership owns three sessions at once, each with its own runtime,
 * browser, journal and recording, and refuses the fourth assignment with `CAPACITY` (the runner's backstop
 * behind the backend's deployment-wide cap). Stopping one frees its slot. Nothing one session does is visible
 * to another: observations, journals, scratch directories and uploaded recordings stay apart.
 */
import { stepOp } from '../helpers/stepCode.js';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createGuidedRecorder } from '../../src/guided/evidence.js';
import { hash, identity } from '../../src/guided/contracts.js';
import { GuidedOwnership } from '../../src/guided/ownership.js';
import type { BridgeBootstrap, BridgeObservation, CommandsClaim, Session } from '../../src/guided/types.js';
import { launchGuidedBrowser } from '../../src/run/browser.js';
import type { GuidedBrowser } from '../../src/run/guidedBrowser.js';
import { createConfiguredObjectStore, evidenceBoundsFrom, NODE_EVIDENCE_FILE_SYSTEM } from '../../src/run/objectStoreFactory.js';
import { WEBM_MAGIC } from '../../src/run/recording.js';
import { systemOriginSource } from '../../src/run/timeline.js';
import { loadEvidenceConfig } from '../../src/server/config.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
import { assignmentFor, dispatch, guidedContext, ownershipSession, proposal } from '../helpers/guided.js';

let server: Server, origin = '', root = '';
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'guided-capacity-'));
  server = createServer((request, response) => {
    const match = /^\/s(\d)$/u.exec(request.url ?? '');
    if (match === null) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<title>Session ${match[1] ?? ''}</title><main><button>Only session ${match[1] ?? ''}</button></main>`);
  });
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('PORT');
  origin = `http://localhost:${String(address.port)}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
  await rm(root, { recursive: true, force: true });
});

const webm = (bytes: Buffer): boolean => bytes.subarray(0, 4).equals(Buffer.from(WEBM_MAGIC));

describe('guided capacity 3 on real Chromium', () => {
  it('owns three sessions at once, refuses the fourth with CAPACITY and keeps journals, browsers and recordings apart', async () => {
    const objects = join(root, 'objects'), evidenceRoot = join(root, 'evidence'), journal = join(root, 'journal');
    await mkdir(evidenceRoot); await mkdir(journal);
    const settings = loadEvidenceConfig({ STUDIO_RUNNER_OBJECT_STORE_DIR: objects, STUDIO_RUNNER_SCRATCH_DIR: join(root, 'scratch') });
    const configured = createConfiguredObjectStore(settings);
    const recorder = createGuidedRecorder({ store: configured.store, fileSystem: NODE_EVIDENCE_FILE_SYSTEM, bounds: evidenceBoundsFrom(settings), size: { width: settings.recordingWidth, height: settings.recordingHeight }, calibrationOffsetMs: settings.seekOriginCalibrationMs, originSource: systemOriginSource, now: () => performance.now(), sleep: ms => new Promise(resolve => { setTimeout(resolve, ms); }), evidenceRoot });

    // Four sessions that would each be valid on their own: three fit, the fourth does not.
    const sessions = [0, 1, 2, 3].map(index => {
      const context = guidedContext(origin);
      const destination = context.authoredInputs.inputs[0];
      if (!destination || !('value' in destination)) throw new Error('DESTINATION');
      destination.value = `${origin}/s${String(index)}`;
      context.authoredInputsHash = hash(context.authoredInputs);
      const grant: Session = ownershipSession(context);
      return { index, context, grant, messages: [] as { route: string; body: unknown }[] };
    });
    const bySession = new Map(sessions.map(session => [session.context.sessionId, session]));
    const recordings = new Map<string, string>();
    const browsers = new Map<string, GuidedBrowser>();
    const ownership = new GuidedOwnership({
      workerId: 'worker-one', allowedDomains: TEST_DOMAINS, journalDirectory: journal, capacity: 3, recorder,
      launch: async (config, contextId, onLost, recording, startup) => {
        const browser = await launchGuidedBrowser(config, contextId, onLost, recording, startup);
        browsers.set(config.sessionId, browser);
        if (recording) recordings.set(config.sessionId, recording.dir);
        return browser;
      },
      callback: (route, body) => {
        const message = body as { sessionId?: string; assignment?: { sessionId: string } };
        bySession.get(message.sessionId ?? message.assignment?.sessionId ?? '')?.messages.push({ route, body });
        return Promise.resolve();
      },
      claim: (command: CommandsClaim) => {
        const session = bySession.get(command.sessionId);
        return session ? Promise.resolve(structuredClone(session.grant)) : Promise.reject(new Error('UNKNOWN_SESSION'));
      },
    });
    try {
      const [first, second, third, fourth] = sessions as [typeof sessions[number], typeof sessions[number], typeof sessions[number], typeof sessions[number]];
      const owned = await Promise.all([first, second, third].map(session => ownership.assign(assignmentFor(session.context))));
      expect(owned.map(receipt => receipt.status)).toEqual(['OWNED', 'OWNED', 'OWNED']);
      await expect(ownership.assign(assignmentFor(fourth.context))).rejects.toThrow('CAPACITY');

      // Three browsers start together, one per session.
      await Promise.all([first, second, third].map(session => ownership.context(session.context)));
      expect(browsers.size).toBe(3);
      const scratches = [...browsers.values()].map(browser => browser.scratchDirectory);
      expect(new Set(scratches).size).toBe(3);
      expect(new Set(recordings.values()).size).toBe(3);

      // Each session navigates its own page and observes only its own page.
      await Promise.all([first, second, third].map(async session => {
        const runtime = ownership.getRuntime(identity(session.context));
        const bootstrap = session.messages.find(message => message.route === 'bootstrap-evidence')?.body as BridgeBootstrap;
        const action = proposal(session.context, bootstrap.executionEvidence, 'nav', stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] }));
        const prepared = await runtime.prepare({ ...identity(session.context), proposal: action, requestDigest: hash(action), expiresAt: new Date(Date.now() + 10_000).toISOString() });
        expect((await runtime.dispatch(dispatch(session.context, action, prepared))).ledger.state).toBe('SUCCEEDED');
      }));
      for (const session of [first, second, third]) {
        const observation = (session.messages.filter(message => message.route === 'observations').at(-1)?.body as BridgeObservation).observation;
        const names = Object.values(observation.facts).map(fact => fact.name);
        expect(names).toContain(`Only session ${String(session.index)}`);
        expect(names.filter(name => name.startsWith('Only session ') && name !== `Only session ${String(session.index)}`)).toEqual([]);
        expect(observation.sessionId).toBe(session.context.sessionId);
      }

      // Journals: one consumed-context journal per session, named by that session's own hash, plus one assignment marker each.
      const journalFiles = (await readdir(journal)).filter(name => name.endsWith('.journal'));
      for (const session of [first, second, third]) expect(journalFiles).toContain(`${hash(session.context.sessionId)}.journal`);
      expect(journalFiles).not.toContain(`${hash(fourth.context.sessionId)}.journal`);
      const markers = (await readdir(join(journal, 'assignments'))).filter(name => name.endsWith('.journal'));
      for (const session of [first, second, third]) expect(markers).toContain(`${hash(session.context.sessionId)}.journal`);
      expect(markers).not.toContain(`${hash(fourth.context.sessionId)}.journal`);

      // Stopping one session frees exactly one slot and leaves the other two running.
      await ownership.stop({ ...identity(first.context), reason: 'CANCELLED' });
      const freed = await ownership.assign(assignmentFor(fourth.context));
      expect(freed.status).toBe('OWNED');
      expect(ownership.getRuntime(identity(second.context))).toBeDefined();
      expect(ownership.getRuntime(identity(third.context))).toBeDefined();
      await expect(ownership.assign(assignmentFor(guidedContext(origin)))).rejects.toThrow('CAPACITY');
    } finally {
      await ownership.close().catch(() => undefined);
    }

    // Recordings: after the close each started session has its own webm under its own key, and no scratch is left behind.
    for (const session of sessions.slice(0, 3)) {
      const key = join(objects, 'studio', 'fixture-csi', 'guided', `${session.context.sessionId}.webm`);
      expect(existsSync(key), session.context.sessionId).toBe(true);
      expect(webm(await readFile(key))).toBe(true);
    }
    const stored = (await readdir(join(objects, 'studio', 'fixture-csi', 'guided'))).filter(name => name.endsWith('.webm'));
    expect(new Set(stored).size).toBe(3);
    for (const dir of recordings.values()) expect(existsSync(dir)).toBe(false);
    configured.close();
  }, 180_000);
});
