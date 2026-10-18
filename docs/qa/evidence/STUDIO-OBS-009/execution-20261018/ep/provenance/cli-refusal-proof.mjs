// Scratch: the live `benchmark` command with a REFUSED ledger must exit non-zero and make zero API calls.
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [,, ledger, runner] = process.argv;
let hits = 0;
const server = createServer((_q, r) => { hits += 1; r.end('{}'); });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const dir = mkdtempSync(join(tmpdir(), 'ep-refusal-'));
const config = join(dir, 'config.json');
writeFileSync(config, JSON.stringify({ apiBaseUrl: `http://127.0.0.1:${port}/api/v1/studio`, csiId: '60406', environmentId: 'dev', applicationId: 'app', admissionLedger: ledger }));
const out = join(dir, 'out');
const result = spawnSync(process.execPath, ['evaluation/cli.mjs', 'benchmark', config, out], { cwd: runner, env: { ...process.env, STUDIO_EVAL_API_TOKEN: 'synthetic-token-not-a-secret' }, encoding: 'utf8' });
console.log(JSON.stringify({ exitCode: result.status, stderr: result.stderr.trim(), httpRequestsReachingTheApiBase: hits, evidenceDirectoryCreated: existsSync(out) }, null, 2));
server.close(); rmSync(dir, { recursive: true, force: true });
process.exitCode = result.status === 2 && hits === 0 && !existsSync(out) ? 0 : 1;
