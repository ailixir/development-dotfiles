import { stepOp } from '../helpers/stepCode.js';
import { TEST_DOMAINS } from '../helpers/allowedDomains.js';
// eslint-disable-next-line no-restricted-imports -- Test-local original fixed SDK delegation; no alternate browser/password primitive.
import {chromium, type BrowserContext} from 'playwright';
import {createServer} from 'node:https';
import {TLSSocket} from 'node:tls';
import {mkdtemp, readdir, readFile, writeFile, rm, realpath} from 'node:fs/promises';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect, it} from 'vitest';
import {createGuidedServer, guidedClaimClient, guidedCallback, verifyGuidedJwt} from '../../src/guided/transport.js';
import {GuidedOwnership} from '../../src/guided/ownership.js';
import {GuidedRuntime} from '../../src/guided/runtime.js';
import {canonical, hash, identity, validate} from '../../src/guided/contracts.js';
import {launchGuidedBrowser} from '../../src/run/browser.js';
import {adaptInProcess} from './helpers/guidedLaunch.js';
import {GuidedLaunchFailure} from '../../src/run/guidedBrowser.js';
import {PrivateInventory} from '../../src/run/privateInventory.js';
import {descendantsOf, isAlive} from '../../src/run/tree.js';
import type {BrowserPreferenceEvidence} from '../../src/run/scratchLayout.js';
import type {Action, BridgeBootstrap, BridgeObservation, BridgeOrdinaryOutcome as BridgeOutcome, BridgePreparation, CommandsClaim, ExecutionEvidence, Session} from '../../src/guided/types.js';
import {guidedContext, ownershipSession, assignmentFor, proposal, dispatch} from '../helpers/guided.js';
import {testTls, testFingerprint, jwtPolicy, jwt, post} from '../helpers/guidedTls.js';
import {startSecretLoginFixture} from '../fixtures/secret-login/server.js';
import {untilMs} from './realRunner.js';
import {evidencePath} from '../helpers/evidenceOut.js';

const CANARY = 'obs007-stale-grant-A-é:+/';
const CLEANUP_MS = 5000;
type Label = 'A' | 'PROBE' | 'B';
type Scalar = string | number | boolean | null;
type Fact = Record<string, Scalar>;
interface CleanupFact {label: string; confirmed: boolean}
interface Client {
  label: Label;
  context: ReturnType<typeof guidedContext>;
  grant: ReturnType<typeof ownershipSession>;
  assignment: ReturnType<typeof assignmentFor>;
  evidence?: ExecutionEvidence;
  observation?: BridgeObservation['observation'];
  scratch?: string;
  preferences?: BrowserPreferenceEvidence;
  sdk?: WeakRef<BrowserContext>;
  sdkRestores: (() => void)[];
  launchAttempts: number;
  launches: number;
  starts: number;
  dispatches: number;
  nativeEntries: number;
  nativePending: number;
  closed: boolean;
}
interface InventoryView {values: Map<string, boolean>; bytes: number; disposed: boolean; failed: boolean}
const responseCodes = new Set(['CONTEXT_LOST', 'IDENTITY_MISMATCH', 'LEASE_LOST', 'SCHEMA', 'CAPACITY', 'AUTH_DENIED', 'TARGET_CHANGED', 'POLICY_DENIED', 'IDEMPOTENCY_CONFLICT']);
function code(body: unknown): string {
  return typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' && responseCodes.has(body.code) ? body.code : 'OTHER';
}
function status(reply: Awaited<ReturnType<typeof post>>, expected: number): void {expect(reply.status, code(reply.body)).toBe(expected);}
function* patterns(): Generator<readonly [string, Buffer]> {
  yield ['UTF8-NFC', Buffer.from(CANARY.normalize('NFC'))]; yield ['UTF8-NFD', Buffer.from(CANARY.normalize('NFD'))];
  yield ['URI', Buffer.from(encodeURIComponent(CANARY))]; yield ['URI-TWICE', Buffer.from(encodeURIComponent(encodeURIComponent(CANARY)))];
  yield ['UTF16-LE', Buffer.from(CANARY, 'utf16le')]; yield ['UTF16-BE', Buffer.from(CANARY, 'utf16le').swap16()];
  yield ['HEX-LOWER', Buffer.from(Buffer.from(CANARY).toString('hex'))]; yield ['HEX-UPPER', Buffer.from(Buffer.from(CANARY).toString('hex').toUpperCase())];
  yield ['BASE64', Buffer.from(Buffer.from(CANARY).toString('base64'))];
  yield ['JSON-UNICODE', Buffer.from(CANARY.replace(/[^\u0020-\u007e]/gu, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')))];
}
function hits(bytes: Uint8Array): number {
  let count = 0; const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const [, pattern] of patterns()) if (view.includes(pattern)) count++; return count;
}
/** Only numeric prefixes/counters survive a write; no output chunks/tails are retained. */
function outputWitness() {
  const prefixes: Record<string, number> = {}, counts: Record<string, number> = {}, observed: Record<string, number> = {};
  return {
    counts, observed,
    total: () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    observe(sink: string, chunk: unknown, encoding?: unknown): void {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, typeof encoding === 'string' && Buffer.isEncoding(encoding) ? encoding : undefined) : chunk instanceof Uint8Array ? chunk : null;
      if (!bytes) return;
      observed[sink + '-calls'] = (observed[sink + '-calls'] ?? 0) + 1; observed[sink + '-bytes'] = (observed[sink + '-bytes'] ?? 0) + bytes.byteLength;
      for (const [variant, pattern] of patterns()) {
        const key = sink + '/' + variant; let matched = prefixes[key] ?? 0;
        for (const byte of bytes) {
          while (matched > 0 && byte !== pattern[matched]) {
            let next = matched - 1; while (next > 0 && !pattern.subarray(0, next).equals(pattern.subarray(matched - next, matched))) next--; matched = next;
          }
          if (byte === pattern[matched]) matched++;
          if (matched === pattern.length) {counts[key] = (counts[key] ?? 0) + 1; matched = 0;}
        }
        prefixes[key] = matched;
      }
    },
  };
}
function patch(holder: object, key: string, observe: (receiver: object, args: unknown[], invoke: () => unknown) => unknown): () => void {
  const own = Object.getOwnPropertyDescriptor(holder, key), original = Reflect.get(holder, key) as (...args: unknown[]) => unknown;
  if (typeof original !== 'function') throw Error('METHOD');
  Object.defineProperty(holder, key, {configurable: true, writable: true, value: new Proxy(original, {apply(target, receiver, args) {return observe(receiver as object, args, () => Reflect.apply(target, receiver, args));}})});
  return () => {if (own) Object.defineProperty(holder, key, own); else if (!Reflect.deleteProperty(holder, key)) throw Error('DESCRIPTOR_RESTORE_UNCONFIRMED');};
}
function restore(list: (() => void)[], label: string, cleanup: CleanupFact[]): boolean {
  let confirmed = true;
  for (const release of [...list].reverse()) try {release(); const at = list.lastIndexOf(release); if (at >= 0) list.splice(at, 1);} catch {cleanup.push({label, confirmed: false}); confirmed = false;}
  return confirmed;
}
async function bounded(label: string, release: () => Promise<unknown>, deadline: number, cleanup: CleanupFact[]): Promise<void> {
  let pending: Promise<unknown>; try {pending = release();} catch {cleanup.push({label, confirmed: false}); return;}
  let timer: ReturnType<typeof setTimeout> | undefined;
  const confirmed = await Promise.race([pending.then(() => true, () => false), new Promise<boolean>(done => {timer = setTimeout(() => {done(false);}, Math.max(0, deadline - performance.now()));})]);
  if (timer) clearTimeout(timer); cleanup.push({label, confirmed});
}
function scanSync(root: string): number {
  let count = 0; for (const item of readdirSync(root, {withFileTypes: true})) {
    const path = join(root, item.name); if (item.isDirectory()) count += scanSync(path);
    else if (item.isFile()) count += hits(readFileSync(path));
  } return count;
}
async function scan(root: string): Promise<number> {
  let count = 0; for (const item of await readdir(root, {withFileTypes: true})) {
    const path = join(root, item.name); if (item.isDirectory()) count += await scan(path);
    else if (item.isFile()) count += hits(await readFile(path));
  } return count;
}

it('rejects the genuine retired CSI-A grant for a fresh CSI-B assignment before context or secret effects', async () => {
  const resources: {label: string; release: () => Promise<unknown>}[] = [], restorers: (() => void)[] = [], cleanup: CleanupFact[] = [], facts: Fact[] = [], pids: {label: Label; pid: number}[] = [];
  const clients = new Map<string, Client>(), setup = new Map<Label, Promise<void>>(), output = outputWitness(), inventoryTags = new WeakMap<object, number>(), inventoryOwners = new WeakMap<object, Label>();
  let nextInventory = 0, launching: Label = 'A', journal: string | undefined, fixture: Awaited<ReturnType<typeof startSecretLoginFixture>> | undefined, worker: ReturnType<typeof createGuidedServer> | undefined, workerPort = 0;
  // The sole retained authority is the names-only grant returned by original checkGrant.
  // No private runtime/inventory arrays or secret values are captured from its arguments.
  let acceptedA: Session | null = null, primaryFailed = false, cleaning = false;
  function scanOwned(root: string, label: string, phase: string, required = false): void {
    if (!existsSync(root)) {facts.push({kind: 'scan', label, phase, scanned: false, hits: null, status: 'UNAVAILABLE_UNSCANNED'}); if (required) cleanup.push({label: 'required-root-unscanned', confirmed: false}); return;}
    try {const count = scanSync(root); facts.push({kind: 'scan', label, phase, scanned: true, hits: count, status: 'SCANNED'}); if (count > 0) cleanup.push({label: 'profile-or-journal-canary', confirmed: false});}
    catch {facts.push({kind: 'scan', label, phase, scanned: false, hits: null, status: 'UNAVAILABLE_UNSCANNED'}); cleanup.push({label: 'root-scan', confirmed: false});}
  }
  function scanExtant(): void {
    if (journal) scanOwned(journal, 'JOURNAL', 'before-delete');
    for (const client of clients.values()) if (client.scratch) scanOwned(client.scratch, client.label, 'before-original-close');
  }
  function restoreAll(): boolean {
    const confirmed = restore(restorers, 'descriptor', cleanup); for (const client of clients.values()) delete client.sdk; setup.clear(); return confirmed;
  }
  function requireClient(sessionId: string): Client {const value = clients.get(sessionId); if (!value) throw Error('CLIENT'); return value;}
  function add(label: Label, csiId: string): Client {
    if (!fixture) throw Error('FIXTURE');
    const context = guidedContext(fixture.origin), destination = context.authoredInputs.inputs[0];
    if (!destination || !('value' in destination)) throw Error('DESTINATION'); destination.value = fixture.origin + '/login';
    context.authoredInputs.inputs.push({inputId: 'input-pass', sourceStepId: 'fill', kind: 'secretRef', secretId: 'PASS', provenance: {referenceKind: 'configuration', configurationRevision: context.configurationRevision, stepId: 'fill', referenceId: 'reference-pass', referenceName: 'PASS', kind: 'secretRef'}});
    const grant = ownershipSession(context); grant.scope.csiId = csiId; grant.scopeHash = hash(grant.scope); grant.runAuthorization.scopeHash = grant.scopeHash;
    context.scopeHash = grant.scopeHash; context.authoredInputs.scopeHash = grant.scopeHash; context.authoredInputsHash = hash(context.authoredInputs); context.leaseExpiresAt = grant.owner.leaseExpiresAt;
    const client: Client = {label, context, grant, assignment: assignmentFor(context), sdkRestores: [], launchAttempts: 0, launches: 0, starts: 0, dispatches: 0, nativeEntries: 0, nativePending: 0, closed: false};
    clients.set(context.sessionId, client); return client;
  }
  const route = (client: Client): string => '/internal/v2/studio/guided-sessions/' + client.context.sessionId;
  async function action(client: Client, step: string, operation: Action['operation'], secret?: string): Promise<void> {
    if (!client.evidence || !fixture) throw Error('EVIDENCE'); const proposed = proposal(client.context, client.evidence, step, operation);
    const prepared = await post(workerPort, route(client) + '/prepare', {...identity(client.context), proposal: proposed, requestDigest: hash(proposed), expiresAt: client.context.expiresAt}, {key: client.label + '-prepare-' + step}); status(prepared, 200);
    const request = dispatch(client.context, proposed, validate<BridgePreparation>('bridge', prepared.body, 'preparation'));
    const frame = secret === undefined ? request : {...request, secrets: [{secretId: 'PASS', value: secret, versionId: 'fixture-version', allowedOrigins: [fixture.origin]}]};
    let reply: Awaited<ReturnType<typeof post>>; try {reply = await post(workerPort, route(client) + '/dispatch', frame, {key: client.label + '-dispatch-' + step});} finally {if ('secrets' in frame) frame.secrets.forEach(entry => { (entry as {value: string}).value = ''; });}
    status(reply, 200); const outcome = validate<BridgeOutcome>('bridge', reply.body, 'outcome'); expect(outcome.ledger.state).toBe('SUCCEEDED'); expect(hits(Buffer.from(JSON.stringify(outcome)))).toBe(0);
  }
  async function stop(client: Client): Promise<void> {
    scanExtant(); status(await post(workerPort, route(client) + '/stop', {...identity(client.context), reason: 'CANCELLED'}, {key: client.label + '-stop'}), 200);
    await untilMs(() => client.closed && pids.filter(pid => pid.label === client.label).every(pid => !isAlive(pid.pid)), CLEANUP_MS);
    expect(client.scratch !== undefined && !existsSync(client.scratch)).toBe(true);
  }
  try {
    for (const name of ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'NODE_OPTIONS']) expect(Boolean(process.env[name])).toBe(false);
    fixture = await startSecretLoginFixture(CANARY); const ownedFixture = fixture; resources.push({label: 'fixture', release: ownedFixture.close});
    journal = await mkdtemp(join(tmpdir(), 'guided-stale-grant-')); const ownedJournal = journal; resources.push({label: 'journal', release: () => rm(ownedJournal, {recursive: true, force: true})});
    resources.push({label: 'descriptors', release: () => restoreAll() ? Promise.resolve() : Promise.reject(Error('DESCRIPTOR_RESTORE_UNCONFIRMED'))});
    for (const [sink, stream] of [['stdout', process.stdout], ['stderr', process.stderr]] as const) restorers.push(patch(stream, 'write', (_receiver, args, invoke) => {output.observe(sink, args[0], args[1]); return invoke();}));
    const a = add('A', 'CSI-A');
    restorers.push(patch(GuidedOwnership.prototype, 'checkGrant', (_receiver, args, invoke) => {
      const entry = args[0] as {assignment: {sessionId: string}}, candidate = args[1] as Session, client = requireClient(entry.assignment.sessionId);
      try {
        const returned = invoke() as Session;
        facts.push({kind: 'checkGrant', label: client.label, accepted: true, code: 'OK', at: performance.now()});
        if (client.label === 'A') acceptedA = structuredClone(returned);
        return returned;
      } catch (error) {
        const closed = error instanceof Error && responseCodes.has(error.message) ? error.message : 'OTHER';
        facts.push({kind: 'checkGrant', label: client.label, accepted: false, code: closed, candidateIsA: candidate.sessionId === a.context.sessionId, scopeIsA: candidate.scopeHash === a.context.scopeHash, intendedSessionMatches: candidate.sessionId === entry.assignment.sessionId, remainingLeaseMs: Date.parse(candidate.owner.leaseExpiresAt) - Date.now(), remainingExpiryMs: Date.parse(candidate.expiresAt) - Date.now(), at: performance.now()}); throw error;
      }
    }));
    for (const method of ['start', 'dispatch']) restorers.push(patch(GuidedRuntime.prototype, method, (receiver, _args, invoke) => {
      const runtime = receiver as GuidedRuntime, client = requireClient(runtime.currentIdentity.sessionId); if (method === 'start') client.starts++; else client.dispatches++;
      facts.push({kind: 'runtime-entry', label: client.label, method, at: performance.now()}); return invoke();
    }));
    const originalSnapshot = Object.getOwnPropertyDescriptor(PrivateInventory.prototype, 'snapshot')?.value as (...args: unknown[]) => unknown; if (typeof originalSnapshot !== 'function') throw Error('SNAPSHOT_METHOD');
    // The WI-2 inventory keeps its state private: its entries and byte count are read through the public snapshot(), a latched inventory (failed or disposed) reads as empty and disposed.
    const inventoryView = (receiver: object): InventoryView => {try {const entries = Reflect.apply(originalSnapshot, receiver, []) as [string, boolean][]; return {values: new Map(entries), bytes: entries.reduce((sum, [value]) => sum + Buffer.byteLength(value), 0), disposed: false, failed: false};} catch {return {values: new Map(), bytes: 0, disposed: true, failed: false};}};
    for (const method of ['merge', 'withhold', 'snapshot', 'dispose']) restorers.push(patch(PrivateInventory.prototype, method, (receiver, _args, invoke) => {
      let tag = inventoryTags.get(receiver); if (tag === undefined) {tag = ++nextInventory; inventoryTags.set(receiver, tag); inventoryOwners.set(receiver, launching);}
      const observedTag = tag;
      const record = (phase: string): void => {const view = inventoryView(receiver); facts.push({kind: 'inventory', label: inventoryOwners.get(receiver) ?? 'UNKNOWN', tag: observedTag, method, phase, size: view.values.size, bytes: view.bytes, containsA: view.values.has(CANARY), disposed: view.disposed, failed: view.failed});};
      record('before'); const returned = invoke(); record('after'); return returned;
    }));
    restorers.push(patch(chromium, 'launchPersistentContext', (_receiver, args, invoke) => {
      const client = [...clients.values()].find(value => value.label === launching); if (!client) throw Error('CLIENT');
      const scratch = typeof args[0] === 'string' && basename(args[0]) === 'browser-profile' ? dirname(args[0]) : null; if (scratch) client.scratch = scratch;
      client.launchAttempts++; const before = descendantsOf(process.pid);
      let original: Promise<BrowserContext>; try {original = invoke() as Promise<BrowserContext>;} catch (error) {if (scratch) scanOwned(scratch, client.label, 'SDK-sync-reject', true); throw error;}
      const prepared = original.then(async context => {
        if (cleaning) {await bounded('late-context', () => context.close(), performance.now() + CLEANUP_MS, cleanup); throw Error('CONTEXT_LOST');}
        client.sdk = new WeakRef(context); client.launches++;
        restorers.push(() => {if (!restore(client.sdkRestores, 'SDK-descriptor', cleanup)) throw Error('DESCRIPTOR_RESTORE_UNCONFIRMED');});
        for (const pid of descendantsOf(process.pid)) if (!before.includes(pid)) pids.push({label: client.label, pid});
        try {
          client.sdkRestores.push(patch(context, 'newCDPSession', (_r, _a, open) => {
            const pending = open() as Promise<object>; void pending.then(session => {
              if (cleaning || client.closed) return;
              client.sdkRestores.push(patch(session, 'send', (_s, arguments_, send) => {
                const result = send() as Promise<unknown>, parameters = arguments_[1] as {functionDeclaration?: unknown} | undefined;
                if (arguments_[0] === 'Runtime.callFunctionOn' && typeof parameters?.functionDeclaration === 'string' && parameters.functionDeclaration.includes('this.fillPasswordResult')) {
                  client.nativeEntries++; client.nativePending++; facts.push({kind: 'native-entry', label: client.label, at: performance.now()});
                  const ended = (): void => {client.nativePending--; facts.push({kind: 'native-end', label: client.label, at: performance.now()});}; void result.then(ended, ended);
                }
                return result;
              }));
            }, () => {facts.push({kind: 'CDP-open-failed', label: client.label});}); return pending;
          }));
        } catch (error) {scanExtant(); await bounded('SDK-setup-close', () => context.close(), performance.now() + CLEANUP_MS, cleanup); restore(client.sdkRestores, 'SDK-setup-descriptor', cleanup); delete client.sdk; throw error;}
      }, (error: unknown) => {if (scratch) scanOwned(scratch, client.label, 'SDK-reject-before-production-disposal', true); throw error;});
      setup.set(client.label, prepared); void prepared.catch(() => {facts.push({kind: 'SDK-setup-failed', label: client.label});}); return original;
    }));
    const callbacks = createServer({...testTls, requestCert: true, rejectUnauthorized: true}, (req, res) => {void (async () => {
      expect(req.socket).toBeInstanceOf(TLSSocket); expect((req.socket as TLSSocket).authorized).toBe(true); expect((req.socket as TLSSocket).getPeerCertificate().fingerprint256).toBe(testFingerprint);
      verifyGuidedJwt(req.headers.authorization, {...jwtPolicy, subject: 'worker-one'}, 'studio-guided-controller', 'owning-worker');
      let text = ''; for await (const chunk of req) text += (chunk as Buffer).toString(); const body = JSON.parse(text) as unknown, leaf = req.url?.split('/').at(-1) ?? '';
      const requestHits = hits(Buffer.from(text)); facts.push({kind: 'callback-scan', route: leaf, hits: requestHits, certificateAuthorized: true, certificateMatches: true, jwtVerified: true}); if (requestHits > 0) cleanup.push({label: 'public-callback-canary', confirmed: false}); expect(requestHits).toBe(0);
      if (leaf === 'claim') {
        const command = validate<CommandsClaim>('commands', body, 'claim'), client = requireClient(command.sessionId);
        let response: Session;
        if (client.label === 'PROBE') {
          if (!acceptedA) throw Error('A_GRANT'); response = acceptedA;
          facts.push({kind: 'probe-claim-delivered', label: client.label, at: performance.now(), remainingLeaseMs: Date.parse(response.owner.leaseExpiresAt) - Date.now(), remainingExpiryMs: Date.parse(response.expiresAt) - Date.now()});
        } else {
          client.grant.owner.leaseExpiresAt = new Date(Math.min(Date.now() + 30000, Date.parse(client.grant.expiresAt))).toISOString(); response = client.grant;
        }
        res.once('finish', () => {facts.push({kind: 'claim-http-finish', label: client.label, status: 202, at: performance.now()});}); res.writeHead(202); res.end(JSON.stringify(response)); return;
      }
      const envelope = body as {sessionId?: string; assignment?: {sessionId: string}}, sessionId = envelope.sessionId ?? envelope.assignment?.sessionId;
      if (sessionId) {
        const client = requireClient(sessionId);
        if (leaf === 'bootstrap-evidence') client.evidence = validate<BridgeBootstrap>('bridge', body, 'bootstrap').executionEvidence;
        if (leaf === 'observations') {
          const notice = validate<BridgeObservation>('bridge', body, 'observation'); client.observation = notice.observation;
          client.evidence = {kind: 'observedDocument', sessionId, contextId: client.context.contextId, documentId: notice.observation.documentId, generation: notice.observation.generation, origin: notice.observation.origin, observationHash: hash(notice.observation)};
        }
        facts.push({kind: 'callback', label: client.label, route: leaf});
      }
      res.writeHead(202); res.end('{}');
    })().catch(() => {if (!res.headersSent) res.writeHead(500); res.end('{}');});});
    resources.push({label: 'callbacks', release: () => {callbacks.closeAllConnections(); return new Promise<void>((done, reject) => callbacks.close(error => {if (error) reject(error); else done();}));}});
    await new Promise<void>((done, reject) => {callbacks.once('error', reject); callbacks.listen(0, '127.0.0.1', () => {callbacks.off('error', reject); done();});}); const at = callbacks.address(); if (!at || typeof at === 'string') throw Error('PORT');
    const controller = {baseUrl: 'https://127.0.0.1:' + String(at.port), tls: testTls, controllerCertificateFingerprint256: testFingerprint, token: () => Promise.resolve(jwt({aud: 'studio-guided-controller', role: 'owning-worker', sub: 'worker-one'}))};
    const originalClaim = guidedClaimClient(controller);
    const options: Parameters<typeof createGuidedServer>[0] = {
      workerId: 'worker-one', capacity: 1, allowedDomains: TEST_DOMAINS, journalDirectory: journal, tls: testTls, controllerJwt: jwtPolicy, controllerCertificateFingerprint256: testFingerprint, callback: guidedCallback(controller),
      diagnosticStderr: text => {output.observe('diagnostic', text); process.stderr.write(text);},
      claim: (command, key, timeout, signal) => {
        const original = originalClaim(command, key, timeout, signal); void original.then(received => {
          const client = requireClient(command.sessionId); facts.push({kind: 'claim-ack', label: client.label, candidateIsA: received.sessionId === a.context.sessionId, unchangedA: client.label === 'PROBE' && acceptedA !== null && canonical(received) === canonical(acceptedA), at: performance.now()});
        }, () => {facts.push({kind: 'claim-failed', at: performance.now()});}); return original;
      },
      launch: async (...args: Parameters<typeof launchGuidedBrowser>) => {
        const client = requireClient(args[0].sessionId); launching = client.label; let browser: Awaited<ReturnType<typeof launchGuidedBrowser>>;
        try {browser = await launchGuidedBrowser(...args);} catch (error) {
          scanExtant(); const deadline = performance.now() + CLEANUP_MS; const context = client.sdk?.deref(); if (context) await bounded('launch-context', () => context.close(), deadline, cleanup); if (error instanceof GuidedLaunchFailure) await bounded('owned-launch-cleanup', error.close, deadline, cleanup);
          restore(client.sdkRestores, 'launch-descriptor', cleanup); delete client.sdk; setup.delete(client.label); throw error;
        }
        try {await setup.get(client.label); if (!browser.scratchDirectory || !browser.preferenceEvidence) throw Error('PROFILE'); client.scratch = browser.scratchDirectory; client.preferences = browser.preferenceEvidence;}
        catch (error) {scanExtant(); await bounded('setup-browser', () => browser.close(), performance.now() + CLEANUP_MS, cleanup); restore(client.sdkRestores, 'setup-descriptor', cleanup); delete client.sdk; setup.delete(client.label); throw error;}
        return adaptInProcess({...browser, close: () => {
          scanExtant(); const original = browser.close(); void original.then(() => {client.closed = true; facts.push({kind: 'actual-close', label: client.label, at: performance.now()}); restore(client.sdkRestores, 'closed-descriptor', cleanup); delete client.sdk; setup.delete(client.label);}, () => {facts.push({kind: 'close-failed', label: client.label});}); return original;
        }}, args[0].allowedDomains);
      },
    };
    worker = createGuidedServer(options); const ownedWorker = worker; await new Promise<void>((done, reject) => {ownedWorker.server.once('error', reject); ownedWorker.server.listen(0, '127.0.0.1', () => {ownedWorker.server.off('error', reject); done();});}); const address = worker.server.address(); if (!address || typeof address === 'string') throw Error('PORT'); workerPort = address.port;
    status(await post(workerPort, route(a) + '/assign', a.assignment, {fence: null, key: 'A-assign'}), 200); status(await post(workerPort, route(a) + '/context', a.context, {key: 'A-context'}), 200);
    await action(a, 'nav', stepOp('await page.goto(inputs["input-nav"]);', { uses: [{ kind: 'input', id: 'input-nav' }] })); const observation = a.observation; if (!observation) throw Error('OBSERVATION'); expect(observation.coverage.passwordControls).toBe(1);
    await action(a, 'fill', stepOp('await page.locator(\'input[type="password"]\').fill(secrets["PASS"]);', { uses: [{ kind: 'secret', id: 'PASS' }] }), CANARY);
    const seen = a.observation, signIn = seen && Object.entries(seen.facts).find(([, fact]) => fact.name === 'Sign in'); if (!seen || !signIn) throw Error('SIGN_IN');
    await action(a, 'submit', stepOp('await page.getByRole("button", { name: "Sign in", exact: true }).click();'));
    expect(fixture.receipts().length).toBe(1); expect(fixture.receipts()[0]?.accepted === true && fixture.receipts()[0]?.password === CANARY).toBe(true);
    expect(a.launchAttempts).toBe(1); expect(a.launches).toBe(1); expect(a.nativeEntries).toBe(1); expect(a.nativePending).toBe(0); expect(pids.some(pid => pid.label === 'A' && isAlive(pid.pid))).toBe(true);
    const withhold = facts.filter(fact => fact.kind === 'inventory' && fact.label === 'A' && fact.phase === 'after' && fact.containsA === true).at(-1); expect(withhold !== undefined).toBe(true); expect(Number(withhold?.size)).toBeGreaterThan(0); expect(Number(withhold?.bytes)).toBeGreaterThan(0);
    if (!a.scratch || !a.preferences) throw Error('PROFILE'); expect(a.preferences.effective).toEqual({credentialsEnableService: false, autofillProfileEnabled: false, autofillCreditCardEnabled: false, restoreOnStartup: 5}); expect(a.preferences.activeProfilePath).toBe(await realpath(join(a.scratch, 'browser-profile', 'Default'))); expect(await scan(a.scratch)).toBe(0);
    await stop(a); expect(facts.some(fact => fact.kind === 'inventory' && fact.label === 'A' && fact.method === 'dispose' && fact.phase === 'after' && fact.size === 0 && fact.bytes === 0 && fact.disposed === true)).toBe(true);
    const probe = add('PROBE', 'CSI-B'); let retained = acceptedA as Session | null; if (!retained) throw Error('A_GRANT');
    const remainingLease = Date.parse(retained.owner.leaseExpiresAt) - Date.now(), remainingExpiry = Date.parse(retained.expiresAt) - Date.now(); expect(remainingLease).toBeGreaterThan(0); expect(remainingExpiry).toBeGreaterThan(0);
    expect(probe.context.sessionId === a.context.sessionId).toBe(false); expect(probe.context.contextId === a.context.contextId).toBe(false); expect(probe.context.scopeHash === a.context.scopeHash).toBe(false);
    const attemptsBefore = [...clients.values()].reduce((sum, client) => sum + client.launchAttempts, 0), nativeBefore = [...clients.values()].reduce((sum, client) => sum + client.nativeEntries, 0), receiptsBefore = fixture.receipts().length;
    const denied = await post(workerPort, route(probe) + '/assign', probe.assignment, {fence: null, key: 'PROBE-assign'}); status(denied, 409); expect(code(denied.body)).toBe('CONTEXT_LOST');
    expect(facts.filter(fact => fact.kind === 'probe-claim-delivered').length).toBe(1); expect(facts.some(fact => fact.kind === 'claim-http-finish' && fact.label === 'PROBE' && fact.status === 202)).toBe(true); expect(facts.some(fact => fact.kind === 'claim-ack' && fact.label === 'PROBE' && fact.unchangedA === true)).toBe(true);
    const rejection = facts.filter(fact => fact.kind === 'checkGrant' && fact.label === 'PROBE').at(-1); expect(rejection).toMatchObject({accepted: false, code: 'IDENTITY_MISMATCH', candidateIsA: true, scopeIsA: true, intendedSessionMatches: false}); expect(Number(rejection?.remainingLeaseMs)).toBeGreaterThan(0); expect(Number(rejection?.remainingExpiryMs)).toBeGreaterThan(0);
    const delivered = facts.find(fact => fact.kind === 'probe-claim-delivered'); expect(Number(delivered?.remainingLeaseMs)).toBeGreaterThan(0); expect(Number(delivered?.remainingExpiryMs)).toBeGreaterThan(0);
    expect([...clients.values()].reduce((sum, client) => sum + client.launchAttempts, 0) - attemptsBefore).toBe(0); expect([...clients.values()].reduce((sum, client) => sum + client.nativeEntries, 0) - nativeBefore).toBe(0); expect(fixture.receipts().length - receiptsBefore).toBe(0);
    expect(probe.starts).toBe(0); expect(probe.dispatches).toBe(0); expect(probe.launchAttempts).toBe(0); expect(probe.launches).toBe(0); expect(probe.scratch === undefined).toBe(true); expect(probe.evidence === undefined).toBe(true); expect(probe.observation === undefined).toBe(true); expect(facts.some(fact => fact.kind === 'callback' && fact.label === 'PROBE' && ['bootstrap-evidence', 'observations'].includes(String(fact.route)))).toBe(false);
    retained = null; acceptedA = null; // Both test-owned retired grant references drop before separate legitimate recovery.
    const b = add('B', 'CSI-B'); expect(b.assignment.sessionId === probe.assignment.sessionId).toBe(false); status(await post(workerPort, route(b) + '/assign', b.assignment, {fence: null, key: 'B-assign'}), 200); status(await post(workerPort, route(b) + '/context', b.context, {key: 'B-context'}), 200);
    expect(b.starts).toBe(1); expect(b.launches).toBe(1); expect(b.nativeEntries).toBe(0); expect(b.dispatches).toBe(0); expect(b.scratch === a.scratch).toBe(false); expect((await b.sdk?.deref()?.cookies(fixture.origin))?.length).toBe(0); expect(fixture.receipts().length).toBe(receiptsBefore);
    const freshInventory = facts.filter(fact => fact.kind === 'inventory' && fact.label === 'B' && fact.phase === 'after').at(-1); expect(freshInventory !== undefined).toBe(true); expect(freshInventory?.containsA).toBe(false); expect(freshInventory?.tag === withhold?.tag).toBe(false);
    if (!b.scratch || !b.preferences) throw Error('PROFILE'); expect(b.preferences.effective).toEqual({credentialsEnableService: false, autofillProfileEnabled: false, autofillCreditCardEnabled: false, restoreOnStartup: 5}); expect(b.preferences.activeProfilePath).toBe(await realpath(join(b.scratch, 'browser-profile', 'Default'))); expect(await scan(b.scratch)).toBe(0); await stop(b);
    expect(output.total()).toBe(0); expect(await scan(journal)).toBe(0);
  } catch (error) {primaryFailed = true; throw error;}
  finally {
    cleaning = true; acceptedA = null; scanExtant(); const deadline = performance.now() + CLEANUP_MS;
    try {if (worker) {const current = worker; await bounded('worker', () => current.close(), deadline, cleanup);}}
    finally {
      worker = undefined;
      for (const client of clients.values()) if (!client.closed) {const context = client.sdk?.deref(); if (context) await bounded('SDK-context', () => context.close(), deadline, cleanup);}
      scanExtant(); if (output.total() > 0) cleanup.push({label: 'output-canary', confirmed: false});
      for (const resource of [...resources].reverse()) {
        if (resource.label === 'journal' && pids.some(pid => isAlive(pid.pid))) {cleanup.push({label: 'journal-retained-live-writers', confirmed: false}); continue;}
        await bounded(resource.label, resource.release, deadline, cleanup);
      }
      if (restorers.length > 0) await bounded('descriptor-retry', () => restoreAll() ? Promise.resolve() : Promise.reject(Error('DESCRIPTOR_RESTORE_UNCONFIRMED')), deadline, cleanup);
      clients.clear(); setup.clear(); resources.length = 0; fixture = undefined;
      const serialized = JSON.stringify({primaryFailed, facts, pids, cleanup, outputHits: output.counts, outputObserved: output.observed, pendingDescriptorRestorations: restorers.length, unresolved: cleanup.some(fact => !fact.confirmed) || restorers.length > 0, allTrackedPidsGone: pids.every(pid => !isAlive(pid.pid)), sourceGuidedWorker: true, compiledWorker: false, coreVaultAuthorizationProved: false, physicalHeapErasureProved: false}, null, 2) + '\n';
      if (hits(Buffer.from(serialized)) > 0) cleanup.push({label: 'scalar-evidence-canary', confirmed: false});
      else await bounded('evidence', () => writeFile(evidencePath('STUDIO-OBS-007/r-stale-grant-candidate/native-facts.json'), serialized), deadline, cleanup);
    }
  }
  if (!primaryFailed && (cleanup.some(fact => !fact.confirmed) || restorers.length > 0)) throw Error('STALE_GRANT_CLEANUP_UNCONFIRMED');
}, 60000);
