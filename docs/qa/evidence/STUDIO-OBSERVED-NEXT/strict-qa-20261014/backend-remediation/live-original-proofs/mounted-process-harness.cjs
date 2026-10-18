'use strict';
// Source-free original ar-mounted-rules process proof. All paths/processes/configuration are owned
// by this harness. It launches the actual frozen dist entrypoint and never imports the parser.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const net = require('node:net');
const https = require('node:https');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../../../../../../..');
const RUNNER = path.join(ROOT, 'studio-runner');
const OUTPUT = __dirname;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
const children = pid => {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
    .map(line => line.trim().split(/\s+/).map(Number));
  const owned = new Set([pid]);
  let changed = true;
  while (changed) { changed = false; for (const [child, parent] of rows) if (owned.has(parent) && !owned.has(child)) { owned.add(child); changed = true; } }
  owned.delete(pid); return [...owned];
};
const listening = port => new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port });
  let done = false;
  const finish = value => { if (!done) { done = true; socket.destroy(); resolve(value); } };
  socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.setTimeout(100, () => finish(false));
});
const serverListen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
const serverClose = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
async function inventory(directory) {
  let entries; try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const found = [];
  for (const entry of entries) { const target = path.join(directory, entry.name); assert(!entry.isSymbolicLink()); if (entry.isDirectory()) found.push(...(await inventory(target)).map(x => entry.name + '/' + x)); else found.push(entry.name + ':' + sha(await fs.readFile(target))); }
  return found.sort();
}
async function main() {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'strict-mounted-worker-'));
  await fs.chmod(work, 0o700);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'strict-mounted-outside-'));
  const canary = path.join(outside, 'keep'); await fs.writeFile(canary, 'outside-owned-canary');
  const record = { startedUtc: new Date().toISOString(), status: 'RUNNING', runtime: { node: process.version, executable: process.execPath }, variants: [], sourceWrites: false, finalAggregateWaived: false };
  let callbacks; let current; let currentClosed; let known = new Set();
  let primary;
  try {
    const key = await fs.readFile(path.join(RUNNER, 'test/fixtures/guided-tls/key.fixture'));
    const cert = await fs.readFile(path.join(RUNNER, 'test/fixtures/guided-tls/cert.fixture'));
    let callbackCount = 0;
    callbacks = https.createServer({ key, cert, ca: cert, requestCert: true, rejectUnauthorized: true }, (req, res) => { callbackCount++; req.resume(); res.writeHead(503); res.end(); });
    const callbackPort = await serverListen(callbacks);
    const reserve = net.createServer(); const workerPort = await serverListen(reserve); await serverClose(reserve);
    const issuer = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicFile = path.join(work, 'issuer-public.pem'); await fs.writeFile(publicFile, issuer.publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o600 });
    const tokenFile = path.join(work, 'unused-fixture-token'); await fs.writeFile(tokenFile, 'unused-no-session-token', { mode: 0o600 });
    const scratch = path.join(work, 'scratch'); await fs.mkdir(scratch, { mode: 0o700 });
    const journal = path.join(work, 'journal'); await fs.mkdir(journal, { mode: 0o700 });
    const objects = path.join(work, 'objects'); await fs.mkdir(objects, { mode: 0o700 });
    const mounted = path.join(work, 'worker.json');
    const config = { workerId: 'strict-mounted-worker', host: '127.0.0.1', port: workerPort, journalDirectory: journal,
      tlsKeyFile: path.join(RUNNER, 'test/fixtures/guided-tls/key.fixture'), tlsCertFile: path.join(RUNNER, 'test/fixtures/guided-tls/cert.fixture'), tlsCaFile: path.join(RUNNER, 'test/fixtures/guided-tls/cert.fixture'),
      controllerIssuer: 'strict-fixture-issuer', controllerSubject: 'strict-fixture-controller', controllerPublicKeyFile: publicFile,
      controllerCertificateFingerprint256: new crypto.X509Certificate(cert).fingerprint256, callbackBaseUrl: 'https://127.0.0.1:' + callbackPort, callbackTokenFile: tokenFile };
    const env = { ...process.env };
    for (const name of Object.keys(env)) if (name.startsWith('STUDIO_RUNNER_') || ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'NODE_OPTIONS', 'STUDIO_GUIDED_CONFIG_FILE'].includes(name)) delete env[name];
    env.STUDIO_GUIDED_CONFIG_FILE = mounted; env.STUDIO_RUNNER_OBJECT_STORE_DIR = objects; env.TMPDIR = scratch;
    const entrypoint = path.join(RUNNER, 'dist/run/guidedMain.js');
    const source = await fs.readFile(path.join(RUNNER, 'src/run/guidedMain.ts'), 'utf8');
    const parser = await fs.readFile(path.join(RUNNER, 'src/run/guidedConfig.ts'), 'utf8');
    const positions = { parse: source.indexOf('const config = parseGuidedMountedConfig'), tls: source.indexOf('const tls ='), server: source.indexOf('const app = createGuidedServer'), listen: source.indexOf('app.server.listen(') };
    assert(positions.parse >= 0 && positions.parse < positions.tls && positions.tls < positions.server && positions.server < positions.listen);
    assert(parser.includes("!Object.hasOwn(config, 'rules')"));
    record.sourceOrdering = { positions, mainSha256: sha(source), parserSha256: sha(parser), entrypointSha256: sha(await fs.readFile(entrypoint)), reasoning: 'Actual parse rejects rules before TLS/evidence/server construction/listen. Catch sets exit1 and cannot continue. Port polling is finite sampling and is not claimed alone to prove every instant.' };
    const envHash = sha(JSON.stringify(Object.keys(env).sort().map(name => [name, env[name]])));
    const baselineBytes = JSON.stringify(config);
    const variants = [{ label: 'baseline', rules: undefined }, ...['permittedBusinessData', 'nonsecretApproved', 'structuralOnly'].map(classification => ({ label: classification, rules: [{ testId: 'source', name: 'Business reference', policyRuleId: 'reference-read', classification, ...(classification === 'nonsecretApproved' ? { accessibleName: 'Destination' } : {}) }] }))];
    let baselineScratch; let baselineObjects; let baselineJournal;
    for (const variant of variants) {
      assert.equal(await listening(workerPort), false);
      const input = structuredClone(config); if (variant.rules !== undefined) input.rules = variant.rules;
      const withoutRules = { ...input }; delete withoutRules.rules; assert.deepEqual(withoutRules, config);
      await fs.writeFile(mounted, JSON.stringify(input), { mode: 0o600 });
      assert.equal(sha(JSON.stringify(Object.keys(env).sort().map(name => [name, env[name]]))), envHash);
      const row = { label: variant.label, command: [process.execPath, entrypoint], cwd: RUNNER, envSha256: envHash, inputSha256: sha(JSON.stringify(input)), baselineWithoutRulesSha256: sha(JSON.stringify(withoutRules)), onlyDelta: variant.rules === undefined ? [] : ['rules'], rules: variant.rules, timeline: [], childPids: [] };
      assert.equal(row.baselineWithoutRulesSha256, sha(baselineBytes));
      record.variants.push(row);
      const start = performance.now(); let stdout = ''; let stderr = ''; let exit = null;
      current = spawn(process.execPath, [entrypoint], { cwd: RUNNER, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      row.pid = current.pid; known = new Set([current.pid]);
      current.stdout.on('data', bytes => { stdout += bytes.toString(); }); current.stderr.on('data', bytes => { stderr += bytes.toString(); });
      currentClosed = new Promise((resolve, reject) => { current.once('error', reject); current.once('close', (code, signal) => { exit = { code, signal }; resolve(exit); }); });
      let becameReady = false;
      while (performance.now() - start < 10000) {
        const listens = await listening(workerPort); const descendants = children(current.pid); descendants.forEach(pid => known.add(pid));
        row.timeline.push({ elapsedMs: Math.round(performance.now() - start), listening: listens, ownedChildren: descendants.length, exited: exit !== null });
        if (variant.rules === undefined && listens) { becameReady = true; break; }
        if (variant.rules !== undefined) assert.equal(listens, false, 'forbidden mounted worker listened');
        if (exit !== null) break; await delay(10);
      }
      if (variant.rules === undefined) {
        assert.equal(becameReady, true, 'valid baseline never reached real listening state'); assert.equal(exit, null);
        assert.equal(children(current.pid).length, 0); assert.equal(callbackCount, 0);
        current.kill('SIGTERM'); await Promise.race([currentClosed, delay(5000).then(() => { throw new Error('baseline normal shutdown timeout'); })]);
        assert.deepEqual(exit, { code: 0, signal: null });
        baselineScratch = await inventory(scratch); baselineObjects = await inventory(objects); baselineJournal = await inventory(journal);
      } else {
        assert.notEqual(exit, null, 'bad mounted worker exceeded original10s startup bound');
        assert.deepEqual(exit, { code: 1, signal: null }); assert.equal(stderr, 'GUIDED_WORKER_UNAVAILABLE\n'); assert.equal(stdout, '');
        assert.deepEqual(await inventory(scratch), baselineScratch); assert.deepEqual(await inventory(objects), baselineObjects); assert.deepEqual(await inventory(journal), baselineJournal);
      }
      await currentClosed;
      row.exit = exit; row.stdoutSha256 = sha(stdout); row.stderrSha256 = sha(stderr); row.stderrFixedCode = variant.rules === undefined ? null : 'GUIDED_WORKER_UNAVAILABLE';
      row.finalPortListening = await listening(workerPort); assert.equal(row.finalPortListening, false);
      row.childPids = [...known].filter(pid => pid !== current.pid); assert.equal(row.childPids.length, 0);
      assert([...known].every(pid => !alive(pid)), 'known owned PID remains alive');
      assert.equal(callbackCount, 0); row.callbackCount = callbackCount; row.browserChildren = 0; row.status = 'PASS';
      await fs.writeFile(path.join(OUTPUT, 'mounted-' + variant.label + '.stdout.log'), stdout); await fs.writeFile(path.join(OUTPUT, 'mounted-' + variant.label + '.stderr.log'), stderr);
      current = null;
    }
    record.status = 'PASS'; record.baselineScratchEntries = baselineScratch.length; record.sessionRpcs = 0; record.browserEffects = 0; record.allVariantsSameArgsEnvironment = true;
  } catch (error) { primary = error; record.status = 'FAIL'; record.failureCode = String(error.name || 'Error'); record.failureMessage = String(error.message).replaceAll(work, '<owned-temp>').replaceAll(outside, '<outside-owned-temp>'); }
  finally {
    try {
      if (current && current.exitCode === null && current.signalCode === null) { current.kill('SIGTERM'); await Promise.race([currentClosed, delay(5000)]); if (current.exitCode === null && current.signalCode === null) { process.kill(-current.pid, 'SIGKILL'); await currentClosed; } }
      assert([...known].every(pid => !alive(pid)), 'owned process survives cleanup');
      if (callbacks) await serverClose(callbacks);
      assert.equal(await fs.readFile(canary, 'utf8'), 'outside-owned-canary');
      await fs.rm(work, { recursive: true, force: true }); assert.equal(await fs.stat(work).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false);
      record.ownedScratchRemoved = true; record.outsideCanaryPreserved = true;
    } catch (error) { record.status = 'FAIL'; record.cleanupFailureCode = error.name; if (!primary) primary = error; }
    await fs.rm(outside, { recursive: true, force: true });
    record.completedUtc = new Date().toISOString();
    record.harnessSha256 = sha(await fs.readFile(__filename));
    record.redactionPolicy = 'No mounted config,keys,token,headers or bodies retained; reports include only owned PID/port sampling,fixedcodes,known input rules and SHA256 digests. Raw stdout/stderr retained only after exactfixed-code assertions; source-order proof is explicit finite-sampling complement.';
    await fs.writeFile(path.join(OUTPUT, 'mounted-process-results.json'), JSON.stringify(record, null, 2) + '\n');
  }
  if (primary) throw primary;
  process.stdout.write('MOUNTED_PROCESS_PROOF_PASS baseline +3 forbidden rules; owned cleanup confirmed\n');
}
main().catch(() => { process.stderr.write('MOUNTED_PROCESS_PROOF_FAILED\n'); process.exitCode = 1; });
