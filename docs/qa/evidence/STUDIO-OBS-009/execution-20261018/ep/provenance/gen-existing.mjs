// Scratch: step text / expected outcome for the cases that ride on EXISTING fixtures (D1, D3, incremental x2).
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.argv[2];
const AUTHOR = '@dev (Dex) EP lane draft; @qa (Quinn) review PENDING';
const uuid = (caseId, i) => { const h = createHash('sha256').update(`${caseId}:${String(i)}`).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
const ctx = { entries: [], evidenceReferences: [] };
const CONFIG = { environment: 'controlled-fixture', browser: 'chromium', viewport: { width: 1280, height: 720 }, timeoutSeconds: 30, waitStrategy: 'domcontentloaded' };
const write = (dir, name, v) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), JSON.stringify(v, null, 2) + '\n'); };

// D1: OBS-007 secret-login fixture (test/fixtures/secret-login/server.ts), author-written login with a secretRef.
{
  const id = 'D1-login-secret-fixture';
  const steps = ['Open <var loginUrl>.', 'Fill User with <var USERNAME>.', 'Fill the password field with <secret LOGIN_PW>.', 'Click Sign in.', 'Check that the heading says Home.', 'Click Reports.', 'Check that the heading says Reports.'];
  write(join(OUT, 'd1'), 'step-text.json', { schemaVersion: 1, caseId: id, authoredBy: AUTHOR,
    authoring: { authoringSchemaVersion: 2, globalContext: { entries: [], evidenceReferences: [] }, steps: steps.map((text, i) => ({ id: uuid(id, i + 1), text, context: ctx })) },
    configuration: CONFIG,
    variables: [{ name: 'loginUrl', kind: 'plain', value: '${fixtureOrigin}/login' }, { name: 'USERNAME', kind: 'plain', value: 'pilot-user' }, { name: 'LOGIN_PW', kind: 'secretRef', secretId: 'LOGIN_PW' }] });
  write(join(OUT, 'd1'), 'expected-outcome.json', { schemaVersion: 1, caseId: id, kind: 'EXPECTED_OUTCOME', authoredBy: AUTHOR,
    note: 'Receipts come from the existing secret-login fixture GET /__receipts (adapted by the harness: id and password are dropped, accepted is kept). The planted password canary must appear in no harness output (AC-10).',
    class: 'P',
    receipts: { phases: { run: { actions: [{ type: 'login.submit', fields: { username: 'pilot-user', accepted: true } }] } }, views: { required: [], allowed: [] } },
    session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } });
}
// D3: guided-dataflow fixture in mixedVisible mode (value in <output>, reachable by a governed grant).
{
  const id = 'D3-dataflow-multistep';
  const steps = ['Open <var sourceUrl>.', 'Read the visible business reference from the source into the reference binding.', 'Open <var destinationUrl>.', 'Fill Destination with the captured reference.', 'Click Submit.', 'Assert that Submit remains visible.'];
  write(join(OUT, 'd3'), 'step-text.json', { schemaVersion: 1, caseId: id, authoredBy: AUTHOR,
    authoring: { authoringSchemaVersion: 2, globalContext: { entries: [], evidenceReferences: [] }, steps: steps.map((text, i) => ({ id: uuid(id, i + 1), text, context: ctx })) },
    configuration: CONFIG,
    variables: [{ name: 'sourceUrl', kind: 'plain', value: '${fixtureOrigin}/source' }, { name: 'destinationUrl', kind: 'plain', value: '${fixtureOrigin}/destination' }] });
  write(join(OUT, 'd3'), 'expected-outcome.json', { schemaVersion: 1, caseId: id, kind: 'EXPECTED_OUTCOME', authoredBy: AUTHOR,
    note: 'Protocol PR-1: one token-free guided Run submits once, finalization adds zero receipts, two later replays reuse the artifact (one submit each). The submitted body must equal the source value of THAT session (${sourceValue}); the fixture serves a fresh value per session.',
    class: 'P',
    receipts: { phases: {
      run: { actions: [{ type: 'receipt.post', fields: { body: '${sourceValue}' } }] },
      finalize: { actions: [] },
      replay1: { actions: [{ type: 'receipt.post', fields: { body: '${sourceValue}' } }] },
      replay2: { actions: [{ type: 'receipt.post', fields: { body: '${sourceValue}' } }] } },
      views: { required: [], allowed: [] } },
    session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } });
}
// Incremental cases: step text is the STUDIO-OBS-015 case file itself (consumed unchanged).
for (const [key, id] of [['inc-edit4', 'incremental-edit-step-4'], ['inc-insert', 'incremental-insert-step']]) {
  write(join(OUT, key), 'expected-outcome.json', { schemaVersion: 1, caseId: id, kind: 'EXPECTED_OUTCOME', authoredBy: AUTHOR,
    note: 'Run-record oracle for the STUDIO-OBS-015 case file (its "expected" and "requiredOracles" are consumed unchanged). Receipts are the guided-dataflow /receipt bodies in order: the base 10-step session submits the base value, the incremental session submits the fresh value under the stable binding. Finalize and the merged-revision replay model calls are counted in the run record.',
    class: 'P',
    receipts: { phases: {
      base: { actions: [{ type: 'receipt.post', fields: { body: 'base-reference-value' } }] },
      incremental: { actions: [{ type: 'receipt.post', fields: { body: 'fresh-current-session-reference' } }] },
      finalize: { actions: [] } },
      views: { required: [], allowed: [] } },
    incremental: { prefixLearnedSteps: 0, prefixReusedSteps: 3, finalizeModelCalls: 0, relearnedFromStepNumber: 4, relearnedThroughStepNumber: key === 'inc-edit4' ? 10 : 11 },
    outOfBand: ['prefix SOURCE_PLAN/NEXT_ACTION backend reservations are zero (case file expected.prefixSourcePlanCalls/prefixNextActionCalls)', 'merged-revision replay model calls are zero', 'one continuous finalized video with prefix/suffix offsets'],
    outOfBandOwner: 'backend ITs (GuidedPublicationReplayIT incremental lane) and the AC-7 operator read of backend counters; the public API does not expose them',
    session: { terminal: ['SUCCEEDED'], published: true, clarifications: 0 } });
}
console.log('ok');
