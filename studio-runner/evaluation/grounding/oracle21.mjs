/* eslint-disable -- SC008-FIX-21 evaluation tooling: untyped .mjs harness, Node globals. */
// SC008-FIX-21 no-model oracle: runs each step's ground-truth code (step.oracle.good) and its wrong-code mutants (step.oracle.bad) through the
// same execAttempt as the model run (production admitStep/runStep on the replica pages, the one success rule). Expectations: good -> success,
// every bad -> not success. For clarification groups (expect != ACTION) only `bad` exists: an action must be judged a miss. No Vertex call.
//
//   node evaluation/grounding/oracle21.mjs --set tuning21|final21 [--only id,id]
// Node 24, run from studio-runner/.
import { existsSync } from 'node:fs';
import { execAttempt, loadUnits, startEnv } from './step-code.mjs';
import * as S from './lib/stepcode.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const setName = args.set ?? 'tuning21';
const only = args.only ? new Set(args.only.split(',')) : null;
const env = await startEnv();
let checks = 0; let wrong = 0; const rows = [];
try {
  for (const task of loadUnits(setName)) {
    if (only && !only.has(task.id)) continue;
    const session = S.makeSession(task, `${task.id}|plan0`);
    let plan = null;
    if (task.plan) {
      const stated = S.admitPlan({ kind: 'SOURCE_PLAN', obligations: task.plan.obligations.map(o => ({ stepId: session.sourceSteps[o.step].stepId, targetIntent: o.targetIntent, scopeIntent: o.scopeIntent ?? null, needId: o.needId ?? null, uses: o.uses ?? [] })), stepSections: [] }, session);
      plan = { obligations: stated.obligations, needs: stated.needs, sections: stated.sections };
    }
    const readIndex = new Map(session.sourceSteps.map((s, j) => [s.stepId, j]));
    const control = task.expect !== undefined && task.expect !== 'ACTION';
    const out = task.pattern === 'OUT';
    for (let i = 0; i < task.steps.length; i++) {
      const step = task.steps[i]; if (step.noRun || !step.oracle) continue;
      const stepId = session.sourceSteps[i].stepId;
      for (const [kind, codes] of [['good', [step.oracle.good ?? []].flat()], ['bad', step.oracle.bad ?? []]]) for (const [n, code] of codes.entries()) {
        const bindingId = plan?.needs?.[0]?.bindingId ?? '';
        const r = await execAttempt(env, { task, i, code: code.split('%B%').join(bindingId), plan, stepId, readIndex, control, out });
        const success = r.void ? null : r.prepareFailed ? false : r.judged.success;
        const reason = r.void ?? (r.prepareFailed ? `PRE_FENCE ${r.closedCode}` : r.judged.reason);
        const as = kind === 'good' ? success === true : success === false;
        checks++; if (!as) wrong++;
        rows.push(`${as ? 'ok  ' : 'WRONG'} ${task.id}|${i} ${kind}${n} -> ${success} ${reason}`);
      }
    }
  }
} finally { await env.close(); }
console.log(rows.join('\n'));
console.log(`oracle ${setName}: ${checks - wrong}/${checks} as expected`);
process.exitCode = wrong === 0 ? 0 : 1;
