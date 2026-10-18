// Scratch: writes the DRAFT manifest (sha256 fields null); `freeze-corpus` fills the pins and stamps it.
import { readFileSync, writeFileSync } from 'node:fs';
const OBS = process.argv[2];            // .../studio-runner/evaluation/observed-authoring
const REPO = process.argv[3];
const index = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const MUT = ['wrongTarget', 'reversedAssertion', 'droppedSubmit', 'literalSubstitution'];
const IND = ['model', 'learned-plan', 'runner'];
const AUTHOR = '@dev (Dex) EP lane draft from Quinn t0-qa-20261017 B1/B5/B6; @qa review PENDING';

const rows = readFileSync(`${REPO}/docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/results.jsonl`, 'utf8').split('\n').filter(Boolean).map((l, i) => ({ line: i + 1, ...JSON.parse(l) }));
const record = (caseId) => {
  const mine = rows.filter((r) => r.case === caseId);
  const kinds = [...new Set(mine.map((r) => `${r.stage}:${String(r.outcome).split('(')[0]}`))].sort();
  const shapes = [];
  for (const r of mine) { if (Array.isArray(r.codes) && !shapes.some((s) => JSON.stringify(s) === JSON.stringify(r.codes)) && shapes.length < 2) shapes.push(r.codes); }
  const goto = shapes.flat().map((c) => /goto\('([^']+)'\)/u.exec(c)?.[1]).find(Boolean) ?? null;
  return { rowLines: mine.map((r) => r.line), recordOutcomeKinds: kinds, generatedCodeShapes: shapes, fixtureOriginPattern: goto };
};
const classBasis = {
  P: 'inferred [I] from benchmark/summary.json (positive, expected to pass) and the executed-PASSED or executed-FAILED response shape in results.jsonl',
  F: 'inferred [I]: the record shows executed FAILED for an intended assertion failure',
  N: 'inferred [I]: the record shows UNSUPPORTED or CLARIFICATION envelopes, never a plan',
};
const cases = [];
const page = (key, name) => ({ path: `pages/${key}/${name}.html`, sha256: null });
const corpusFixture = (key) => ({ kind: 'corpus-pages', host: 'evaluation/observed-authoring/pages/server.mjs', namespaceBase: `/ns/${key}` });
const oracleOf = (cls, endpoint) => ({ kind: 'receipts', endpoint, independentOf: IND, mutationControls: MUT, noSideEffect: cls !== 'P' });
const rs1Of = (meta, reads = []) => ({
  isRs1Case: reads.some((r) => r.reachableByGrant === false), valueLocations: reads,
  assertTextLocations: (meta?.rs1?.asserts ?? []),
  basis: '[I] RS-1 is the AC-7 obligation: a value the workflow must READ (carry) that lives only in a non-scalar element no governed grant reaches. Authored-literal assertions are listed separately and are decided by the T4 observation, not by this mark. Pages are not edited to avoid it.',
});
const ported = ['C01-rf-example-url', 'C02-rf-wiki-url', 'C03-rf-wiki-search-var', 'C04-account-save', 'C05-login-var-secret', 'C06-forms-fill-save', 'C07-ambiguous-search-locator', 'C08-intended-assertion-fail', 'C09-negation-trap', 'C10-unsupported-cpu', 'C11-unsupported-second-tab', 'C12-clarify-click-button', 'C13-ambiguous-wiki-placeholder'];
for (const id of ported) {
  const m = index[id]; const key = m.key; const cls = m.class;
  cases.push({
    id, block: 'ported', class: cls, classBasis: classBasis[cls], status: 'READY_LOCAL', blockedBy: null, repetitions: 3, modelSessionsPerRepetition: 1,
    portRecord: {
      knownFromRecord: { resultsJsonl: { sha256: null, ...record(id) }, intendedClass: cls },
      reauthored: ['step text (plain English, observed-path style)', 'fixture page(s) under pages/', 'expected outcome', 'app-side receipts oracle'],
      invented: [],
      reusedAssets: m.reusedAsset === null ? [] : [m.reusedAsset],
      comparisonClaim: 'NONE_NO_COMPARISON_TO_20261004',
    },
    stepText: { path: `pages/${key}/step-text.json`, sha256: null },
    pages: m.pages.map((p) => page(key, p)), pagesReason: m.noPageReason,
    fixture: corpusFixture(key),
    expectedOutcome: { path: `pages/${key}/expected-outcome.json`, sha256: null },
    oracle: oracleOf(cls, `GET /ns/${key}.<runTag>/__receipts (pages/server.mjs)`),
    rs1: rs1Of(m),
    ...(m.secret ? { secretRef: m.secret, secretNote: 'secretRef per OBS-007, not vars.secret; the page server holds the planted value only to compute accepted and never stores it' } : {}),
  });
}
const other = (id, block, key, cls, extra = {}) => {
  const m = index[id];
  return {
    id, block, class: cls, classBasis: extra.classBasis ?? 'QA composition (corpus-composition-draft)', status: 'READY_LOCAL', blockedBy: null, repetitions: 3, modelSessionsPerRepetition: 1,
    portRecord: null,
    stepText: { path: `pages/${key}/step-text.json`, sha256: null },
    pages: m ? m.pages.map((p) => page(key, p)) : [], pagesReason: m ? (m.pages.length ? null : m.noPageReason) : 'rides on an existing fixture (see fixture)',
    fixture: m ? corpusFixture(key) : null,
    expectedOutcome: { path: `pages/${key}/expected-outcome.json`, sha256: null },
    oracle: oracleOf(cls, m ? `GET /ns/${key}.<runTag>/__receipts (pages/server.mjs)` : 'existing fixture receipts'),
    rs1: rs1Of(m),
    ...(m?.ruling ? { ruling: m.ruling } : {}),
    ...extra.over,
  };
};
const secretLogin = { kind: 'existing-ts-fixture', server: 'studio-runner/test/fixtures/secret-login/server.ts', serverPin: { path: 'studio-runner/test/fixtures/secret-login/server.ts', base: 'repo', sha256: null }, host: 'in-process under Node 24 type stripping (hostExistingFixture)', receipts: 'receipts() -> login.submit {username, accepted}; id and password are dropped by the adapter' };
const dataflow = { kind: 'existing-ts-fixture', server: 'studio-runner/test/fixtures/guided-dataflow/server.ts', serverPin: { path: 'studio-runner/test/fixtures/guided-dataflow/server.ts', base: 'repo', sha256: null }, mode: 'mixedVisible', host: 'in-process under Node 24 type stripping (hostExistingFixture)', receipts: 'receipts[] -> receipt.post {body}' };
const dfRs1 = [{ value: '${sourceValue}', elementKind: 'output', reachableByGrant: true, basis: 'mixedVisible puts the value in <output aria-label="Business reference">; OUTPUT is on the AC-7 RS-1 grant element list (declared fixture choice, not a page edit)' }];
cases.push({ ...other('D1-login-secret-fixture', 'login', 'd1', 'P', { classBasis: 'login block; OBS-007 fixture', over: { fixture: secretLogin, pagesReason: 'rides on the existing OBS-007 secret-login fixture', oracle: oracleOf('P', 'secret-login fixture receipts()'), secretRef: 'LOGIN_PW' } }) });
cases.push({
  id: 'D2-login-staging-real', block: 'login', class: 'P', classBasis: 'login block; approved staging application with real login', status: 'EXTERNAL_BLOCKED',
  blockedBy: { owner: 'user / application owner / Platform-SRE (ED-04); dev Vault PUT Core/BFF (ED-02)', register: ['U3', 'ED-02'], state: 'unrun, owner named' },
  repetitions: 3, modelSessionsPerRepetition: 1, portRecord: null, stepText: null, pages: [], pagesReason: null, fixture: { kind: 'staging', note: 'no repository asset; a loopback stand-in would only rehearse page handling and is never staging evidence' },
  expectedOutcome: null, oracle: { kind: 'appSideRead', endpoint: 'EXTERNAL: an application-side signal chosen with the app owner, not the model or runner PASSED', independentOf: IND, mutationControls: MUT, noSideEffect: false },
  rs1: { isRs1Case: false, valueLocations: [], assertTextLocations: [], state: 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ', basis: '[I] cannot be determined before the staging pages exist' },
});
cases.push({ ...other('D3-dataflow-multistep', 'dataflow', 'd3', 'P', { classBasis: 'dataflow block; PR-1 protocol carrier', over: { fixture: dataflow, pagesReason: 'rides on the existing guided-dataflow fixture, mixedVisible', oracle: oracleOf('P', 'guided-dataflow fixture receipts[]'), rs1: rs1Of(null, dfRs1) } }) });
for (const [id, key, file] of [['incremental-edit-step-4', 'inc-edit4', 'cases/incremental-edit-step-4.json'], ['incremental-insert-step', 'inc-insert', 'cases/incremental-insert-step.json']]) {
  cases.push({ ...other(id, 'incremental', key, 'P', { classBasis: 'incremental block; STUDIO-OBS-015-owned case file, consumed unchanged', over: {
    modelSessionsPerRepetition: 2, fixture: dataflow, pagesReason: 'rides on the existing guided-dataflow fixture, mixedVisible',
    stepText: { path: file, sha256: null, owner: 'STUDIO-OBS-015', consumedUnchanged: true },
    oracle: oracleOf('P', 'guided-dataflow fixture receipts[] + run-record incremental counters'), rs1: rs1Of(null, dfRs1),
  } }) });
}
cases.push({
  id: 'E1-sso-approved-origin', block: 'enterprise', class: 'P', classBasis: 'enterprise block; SSO on an approved origin', status: 'EXTERNAL_BLOCKED',
  blockedBy: { owner: 'user / application owner / Platform-SRE (ED-04): approved SSO origin or IdP test tenant and test identity', register: ['U3'], state: 'unrun, owner named' },
  repetitions: 3, modelSessionsPerRepetition: 1, portRecord: null, stepText: null, pages: [], pagesReason: null,
  fixture: { kind: 'staging', note: 'a loopback two-origin redirect (127.0.0.1 vs localhost) could rehearse origin handling; NOT built here, and never SSO evidence' },
  expectedOutcome: null, oracle: { kind: 'appSideRead', endpoint: 'EXTERNAL: application-side session signal supplied by the app owner', independentOf: IND, mutationControls: MUT, noSideEffect: false },
  rs1: { isRs1Case: false, valueLocations: [], assertTextLocations: [], state: 'UNKNOWN_UNTIL_STAGING_PAGES_ARE_READ', basis: '[I] cannot be determined before the staging pages exist' },
});
cases.push(other('E2-shadow-dom-open', 'enterprise', 'e2', 'P', { classBasis: 'enterprise block; open shadow root' }));
cases.push(other('E3-iframe', 'enterprise', 'e3', 'N', { classBasis: 'enterprise block; B3 RECOMMENDED class N (collector marks iframe as an unsupported surface), not ruled' }));
cases.push(other('E4-virtualised-list', 'enterprise', 'e4', 'P', { classBasis: 'enterprise block; windowed list' }));
cases.push(other('Q1-focus-time-helper-autocomplete', 'qa-addition', 'q1', 'P', { classBasis: 'QA addition; FOCUS-MUTATION-01 exposure' }));
cases.push(other('Q2-authored-echo-assert-same-name', 'qa-addition', 'q2', 'P', { classBasis: 'QA addition; AUTHORED-ECHO-01 exposure' }));
cases.push(other('Q3-authored-echo-select-option', 'qa-addition', 'q3', 'P', { classBasis: 'QA addition; AUTHORED-ECHO-01 exposure' }));

const order = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'D1', 'D2', 'D3', 'incremental-edit', 'incremental-ins', 'E1', 'E2', 'E3', 'E4', 'Q1', 'Q2', 'Q3'];
void order;
const manifest = {
  schemaVersion: 1, kind: 'STUDIO_OBSERVED_AUTHORING_BENCHMARK_MANIFEST', story: 'STUDIO-OBS-009', ac: 'AC-7',
  classification: 'HARNESS_PREPARATION_NOT_D_C_EVIDENCE', executionStatus: 'NOT_RUN', comparisonClaim: 'NONE_NO_COMPARISON_TO_20261004',
  authoredBy: AUTHOR, manifestFrozenAt: null, manifestSha256: null,
  freezeNote: 'Frozen at preparation so the self-test can prove manifestFrozenAt < runStartedAt. @qa re-reviews the step texts and expected outcomes before T4; any edit re-freezes and changes manifestSha256, which voids a prior budget admission.',
  rulings: {
    B1: { state: 'RECORDED_BY_PO', ref: 'STUDIO-OBS-009 story, AC-7 interpretation note: ported means re-authored ports' },
    B2: { state: 'RECOMMENDED_NOT_RULED', ref: 'prep t0-questions B2; story "Not decided by @po in this pass"', adopted: 'class-P-only denominator is used as the working definition; a different ruling changes only gate.classPCases' },
    B3: { state: 'RECOMMENDED_NOT_RULED', ref: 'prep t0-questions B3', adopted: 'E3-iframe is class N' },
    B5: { state: 'MODE_DECLARED', adopted: 'mixedVisible for D3 and both incremental cases; no exact-mode case in class P; the optional N-RS1 case is NOT added (PO option, undecided)' },
    B6: { state: 'IMPLEMENTED_LOCALLY', adopted: 'receipts oracle per case, expected outcome hashed, four mutation controls per oracle' },
    B7: { state: 'MEASUREMENT_RECORDED_SEPARATELY', ref: 'execution-20261018/ep/b7-proposals.json; MODEL-SIZING ruling still owed (@architect + @pm)' },
    B8: { state: 'UNKNOWN', adopted: 'budget-admission.json reads ADMISSION_REFUSED_PRICE_UNKNOWN; headroom R and the price list are owed (user, ED-01 owner)' },
  },
  gate: { completionThresholdPct: 90, classPCases: 0, repetitions: 3, plannedRuns: 0, minCompletions: 0, maxFailedRuns: 0, denominatorDefinition: 'class P runs only; F and N fall under the zero-false-pass hard gate; partial when D2 or E1 is unrun, never a pass' },
  sessionPlan: { runs: 0, sessions: 0, contingencySessions: 0 },
  sources: {
    resultsJsonl: { path: 'docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/results.jsonl', base: 'repo', sha256: null },
    summaryJson: { path: 'docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/summary.json', base: 'repo', sha256: null },
  },
  cases,
};
writeFileSync(`${OBS}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(cases.length, 'cases');
