/**
 * Renders the release-gate evidence report (ADR-SC-007 AC6) from recorded results. Pure: every number
 * comes from a RunBundle and its RunEvaluation, iterated over the test table. The first line carries
 * the verdict of the candidate (last) run, and the same verdict drives the CLI exit code.
 */
import { isDryRunId, requiredLifecycleCases } from './common.ts';
import type { FlowResult, RunBundle, RunEvaluation, TestResult, Verdict } from './evaluate.ts';
import { confirmationFindings, evaluateControl, exitCodeFor } from './evaluate.ts';
import { learningIntervals, learningTimingProblems, STEP_LEARNING_LIMIT_MS } from './status.ts';

export interface RunReportInput {
  bundle: RunBundle;
  evaluation: RunEvaluation;
}

const cell = (v: string | number | null | undefined): string => (v === null || v === undefined || v === '' ? 'n/a' : String(v).replace(/\|/g, '\\|'));
const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const ms = (v: number | null): string => (v === null ? 'n/a' : `${(v / 1000).toFixed(1)} s`);

function row(cells: (string | number | null | undefined)[]): string {
  return `| ${cells.map(cell).join(' | ')} |`;
}

function table(header: string[], rows: (string | number | null | undefined)[][]): string[] {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)];
}

/** Per attempt: the receipt of every dispatched step by step index (bare effect methods, ! marks an uncompleted one) and any clarification. */
function attemptEvidence(flow: FlowResult | undefined): string {
  return (flow?.learnAttempts ?? [])
    .map((a) => {
      const steps = (a.receipts ?? []).flatMap((r) => (r.receipt === null ? [] : [`${a.stepIds?.indexOf(r.stepId) ?? '?'}: [${r.receipt.effects.map((e) => `${e.method}${e.completed ? '' : '!'}`).join(' ')}${r.receipt.effectsTruncated ? ' ...' : ''}] ${r.receipt.closedCode ?? 'ok'}`]));
      return `#${a.attempt} ${steps.join(', ') || 'no receipt'}${a.clarifications.map((c) => `; asked "${c.question}"`).join('')}`;
    })
    .join(' | ');
}

function testRow(result: TestResult | undefined, key: string, flowId='main'): (string | number | null)[] {
  if (result === undefined) return [key, 'no result', null, null, null, null, null, null, null, null];
  if (result.status === 'VOID') return [key, `VOID: ${result.voidReason ?? ''}`, null, null, null, null, null, null, null, null];
  const flow = result.flows.find((f)=>f.flowId===flowId);
  if (flow === undefined) return [key, 'no flow', null, null, null, null, null, null, null, null];
  const last = flow.learnAttempts[flow.learnAttempts.length - 1];
  const calls = flow.learnAttempts.reduce((n, a) => n + (a.counters?.modelProposals ?? 0), 0);
  const tokens = flow.learnAttempts.reduce((n, a) => n + (a.counters?.modelInputTokens ?? 0) + (a.counters?.modelOutputTokens ?? 0), 0);
  const clar = flow.learnAttempts.reduce((n, a) => n + a.clarifications.length, 0);
  const retry = flow.learnAttempts.filter((a) => a.cls === 'INFRA').length;
  return [
    key,
    flow.learned ? (confirmationFindings(flow).length === 0 ? 'confirmed' : 'recorded, not confirmed') : `${last?.cls ?? '?'} ${last?.errorCode ?? last?.state ?? ''}`.trim(),
    flow.learnAttempts.map((a) => `${a.seconds}s`).join(' + '),
    clar,
    `${calls} / ${tokens}`,
    flow.proof === null ? 'none' : `${flow.proof.status} ${flow.proof.videoStatus}`,
    flow.replays[0] === undefined ? 'none' : `${flow.replays[0].status} ${flow.replays[0].seconds}s`,
    flow.replays[1] === undefined ? 'none' : `${flow.replays[1].status} ${flow.replays[1].seconds}s`,
    retry,
    flow.error,
  ];
}

function renderRun(input: RunReportInput): string[] {
  const { bundle, evaluation } = input;
  const out: string[] = [];
  const env = bundle.environment;
  out.push(`## Run ${bundle.runId}: ${evaluation.verdict}`, '');
  if (evaluation.invalid.length > 0) out.push(`INVALID because: ${evaluation.invalid.join('; ')}`, '');
  if (env !== null) {
    out.push('### Environment', '');
    out.push(
      ...table(
        ['Field', 'Value'],
        [
          ['git sha', `${env.git.sha} (dirty status ${String(env.git.dirty)})`],
          ['working-tree digest start / end', `${env.git.workingTreeDigestStart.slice(0, 16)} / ${env.git.workingTreeDigestEnd === null ? 'n/a' : env.git.workingTreeDigestEnd.slice(0, 16)}`],
          ['model id', `${env.model.id ?? 'n/a'} (${env.model.source})`],
          ['contract md sha256', env.hashes.contractMd],
          ['contracts v3 sha256', env.hashes.contractsV3],
          ['prompt sha256 (static)', env.hashes.promptStatic],
          ['Playwright reference sha256', env.hashes.playwrightReferenceHash],
          ['system-instruction sha256 (wire)', env.hashes.wireSystemInstruction.join(', ') || 'not interposed'],
          ['Playwright driver / runner', `${env.playwright.driver} / ${env.playwright.runner}`],
          ['coreBundle.js sha256 (pin)', `${env.playwright.coreBundleSha256} (${env.playwright.coreBundleSha256 === env.playwright.pinSha256 ? 'matches pin' : 'DIFFERS'})`],
          ['chromium build', env.playwright.chromiumBuild],
          ['gateway settings', Object.entries(env.gateway).map(([k, v]) => `${k}=${String(v)}`).join(', ')],
          ['stack bound to manifest', String(env.stack.bound)],
          ['recorder', evaluation.proxyState],
        ],
      ),
      '',
    );
  }
  out.push('### Pass rule', '');
  out.push(...table(['Rule', 'Name', 'Verdict', 'Reasons'], evaluation.rules.map((r) => [r.rule, r.name, r.verdict, r.reasons.join('; ')])), '');
  out.push('### Positive tests', '');
  out.push(
    ...table(
      ['Test', 'Learn', 'Learn time', 'Clarifications', 'Model calls / tokens', 'Proof', 'Replay 1', 'Replay 2', 'Infra retries', 'Error'],
      requiredLifecycleCases(bundle.table).map((c) => testRow(bundle.results[c.test.key],c.key,c.flow.id)),
    ),
    '',
  );
  out.push('### Controls', '');
  out.push(
    ...table(
      ['Control', 'Expectation met', 'False pass', 'Details', 'Attempts (steps: effects, closed code; clarification)'],
      bundle.table.tests
        .filter((t) => t.kind === 'control')
        .map((t) => {
          const v = evaluateControl(t.key, bundle.results[t.key]?.flows[0]);
          return [t.key, String(v.expectationMet), String(v.falsePass), v.reasons.join('; '), attemptEvidence(bundle.results[t.key]?.flows[0])];
        }),
    ),
    '',
  );
  for (const [label, scan] of [['Leak scan', bundle.scan]] as const) {
    out.push(`### ${label}`, '');
    if (scan === null) {
      out.push('not run', '');
      continue;
    }
    out.push(
      `Denominators: ${scan.filesScanned} text files, ${scan.bytesScanned} text bytes, ${scan.opaqueBytes} opaque bytes (videos/images/archives, not text-scanned), ` +
        `${scan.db === null ? 'no database dump' : `${scan.db.tables} tables / ${scan.db.rows} rows / ${scan.db.bytes} bytes`}, ${scan.gatewayBodies} gateway bodies, ` +
        `${scan.canaries.length} canaries (${scan.canaries.map((c) => `${c.label}:${c.cls}:${c.length}ch:${c.sha6}`).join(', ')}), page text ${scan.pageTextChars} chars.`,
      '',
      ...table(['Source', 'Present', 'Files', 'Bytes', 'Opaque files', 'Opaque bytes'], scan.sources.map((s) => [s.name, String(s.present), s.files, s.bytes, s.opaqueFiles, s.opaqueBytes])),
      '',
      `Total canary hits: ${scan.hits.length}. LEAK hits: ${scan.leak}. PAGE_ORIGIN hits: ${scan.pageOrigin}. Every occurrence fails, including PAGE_ORIGIN.`,
      `Actual product UI text scanned before persistence protection: ${scan.originalUi?.snapshots ?? 'UNKNOWN'} snapshots / ${scan.originalUi?.bytes ?? 'UNKNOWN'} bytes, missing receipts ${scan.originalUi?.missing ?? 'UNKNOWN'}. Clean text is retained unchanged; unsafe text has safe hit records and fails. A hash alone never establishes zero.`,
      '',
    );
    if (scan.hits.length > 0) {
      out.push(...table(['Source', 'File', 'Offset', 'Canary', 'Form', 'Verdict', 'Reason'], scan.hits.map((h) => [h.source, h.file, h.offset, h.canary, h.form, h.verdict, h.reason])), '');
    }
  }
  const m = evaluation.metrics;
  out.push('### Metrics', '');
  out.push(
    `Product-admitted rate (APPLIED / (APPLIED + REJECTED) over model-attempt rows): ${pct(m.admitted.rate)} (${m.admitted.applied} of ${m.admitted.applied + m.admitted.rejected}). ` +
      `Steps learned: ${pct(m.stepsLearned.rate)} (${m.stepsLearned.learned} of ${m.stepsLearned.authored}). ` +
      `Model time (${m.modelTime.source}, n=${m.modelTime.n}): p50 ${ms(m.modelTime.p50)}, p95 ${ms(m.modelTime.p95)}.`,
    `Gate refusals by diagnostics Gate (persisted rejection_gate): ${Object.entries(m.rejectionsByGate).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}. By rejection_reason: ${Object.entries(m.rejectionsByReason).map(([k, v]) => `${k} x${v}`).join(', ') || 'none'}.`,
    '',
    ...table(
      ['Test', 'Flow', 'Learn s', 'Proof s', 'Replay s', 'Model calls', 'In tokens', 'Out tokens', 'Clarifications'],
      m.perTest.map((p) => [p.key, p.flow, p.learnSeconds.join(' + '), p.proofSeconds, p.replaySeconds.join(' / '), p.modelCalls, p.inputTokens, p.outputTokens, p.clarifications]),
    ),
    '',
  );
  out.push('### Authorized authoring amendments','', 'Python version step: Select "3.13" in the "Python version" dropdown → same wording plus at the top of the page. Reason: two identical dropdowns; explicit named location.','', 'Amendments by user 2026-11-01 (genuine two-target ambiguity, reworded in gate-table.json): kernel-releases steps 2 and 4 name the first "stable:" row; pythondocs step 3 is Type "asyncio" in the "Quick search" field at the top of the page; pythondocs step 4 is Click the "Go" button at the top of the page; pythondocs step 6 names the first link "asyncio — Asynchronous I/O" (added by the controller as the same class of ambiguity).','');
  if(bundle.hnAmendment!==undefined)out.push(...table(['Original HN step','Frozen visible-content step','Reason'],bundle.hnAmendment.original.map((original,i)=>[original,bundle.hnAmendment?.replacement[i],bundle.hnAmendment?.reason])),`HN capture ${bundle.hnAmendment.capturedAt}, first story ${bundle.hnAmendment.storyId}, source hash ${bundle.hnAmendment.sourceCaptureHash}.`,'');
  else out.push('HN frozen source capture: UNKNOWN (blocks counted gate).','');
  out.push('### Per-step learning timing','', 'Conservative monotonic upper bounds include queue/startup, acquisition, model calls, retries and validation. These are observation brackets, not exact backend completion timestamps. Missing coverage blocks PASS; retries and clarifications do not reset the clock. Host load is recorded only when useful and does not admit or excuse a run.', '');
  const timingRows: (string | number | null | undefined)[][] = [];
  for (const c of requiredLifecycleCases(bundle.table)) {
    const flow = bundle.results[c.test.key]?.flows.find((entry) => entry.flowId === c.flow.id);
    const timing = flow?.learningTiming, publication = flow?.publication;
    if (flow === undefined || timing === undefined || publication === undefined) { timingRows.push([c.key, 'UNKNOWN', null, STEP_LEARNING_LIMIT_MS, 'UNKNOWN coverage']); continue; }
    try {
      const problems = learningTimingProblems(timing, { runId: bundle.runId, testId: flow.testId, sourceRevision: publication.sourceRevision, configurationRevision: publication.configurationRevision, stepIds: publication.stepIds, sessionId: flow.learnAttempts.at(-1)?.sessionId ?? null });
      const intervals = learningIntervals(timing);
      if (intervals.length === 0) timingRows.push([c.key, 'UNKNOWN', null, STEP_LEARNING_LIMIT_MS, 'UNKNOWN coverage']);
      for (const step of intervals) timingRows.push([c.key, `${step.ordinal + 1}: ${step.stepId}`, step.elapsedUpperMs, STEP_LEARNING_LIMIT_MS, problems.length === 0 ? 'PASS (conservative upper bound)' : problems.join('; ')]);
    } catch { timingRows.push([c.key, 'UNKNOWN', null, STEP_LEARNING_LIMIT_MS, 'UNKNOWN invalid timing']); }
  }
  out.push(...table(['Case', 'Step', 'Learning upper bound (ms)', 'Ceiling (ms)', 'Timing status / coverage'], timingRows), '');
  out.push('### Lineage and actual whole-suite anchor','');
  out.push(...table(['Case','Test / revision','Learning completion upper bound (server)','Proof ID','MANUAL IDs'],requiredLifecycleCases(bundle.table).map((c)=>{const f=bundle.results[c.test.key]?.flows.find((x)=>x.flowId===c.flow.id);return[c.key,`${f?.publication?.testId ?? 'UNKNOWN'} / ${f?.publication?.revisionId ?? 'UNKNOWN'}`,f?.publication?.learnedCompletedAt,f?.proof?.executionId,f?.replays.map((r)=>r.executionId).join(', ')];})), '');
  out.push(`Whole-suite SAME_DAY_PASS event: ${bundle.anchor?.occurredAt ?? 'MISSING'}; event hash ${bundle.anchor?.eventHash ?? 'MISSING'}.`, '');
  const truncations=bundle.truncations;
  out.push('### Coverage and retained release conditions','',
    `4096 truncations VERIFIED by numeric request cap plus provider MAX_TOKENS: ${truncations?.verified4096 ?? 'UNKNOWN'}. Metadata covered ${truncations===undefined?'UNKNOWN':truncations.total-truncations.unknown}/${truncations?.total ?? 'UNKNOWN'}, UNKNOWN ${truncations?.unknown ?? 'UNKNOWN'}. Token totals or adapter finish alone are INFERRED and cannot establish coverage.`,
    'Wrong-region picks are not a gate rule (backlog A16): the reviewer reads each learned step against its page and the report lists any wrong-region pick as a finding; it does not decide PASS.',
    'W-AC10 accepted residual: a delayed focus handler may move focus during press; press has no mitigation. Fill checks for password-held literals after dispatch. Pages requiring change-only after typed text remain unsupported.',
    'Q9 compliance reconfirmation: MISSING unless a separate actual compliance receipt is attached. This remains a HARD GATE BEFORE ANY PILOT. A release-gate PASS is not compliance approval or D-C benchmark success.',
    'Evidence classification: recorded IDs/counters/receipts and checked source-bound comparisons are VERIFIED only when present. Missing data is UNKNOWN; proposed behavior and unexecuted diagnostics remain NOT_RUN/INFERRED.', '');
  return out;
}

/** The candidate is the last run id; earlier runs are quoted under their own ids. */
export function renderReport(runs: RunReportInput[], generatedAt: string): { markdown: string; verdict: Verdict; exitCode: number; refused: string | null } {
  const dry = runs.find((r) => isDryRunId(r.bundle.runId));
  if (dry !== undefined) return { markdown: '', verdict: 'INVALID', exitCode: 2, refused: `${dry.bundle.runId} is a dry run; the report refuses dry-run ids` };
  const candidate = runs[runs.length - 1];
  if (candidate === undefined) return { markdown: '', verdict: 'INVALID', exitCode: 2, refused: 'no run given' };
  const verdict = candidate.evaluation.verdict;
  const lines: string[] = [
    `# Release gate report (ADR-SC-007 WI-5): ${verdict}`,
    '',
    `Candidate run: ${candidate.bundle.runId}. Generated ${generatedAt}. Runs in this report: ${runs.map((r) => `${r.bundle.runId} (${r.evaluation.verdict})`).join(', ')}.`,
    '',
    'This gate is necessary before the STUDIO-OBS-016 D-C benchmark starts and is not a D-C pass. PASS needs all current rules proven for 14 ordinary same-day lifecycles, controls, strict scans, freeze, audits, metrics and the create-once SAME_DAY_PASS seal. The user removed next-day/24-hour replay and L1 login acceptance requirements; this report makes no next-day durability or login-coverage claim. Historical artifacts remain unchanged and readable as raw evidence; the current loader validates the current registry.',
    '',
  ];
  for (const run of runs) lines.push(...renderRun(run));
  return { markdown: `${lines.join('\n')}\n`, verdict, exitCode: exitCodeFor(verdict), refused: null };
}
