import {recordUiText,recordUiCaptureFailure} from './ui-text.ts';
import type {Canary} from './leakscan.ts';
import { sha256Hex } from './common.ts';
import { psqlJson, readHeadPointers, safeId, stepReceiptRows } from './status.ts';
import type { HeadPointers } from './status.ts';
import type { ExecutionLineage, PublishedLineage } from './lifecycle.ts';
/**
 * The Studio-UI flow of one gate test, ported from the alpha suite.mjs and made stricter: All Checks ->
 * Create Check -> UI Test form -> editor -> author steps -> Save -> Run Test (learn: records a revision) ->
 * proof replay (AFTER_LEARN: confirms it) -> two manual replays -> detail page. UI wording is corroboration
 * only; the public API, the head pointers, the step receipts, the action ledger and the attempt rows decide
 * everything else.
 *
 * Secrets are entered only through typeSecret/declareSecret, which redact every canary form from any
 * error before it is rethrown, so a Playwright call log can never carry a fill value.
 */
import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page, Response } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { classifyLearn, nextAfter } from './classify.ts';
import type { StartRefusal } from './classify.ts';
import type { FlowResult, LearnAttemptRecord, ModelCallSnapshot, ProofRecord, ReplayRecord, ClarificationRecord } from './evaluate.ts';
import { redactCanaries } from './leakscan.ts';
import { recorderCount } from './recorder.ts';
import type { GateFlow } from './common.ts';
import {
  attemptCountForTest,
  attemptRows,
  latestAttempt,
  ledgerRows,
  learningReceipts,
  listExecutions,
  sessionStepIds,
  readSession,
  TERMINAL_EXECUTION,
  expireLearningTiming,
  learningDeadlineMs,
  learningSessionIds,
  newLearningTiming,
  readLearningProgress,
  recordLearningReceipt,
} from './status.ts';
import type { ExecutionSnap, LearningProgress, LearningTiming, PsqlConfig } from './status.ts';

export const LEARN_TIMEOUT_MS = 15 * 60_000;
export const PROOF_TIMEOUT_MS = 3 * 60_000;
export const REPLAY_TIMEOUT_MS = 5 * 60_000;
const POLL_MS = 3000;

export interface GateContext {
  runId: string;
  /** <out>/<runId> */
  dir: string;
  baseUrl: string;
  /** page.context().request: shares the browser session cookie. */
  request: APIRequestContext;
  psql: PsqlConfig;
  proxyUrl: string | null;
  csiId: string;
  /** Canary values, used only to redact errors and UI snapshots. */
  canaries: Canary[];
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
export const bodyText = (page: Page): Promise<string> => page.evaluate(() => document.body.innerText).catch(() => '');

export const LEARNED_RECEIPT = /Completed — learned from this run\./;
export const REPLAY_RECEIPT = /Completed — saved steps replayed\./;
export const LEARNED_CHIP = 'Learned · ready to repeat';

let snapCounter = 0;
export async function snapshotUi(page: Page, ctx: GateContext, key: string, label: string): Promise<void> {
  snapCounter += 1;
  const dir = join(ctx.dir, 'ui');
  mkdirSync(dir, { recursive: true });
  const file=`${key}-${String(snapCounter).padStart(3,'0')}-${label}.txt`;
  try{const text=`URL: ${page.url()}\n\n${await page.locator('body').innerText({timeout:10_000})}`;recordUiText(dir,file,text,ctx.canaries,ctx.runId);}catch{recordUiCaptureFailure(dir,file,ctx.runId);throw new Error('UI_TEXT_CAPTURE_UNKNOWN');}
}

const dismiss = (page: Page): Promise<void> => page.getByRole('button', { name: 'Dismiss' }).click({ timeout: 1500 }).catch(() => undefined);

export async function openEditor(page: Page, ctx: GateContext, testId: string): Promise<void> {
  await page.goto(`${ctx.baseUrl}/checks/ui-tests/${testId}/studio`, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: 'Add a test step' }).waitFor({ timeout: 30_000 });
  await dismiss(page);
}

// ---- create, author, save ------------------------------------------------------------------------

export async function createUiTest(page: Page, ctx: GateContext, name: string, description: string): Promise<string> {
  await page.goto(`${ctx.baseUrl}/all`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Create Check/ }).first().click({ timeout: 30_000 });
  await page.getByText('UI Test (Checks Studio)').click({ timeout: 20_000 });
  const submit = page.getByRole('button', { name: 'Create and open Studio' });
  await submit.waitFor({ timeout: 10_000 });
  await page.getByRole('textbox', { name: /^Name/ }).fill(name);
  await expect(page.getByText('Loading available systems…')).toHaveCount(0);
  const system = page.getByRole('combobox', { name: /System/ });
  const chosen = (await system.innerText()).split('').filter((ch) => /[A-Za-z0-9]/.test(ch)).join('');
  if (!chosen.includes(ctx.csiId)) {
    await system.click();
    await page.getByRole('option', { name: new RegExp(ctx.csiId) }).first().click();
  }
  await page.getByLabel('Description').fill(description);
  await submit.click();
  await page.waitForURL(/\/checks\/ui-tests\/[0-9a-f-]{36}\/studio$/i, { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split('/').slice(-2, -1)[0];
  if (id === undefined) throw new Error('could not read the new UI test id from the URL');
  await page.getByRole('textbox', { name: 'Add a test step' }).waitFor({ timeout: 30_000 });
  await dismiss(page);
  return id;
}

export async function authorSteps(page: Page, steps: string[]): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Add a test step' });
  for (const [i, step] of steps.entries()) {
    await input.fill(step);
    await page.getByRole('button', { name: 'Add step', exact: true }).click();
    await expect(page.getByRole('textbox', { name: `Step ${i + 1}`, exact: true })).toHaveValue(step);
  }
  const values = await page.getByRole('textbox', { name: /^Step \d+$/ }).evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  if (JSON.stringify(values) !== JSON.stringify(steps)) throw new Error(`the editor does not show exactly the authored steps (${values.length} of ${steps.length})`);
}

export async function saveDraft(page: Page): Promise<void> {
  // The chip is derived from local state and can read 'Saved' before the PUT is sent, so wait for the PUT itself.
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/api\/v1\/studio\/tests\/[0-9a-f-]{36}$/i.test(new URL(r.url()).pathname));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await put).ok(), 'the draft PUT must succeed').toBe(true);
  await expect(page.getByTestId('studio-save-state')).toHaveText('Saved');
}

// ---- secrets ---------------------------------------------------------------------------------------

/** Fills a secret value; any failure is rethrown without Playwright's call log, which echoes the value. */
export async function typeSecret(locator: Locator, value: string, canaries: { value: string }[]): Promise<void> {
  try {
    await locator.fill(value);
  } catch (failure) {
    const message = redactCanaries(failure instanceof Error ? failure.message : String(failure), canaries);
    throw new Error(`secret fill failed: ${(message.split('\n')[0] ?? '').slice(0, 200)}`);
  }
}

/** Variables dialog -> Add variable -> Secret -> + Create new secret -> name, value, origin -> Create -> Save. */
export async function declareSecret(page: Page, ctx: GateContext, name: string, value: string, origin: string): Promise<void> {
  await page.getByRole('button', { name: 'Variables' }).first().click();
  const dialog = page.getByRole('dialog').first();
  await dialog.getByRole('button', { name: 'Add variable' }).click();
  await dialog.getByLabel('Variable 1 name').fill(name);
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Secret' }).click();
  await dialog.getByRole('combobox', { name: 'Select secret' }).click();
  await page.getByRole('option', { name: /Create new secret/ }).click();
  // MUI hides the Variables dialog from the accessibility tree while the secret dialog is open, so the nested dialog is found by
  // its own text; once it closes this locator matches nothing (a bare .last() would fall back to the Variables dialog).
  const nested = page.getByRole('dialog').filter({ hasText: /Checking secrets for this test|Before adding your first secret|Create Secret|Allowed origins/ });
  const nameField = nested.getByLabel('Name', { exact: true });
  const proceed = nested.getByRole('button', { name: 'Continue' });
  await nameField.or(proceed).first().waitFor({ timeout: 15_000 });
  if (await proceed.isVisible()) await proceed.click();
  await nameField.fill(name);
  await typeSecret(nested.getByLabel('Value', { exact: true }), value, ctx.canaries);
  await nested.getByLabel('Allowed origins').fill(origin);
  await nested.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(nested).toBeHidden({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

// ---- learn -----------------------------------------------------------------------------------------

async function modelCalls(ctx: GateContext, testId: string): Promise<ModelCallSnapshot> {
  const proxy = ctx.proxyUrl === null ? null : (await recorderCount(ctx.proxyUrl)).count;
  const latest = await latestAttempt(ctx.request, testId);
  const proposals = latest === null ? null : (await readSession(ctx.request, latest.sessionId)).counters.modelProposals;
  return { proxy, attemptRows: attemptCountForTest(ctx.psql, testId), sessionId: latest?.sessionId ?? null, proposals };
}

export type ClarificationMode = 'first' | 'leave';

interface LearningWatch {
  timing: LearningTiming;
  now: () => number;
  session: (id: string) => void;
  poll: (attempt: number, prior: string[]) => void;
  arm: () => void;
  stop: () => Promise<void>;
}

// Read at call time: a watchdog may mutate failure while a UI/API await is outstanding.
const learningFailureCode = (timing: LearningTiming): string | null => timing.failure?.code ?? null;

/** One epoch per authored flow; timers and earliest starts survive infrastructure retries. */
function watchLearning(ctx: GateContext, key: string, testId: string): LearningWatch {
  const origin = performance.now(), timing = newLearningTiming(ctx.runId, testId, randomUUID());
  const now = (): number => performance.now() - origin;
  // The existing diagnostics sink is included in strict scans and immutable raw snapshots.
  const directory = join(ctx.dir, 'diagnostics', 'learning-timing');
  mkdirSync(directory, { recursive: true });
  const journal = join(directory, `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}-${timing.clockId}.jsonl`);
  const persist = (event: string, detail: unknown): void => appendFileSync(journal, `${JSON.stringify({ schemaVersion: 1, runId: ctx.runId, testId, clockId: timing.clockId, event, detail })}\n`, { flag: 'a' });
  persist('START', { atMs: 0, ceilingMs: timing.ceilingMs, method: timing.method });
  let timer: ReturnType<typeof setTimeout> | undefined, currentSession: string | null = null;
  const pending: Promise<unknown>[] = [], cancelled = new Set<string>();
  const cancel = async (): Promise<void> => {
    if (currentSession === null || cancelled.has(currentSession)) return;
    const sessionId = currentSession;
    cancelled.add(sessionId);
    const idempotencyKey = randomUUID();
    persist('CANCEL_REQUEST', { sessionId, atMs: now(), idempotencyKey });
    try {
      const response = await ctx.request.post(`${ctx.baseUrl}/api/v1/studio/guided-sessions/${encodeURIComponent(sessionId)}/cancel`, { data: { schemaVersion: 3, reason: 'userRequested' }, headers: { 'Idempotency-Key': idempotencyKey }, timeout: 10_000 });
      persist('CANCEL_SETTLED', { sessionId, atMs: now(), status: response.status() });
    } catch {
      persist('CANCEL_UNKNOWN', { sessionId, atMs: now() });
    }
  };
  const fail = (): void => {
    // expireLearningTiming persists the terminal failure synchronously before cancellation starts.
    pending.push(expireLearningTiming(timing, now(), () => persist('TERMINAL_TIMING_FAILURE', timing.failure), cancel));
  };
  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    if (timing.failure !== null) { fail(); return; }
    const deadline = learningDeadlineMs(timing);
    if (deadline !== null) timer = setTimeout(() => { fail(); }, Math.max(1, deadline - now() + 1));
  };
  const watch: LearningWatch = {
    timing, now, arm,
    session: (id) => { currentSession = id; if (timing.failure !== null) pending.push(cancel()); },
    poll: (attempt, prior) => {
      if (timing.failure !== null) return;
      const requestStartMs = now();
      const deadline = learningDeadlineMs(timing);
      let progress: LearningProgress | null;
      try {
        progress = readLearningProgress(ctx.psql, testId, prior, deadline === null ? 10_000 : Math.max(1, deadline - requestStartMs + 1));
      } catch {
        timing.failure ??= { code: deadline !== null && now() > deadline ? 'STEP_LEARNING_TIMEOUT' : 'TIMING_EVIDENCE_INVALID', atMs: now() };
        arm();
        return;
      }
      const responseEndMs = now();
      if (progress !== null) {
        currentSession = progress.sessionId;
        const receipt = { ...progress, runId: timing.runId, clockId: timing.clockId, attempt, requestStartMs, responseEndMs };
        recordLearningReceipt(timing, receipt);
        persist('PROGRESS', receipt);
      }
      arm();
    },
    stop: async () => { if (timer !== undefined) clearTimeout(timer); await Promise.all(pending); },
  };
  arm();
  return watch;
}

export async function learnAttempt(page: Page, ctx: GateContext, key: string, testId: string, attemptNo: number, mode: ClarificationMode, incremental=false, sharedWatch?: LearningWatch): Promise<LearnAttemptRecord & { learningTiming: LearningTiming }> {
  const t0 = Date.now();
  const before = await latestAttempt(ctx.request, testId);
  const proxyBefore = ctx.proxyUrl === null ? null : (await recorderCount(ctx.proxyUrl)).count;
  const priorSessions = learningSessionIds(ctx.psql, testId);
  const headBefore = headOf(readHeadPointers(ctx.psql, testId));
  const watch = sharedWatch ?? watchLearning(ctx, key, testId);
  let startRefusal = null as StartRefusal | null;
  let sessionCreated = false as boolean;
  const pending: Promise<void>[] = [];
  const onResponse = (r: Response): void => {
    if (r.request().method() !== 'POST' || !/\/api\/v1\/studio\/guided-sessions$/.test(new URL(r.url()).pathname)) return;
    if (r.status() < 400) {
      sessionCreated = true;
      pending.push(r.json().then((body: unknown) => {
        const response = body as { session?: { sessionId?: unknown }; sessionId?: unknown };
        const id = response.session?.sessionId ?? response.sessionId;
        if (typeof id === 'string') watch.session(id);
      }, () => undefined));
      return;
    }
    pending.push(
      r.json().then(
        (body: unknown) => {
          const rec = (body ?? {}) as Record<string, unknown>;
          const code = typeof rec.code === 'string' ? rec.code : typeof rec.errorCode === 'string' ? rec.errorCode : null;
          startRefusal = { status: r.status(), problemCode: code };
        },
        () => {
          startRefusal = { status: r.status(), problemCode: null };
        },
      ),
    );
  };
  page.on('response', onResponse);
  const clarifications: ClarificationRecord[] = [];
  let terminal = null as Awaited<ReturnType<typeof latestAttempt>>;
  let receipt = false;
  let timedOut = true;
  let succeededSince = 0;
  try {
    if (watch.timing.failure !== null) throw new Error(watch.timing.failure.code);
    await page.getByRole('button', { name: 'Run Test' }).click({ timeout: 20_000 });
    while (Date.now() - t0 < LEARN_TIMEOUT_MS) {
      watch.poll(attemptNo, priorSessions);
      if (watch.timing.failure !== null) break;
      await sleep(POLL_MS);
      if (watch.timing.failure !== null) break;
      if (await page.getByTestId('guided-question-actions').isVisible().catch(() => false)) {
        const radios = page.getByTestId('guided-choices').getByRole('radio');
        const labels = await radios.evaluateAll((els) => els.map((e) => (e.closest('label')?.textContent ?? '').trim()));
        const question = await page.getByTestId('guided-question').innerText().catch(() => '');
        const pick = mode === 'first' ? labels.findIndex((l) => !/None of these/.test(l)) : labels.findIndex((l) => /None of these/.test(l));
        clarifications.push({
          atSeconds: Math.round((Date.now() - t0) / 1000),
          question: redactCanaries(question, ctx.canaries),
          choices: labels.map((l) => redactCanaries(l, ctx.canaries)),
          picked: pick >= 0 ? redactCanaries(labels[pick] ?? '', ctx.canaries) : null,
        });
        await snapshotUi(page, ctx, key, `clarification${attemptNo}`);
        if (pick < 0) throw new Error('clarification offers no choice to pick');
        await radios.nth(pick).check();
        await page.getByRole('button', { name: 'Continue' }).click();
        continue;
      }
      receipt = (incremental ? /Completed — steps? [0-9]+(?:–[0-9]+)? learned again\./ : LEARNED_RECEIPT).test(await bodyText(page));
      const latest = await latestAttempt(ctx.request, testId);
      if (latest !== null && latest.sessionId !== (before?.sessionId ?? null)) {
        terminal = latest;
        watch.poll(attemptNo, priorSessions);
        if (watch.timing.failure !== null) break;
        // A SUCCEEDED session has recorded its revision once the head moves; the UI receipt only appears after the proof.
        if (latest.state !== 'SUCCEEDED' || headOf(readHeadPointers(ctx.psql, testId)) !== headBefore) {
          timedOut = false;
          break;
        }
        succeededSince = succeededSince === 0 ? Date.now() : succeededSince;
        if (Date.now() - succeededSince > 90_000) {
          timedOut = false;
          break;
        }
      }
      await Promise.all(pending);
      if (startRefusal !== null && !sessionCreated) {
        timedOut = false;
        break;
      }
    }
  } finally {
    page.off('response', onResponse);
    await Promise.all(pending);
    if (sharedWatch === undefined) await watch.stop();
  }
  await snapshotUi(page, ctx, key, `learn${attemptNo}-final`);
  // A watchdog stop has no terminal read; the watch is shared across attempts, so only this attempt's receipts count.
  const sessionId = terminal?.sessionId ?? watch.timing.receipts.filter((r) => r.attempt === attemptNo).at(-1)?.sessionId ?? null;
  const counters = sessionId === null ? null : (await readSession(ctx.request, sessionId)).counters;
  const attempts = sessionId === null ? null : attemptRows(ctx.psql, sessionId);
  const ledger = sessionId === null ? null : ledgerRows(ctx.psql, sessionId);
  const receipts = sessionId === null ? null : learningReceipts(ctx.psql, sessionId);
  const stepIds = sessionId === null ? null : sessionStepIds(ctx.psql, sessionId);
  const recorded = headOf(readHeadPointers(ctx.psql, testId)) !== headBefore;
  const lastRejected = [...(attempts ?? [])].reverse().find((a) => a.status === 'REJECTED');
  const classified = classifyLearn({
    timingFailure: learningFailureCode(watch.timing),
    succeeded: terminal?.state === 'SUCCEEDED' && recorded,
    errorCode: terminal?.errorCode ?? null,
    lastRejectionReason: lastRejected?.rejectionReason ?? null,
    startRefusal,
    sessionCreated: sessionCreated || terminal !== null,
  });
  const gatewayRequests = ctx.proxyUrl === null || proxyBefore === null ? null : (await recorderCount(ctx.proxyUrl)).count - proxyBefore;
  return {
    learningTiming: watch.timing,
    timingFailure: learningFailureCode(watch.timing),
    failedStepIndex:sessionId===null?null:(psqlJson(ctx.psql,`select row_to_json(t) from (select (progress->>'stepIndex')::int as step_index from studio_guided_sessions where session_id='${safeId(sessionId)}') t`)[0] as {step_index:number|null}|undefined)?.step_index ?? null,
    attempt: attemptNo,
    cls: classified.cls,
    subClass: timedOut && classified.cls !== 'OK' ? 'POLL_TIMEOUT' : classified.subClass,
    sessionId,
    state: terminal?.state ?? null,
    errorCode: terminal?.errorCode ?? null,
    seconds: Math.round((Date.now() - t0) / 1000),
    receipt,
    clarifications,
    counters,
    attempts,
    ledger,
    receipts,
    stepIds,
    gatewayRequests,
  };
}

/** The head revision of a test: the recorded candidate when there is one, else the confirmed revision. */
const headOf = (pointers: HeadPointers): string | null => pointers.candidate ?? pointers.confirmed;

/** The head revision (candidate, else confirmed), so a recorded but unconfirmed revision still has a publication. Post-terminal server clock is a conservative UPPER bound on learning completion, never a local UI time. */
export function publishedLineage(ctx: GateContext, testId: string): PublishedLineage | undefined {
  const rows=psqlJson(ctx.psql,`select row_to_json(t) from (select r.test_id::text as test_id,r.id::text as revision_id,r.source_revision,r.configuration_revision,clock_timestamp() as server_post_terminal_at,array(select value->>'id' from jsonb_array_elements(r.authoring->'steps')) as step_ids,array(select value->>'text' from jsonb_array_elements(r.authoring->'steps')) as authored_texts from ui_tests t join ui_test_revisions r on r.id=coalesce(t.candidate_revision_id,t.confirmed_revision_id) where t.id='${safeId(testId)}'::uuid) t`);
  if(rows.length!==1) return undefined;
  const r=rows[0] as Record<string,unknown>;
  if(typeof r.test_id!=='string'||typeof r.revision_id!=='string'||typeof r.source_revision!=='number'||typeof r.configuration_revision!=='number'||typeof r.server_post_terminal_at!=='string'||!Array.isArray(r.step_ids)||!r.step_ids.every((id)=>typeof id==='string')) return undefined;
  if(!Array.isArray(r.authored_texts)||!r.authored_texts.every((text)=>typeof text==='string'))return undefined;
  return {authoredStepsHash:sha256Hex(JSON.stringify(r.authored_texts)),testId:r.test_id,revisionId:r.revision_id,sourceRevision:r.source_revision,configurationRevision:r.configuration_revision,learnedCompletedAt:r.server_post_terminal_at,stepIds:r.step_ids as string[]};
}
function executionLineage(exec: ExecutionSnap, prior: string[], publication: PublishedLineage | undefined): ExecutionLineage | undefined {
  if (publication===undefined || exec.revisionId===null) return undefined;
  return {testId:exec.testId,revisionId:exec.revisionId,acceptedAt:exec.acceptedAt,startedAt:exec.startedAt,endedAt:exec.endedAt,errorCode:exec.errorCode,beforeExecutionIds:prior,passedStepIds:exec.passedStepIndices.flatMap((index) => publication.stepIds[index] === undefined ? [] : [publication.stepIds[index] as string])};
}
// ---- proof, replays, detail ------------------------------------------------------------------------

export async function waitForProof(ctx: GateContext, testId: string, publication?: PublishedLineage): Promise<ProofRecord | null> {
  const t0 = Date.now();
  let found: ExecutionSnap | undefined;
  while (Date.now() - t0 < PROOF_TIMEOUT_MS) {
    found = (await listExecutions(ctx.request, testId)).filter((e) => e.triggerSource === 'AFTER_LEARN' && (publication===undefined || e.revisionId===publication.revisionId)).pop();
    if (found !== undefined && TERMINAL_EXECUTION.test(found.status) && found.videoStatus !== 'PROCESSING') break;
    await sleep(2000);
  }
  if (found === undefined) return null;
  return { lineage: executionLineage(found,[],publication), executionId: found.executionId, status: found.status, triggerSource: found.triggerSource, videoStatus: found.videoStatus, durationMs: found.durationMs };
}

export async function replayOnce(page: Page, ctx: GateContext, key: string, testId: string, n: number, publication?: PublishedLineage): Promise<ReplayRecord> {
  await openEditor(page, ctx, testId);
  const learnedChip = (await bodyText(page)).includes(LEARNED_CHIP);
  const before = await modelCalls(ctx, testId);
  const known = (await listExecutions(ctx.request, testId)).map((e) => e.executionId);
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Run Test' }).click({ timeout: 20_000 });
  let exec: ExecutionSnap | undefined;
  let uiReceipt = false;
  let terminalAt = 0;
  while (Date.now() - t0 < REPLAY_TIMEOUT_MS) {
    await sleep(2500);
    const list = await listExecutions(ctx.request, testId);
    const fresh = list.filter((e) => !known.includes(e.executionId));
    if (fresh.length > 1) throw new Error('multiple new executions appeared for one manual dispatch');
    exec = fresh[0];
    uiReceipt = REPLAY_RECEIPT.test(await bodyText(page));
    if (exec !== undefined && TERMINAL_EXECUTION.test(exec.status)) {
      terminalAt = terminalAt === 0 ? Date.now() : terminalAt;
      if (uiReceipt || Date.now() - terminalAt > 20_000) break;
    }
  }
  await snapshotUi(page, ctx, key, `replay${n}`);
  if (exec === undefined) throw new Error(`replay ${n}: no new execution appeared`);
  const after = await modelCalls(ctx, testId);
  return {
    lineage: executionLineage(exec,known,publication),
    executionId: exec.executionId,
    status: exec.status,
    triggerSource: exec.triggerSource,
    replayFailureCode: exec.replayFailureCode,
    uiReceipt,
    learnedChip,
    seconds: Math.round((Date.now() - t0) / 1000),
    stepResults: exec.stepResults,
    before,
    after,
  };
}

export async function detailPageOk(page: Page, ctx: GateContext, testId: string): Promise<boolean> {
  await page.goto(`${ctx.baseUrl}/checks/ui-tests/${testId}`, { waitUntil: 'networkidle' });
  await sleep(2500);
  const text = await bodyText(page);
  return /Recent Runs/.test(text) && /Passed/.test(text);
}

// ---- one whole flow --------------------------------------------------------------------------------

export interface FlowOptions {
  key: string;
  flow: GateFlow;
  /** Clarification handling: positives and L1 answer, controls leave it unanswered. */
  mode: ClarificationMode;
  /** Positives and L1 continue to proof and replays when learned; controls only probe. */
  proceed: boolean;
  description: string;
  /** Called after the test exists and before the steps are authored (L1 declares its secret here). */
  beforeSteps?: (page: Page, testId: string) => Promise<void>;
  beforeLearn?: (page: Page, testId: string) => Promise<void>;
}

export async function runFlow(page: Page, ctx: GateContext, options: FlowOptions): Promise<FlowResult> {
  const { key, flow } = options;
  const name = `Release gate ${ctx.runId} ${key}${flow.id === 'main' ? '' : ` ${flow.id}`}`;
  const result: FlowResult = {
    flowId: flow.id,
    testId: null,
    name,
    learnAttempts: [],
    learned: false,
    learnedAt: null,
    proof: null,
    replays: [],
    detailOk: null,
    afterLearnExecutions: 0,
    learnedChip: false,
    error: null,
  };
  let watch: LearningWatch | undefined;
  try {
    result.testId = await createUiTest(page, ctx, name, `Release gate ${ctx.runId}: ${options.description}`);
    const testId = result.testId;
    if (options.beforeSteps) await options.beforeSteps(page, testId);
    await authorSteps(page, flow.steps);
    await saveDraft(page);
    await snapshotUi(page, ctx, key, 'authored');
    if(options.beforeLearn) await options.beforeLearn(page,testId);
    watch = watchLearning(ctx, `${key}-${flow.id}`, testId);
    result.learningTiming = watch.timing;
    for (let attemptNo = 1; ; attemptNo += 1) {
      const rec = await learnAttempt(page, ctx, key, testId, attemptNo, options.mode, false, watch);
      result.learnAttempts.push(rec);
      if (watch.timing.failure !== null) break;
      if (nextAfter(result.learnAttempts.map((a) => a.cls)) !== 'RETRY') break;
      await openEditor(page, ctx, testId);
    }
    await watch.stop();
    result.learned = watch.timing.failure === null && result.learnAttempts[result.learnAttempts.length - 1]?.cls === 'OK';
    result.headAtLearn = readHeadPointers(ctx.psql, testId);
    if (result.learned) { result.publication=publishedLineage(ctx,testId); result.learnedAt=result.publication?.learnedCompletedAt ?? null; }
    if (options.proceed && result.learned) {
      result.proof = await waitForProof(ctx, testId,result.publication);
      // The proof's promotion commits with its FINAL report, so these reads cannot race it.
      result.headAfterProof = readHeadPointers(ctx.psql, testId);
      result.proofReceipts = result.publication === undefined ? null : stepReceiptRows(ctx.psql, result.publication.revisionId);
      for (const n of [1, 2]) result.replays.push(await replayOnce(page, ctx, key, testId, n,result.publication));
      result.detailOk = await detailPageOk(page, ctx, testId);
    } else if (!options.proceed) {
      result.publication=publishedLineage(ctx,testId);
      result.afterLearnExecutions = (await listExecutions(ctx.request, testId)).filter((e) => e.triggerSource === 'AFTER_LEARN').length;
      await openEditor(page, ctx, testId);
      result.learnedChip = (await bodyText(page)).includes(LEARNED_CHIP);
    }
  } catch (failure) {
    result.error = redactCanaries(failure instanceof Error ? failure.message : String(failure), ctx.canaries).split('\n')[0]?.slice(0, 400) ?? 'error';
    await snapshotUi(page, ctx, key, 'error').catch(() => undefined);
  } finally {
    await watch?.stop();
  }
  return result;
}

/** innerText of a public page, used by the provenance check; read through a throwaway tab. */
export async function capturePageText(page: Page, url: string): Promise<string> {
  const tab = await page.context().newPage();
  try {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(2500);
    return await bodyText(tab);
  } finally {
    await tab.close();
  }
}
