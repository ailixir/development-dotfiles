/**
 * Scripted stand-in for the Studio API and runner, used only by the fixture-backed evaluation
 * tests (Story 10.26 AC-3, local half). It is NOT inference: it maps each English step to a fixed
 * fixture action and performs that action against the real fixture app over HTTP, so the
 * independent oracle reads genuine fixture state. Live gateway evidence (SPK-01) is out of scope.
 */
import type { EvaluationTransport } from '../../evaluation/lifecycle.mjs';

export const PINS = { validator: '2.0.0', executor: '2.0.0', playwright: '1.63.0' } as const;

interface Step { id: string | null; text: string }
interface WriteBody { name: string; steps: Step[] }
interface TestState {
  id: string;
  caseId: string;
  steps: { id: string; text: string }[];
  sourceRevision: number;
  compiles: number;
  attempt: Record<string, unknown> | null;
  executions: number;
}

export interface ScriptOptions {
  /** Case IDs whose first compile admission is refused with HTTP 429. */
  readonly refuseFirstCompile?: readonly string[];
  /** Case IDs whose scripted runner saves the wrong account yet still reports PASSED. */
  readonly wrongAccount?: readonly string[];
  /** Case IDs whose evaluated compile reports one repair. */
  readonly repaired?: readonly string[];
}

const USAGE = { proposalCount: 1, repairCount: 0, transportAttemptCount: 1, inputTokens: 100, outputTokens: 40,
  thinkingTokens: 10, usageAvailable: true, finishReason: 'STOP', cancellationOutcome: null, elapsedMs: 25 };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Fixed English-to-fixture mapping; anything else is a non-executable outcome. */
function classify(text: string): { action?: string; diagnostic?: string } {
  if (text.includes('second browser tab')) return { diagnostic: 'UNSUPPORTED_CAPABILITY' };
  if (text.includes('looks correct')) return { diagnostic: 'AMBIGUOUS_INTENT' };
  if (text === 'Click the Log in button') return { action: 'login' };
  if (text === 'Click Save target') return { action: 'target' };
  if (text === 'Click Save other') return { action: 'other' };
  return {};
}

export function scriptedBackend(fixtureOrigins: readonly string[], options: ScriptOptions = {}): EvaluationTransport {
  const tests = new Map<string, TestState>();
  const executions = new Map<string, Record<string, unknown>>();
  const refused = new Set<string>();
  let nextId = 0;

  const view = (t: TestState): Record<string, unknown> => {
    const attempt = t.attempt;
    const candidate = attempt?.state === 'CANDIDATE';
    const diagnostics = attempt?.diagnostics;
    return {
      test: { id: t.id, sourceRevision: t.sourceRevision, configurationRevision: 1,
        compileStatus: attempt === null ? 'STALE' : candidate ? 'AWAITING_CONFIRMATION' : 'NEEDS_REVISION',
        currentCandidateRevisionId: candidate ? attempt.revisionId : null,
        currentCandidateArtifact: candidate ? { version: 1, steps: t.steps.map((s, i) => ({ stepIndex: i, originalText: s.text, code: `// ${s.id}` })) } : null,
        compileDiagnostics: diagnostics ?? null },
      authoringHash: `hash-${t.id}-${String(t.sourceRevision)}`,
      authoring: { version: 2, steps: t.steps },
      compileAttempt: attempt,
    };
  };

  const write = (t: TestState, body: WriteBody): void => {
    t.steps = body.steps.map((s, i) => ({ id: s.id ?? `${t.id}-step-${String(i)}`, text: s.text }));
  };

  const compile = (t: TestState, mode: string): void => {
    t.compiles++;
    const requestId = `${t.id}-compile-${String(t.compiles)}`;
    const verdicts = t.steps.map(s => classify(s.text));
    const rejected = verdicts.find(v => v.diagnostic !== undefined);
    const usage = { ...USAGE, repairCount: options.repaired?.includes(t.caseId) === true ? 1 : 0 };
    t.attempt = {
      compileRequestId: requestId, sourceRevision: t.sourceRevision, configurationRevision: 1,
      state: rejected ? 'NEEDS_REVISION' : 'CANDIDATE', usage,
      plan: { requestedMode: mode, selectedMode: mode === 'AUTO' && t.sourceRevision > 1 ? 'INCREMENTAL' : 'FULL', reusedStepIds: [] },
      revisionId: rejected ? null : `${requestId}-revision`, artifactHash: rejected ? null : 'b'.repeat(64),
      ...(rejected?.diagnostic === undefined ? {} : { diagnostics: { steps: [{ diagnostics: [{ code: rejected.diagnostic }] }] } }),
    };
  };

  const execute = async (t: TestState): Promise<string> => {
    t.executions++;
    const executionId = `${t.id}-execution-${String(t.executions)}`;
    const targetUrl = /Go to (\S+)/.exec(t.steps[0]?.text ?? '')?.[1];
    if (targetUrl === undefined) throw new Error('Scripted runner needs a target step');
    for (const step of t.steps) {
      let action = classify(step.text).action;
      if (action !== undefined && options.wrongAccount?.includes(t.caseId) === true) {
        action = action === 'target' ? 'other' : action === 'other' ? 'target' : action;
      }
      if (action !== undefined) {
        await fetch(`${targetUrl}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      }
    }
    // The scripted runner always reports PASSED: only the independent fixture oracle can disagree.
    executions.set(executionId, { executionId, testId: t.id, revisionId: t.attempt?.revisionId, status: 'PASSED',
      errorCode: null, runtime: { ...PINS },
      stepResults: t.steps.map((s, i) => ({ stepIndex: i, originalText: s.text, status: 'PASS' })) });
    return executionId;
  };

  return async (url, init) => {
    if (fixtureOrigins.includes(url.origin)) return fetch(url, init);
    const method = init.method ?? 'GET';
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const path = url.pathname.replace(/^\/api\/v[12]\/studio/, '');
    if (path === '/tests' && method === 'POST') {
      const write0 = body as WriteBody;
      const id = `test-${String(++nextId)}`;
      const caseId = write0.name.replace(/^Evaluation /, '').split(':')[0] ?? '';
      const t: TestState = { id, caseId, steps: [], sourceRevision: 1, compiles: 0, attempt: null, executions: 0 };
      write(t, write0);
      tests.set(id, t);
      return json(view(t));
    }
    const match = /^\/(tests|executions)\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (match?.[1] === 'executions') {
      const run = executions.get(match[2] ?? '');
      return run ? json(run) : json({}, 404);
    }
    const t = tests.get(match?.[2] ?? '');
    if (!t) return json({}, 404);
    const action = match?.[3];
    if (action === undefined && method === 'GET') return json(view(t));
    if (action === undefined && method === 'PUT') {
      write(t, body as WriteBody);
      t.sourceRevision++;
      t.attempt = null;
      return json(view(t));
    }
    if (action === 'compile') {
      if (options.refuseFirstCompile?.includes(t.caseId) === true && !refused.has(t.id)) {
        refused.add(t.id);
        return json({ error: 'COMPILE_CAPACITY' }, 429);
      }
      compile(t, (body as { mode: string }).mode);
      return json({ compileRequestId: t.attempt?.compileRequestId, compileStatus: 'COMPILING' });
    }
    if (action === 'confirm-compile') return json(view(t));
    if (action === 'execute') return json({ executionId: await execute(t) });
    return json({}, 404);
  };
}
