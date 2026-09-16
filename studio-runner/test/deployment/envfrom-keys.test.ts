/**
 * Story 10.18b, AC-18: every key this deployment feeds a container through `envFrom` must be a
 * valid environment-variable name.
 *
 * ⚠ **THIS FILE IS EXPECTED TO BE RED, AND THAT IS THE DELIVERABLE.**
 *
 * `templates/configmap.yaml` renders `configOverrides` as ConfigMap *keys* and the containers
 * consume them through `envFrom: configMapRef`. A ConfigMap key may contain dots; an environment
 * variable name may not. Kubernetes skips a key that is not a valid `C_IDENTIFIER` and reports it
 * as an event on the pod — it does not fail the pod, and nothing in this repository was looking.
 * The chart's `configOverrides` mechanism has therefore been **inert since it was written**, and
 * every dotted key in it has been a setting an operator believed they had applied.
 *
 * This story put deployed configuration at the centre of five security controls (AC-6, AC-10a,
 * AC-12, AC-13a, AC-19a), each of which is worthless if the value never reaches the process. So
 * AC-18 makes the mechanism a check rather than an assumption — and it is a check this repository
 * currently fails.
 *
 * **It is left red, not allowlisted.** AC-18 says so in as many words, and ADR-002 §12's "leave it
 * red and escalate" rule is why: grandfathering the existing dotted keys into an exception list
 * produces a guard that cannot fail, which is the fifteenth catalogued shape and the exact outcome
 * this epic keeps finding a round too late. Converting the keys is also not this story's to do —
 * `spring.datasource.hikari.maximum-pool-size` and `checks.scheduling.min-interval-seconds` are
 * database and scheduler settings, and changing how they reach the process is a deployment
 * behaviour change in unrelated subsystems, landed inside a Studio story, unreviewed by their
 * owners.
 *
 * **The escalation, with the exact list and a named owner**, is in the failure message below, in
 * `docs/runbooks/studio-runner.md` §11, and in `ci/stages.md` stage 9.
 *
 * **This story's OWN values conform**: `studioSse.*`, `backend.identityBypass.*` and every runner
 * key render as `STUDIO_SSE_*`, `CHECKS_BYPASS_*` and `STUDIO_RUNNER_*`. That is asserted
 * separately below, so the escalation above cannot be read as covering for this story's own
 * additions.
 */
import { describe, expect, it } from 'vitest';

import { byKind, render, VALUE_SETS, valueSetName } from './helm.js';
import type { Container, K8sDocument, RenderOutcome } from './helm.js';

/**
 * The name a Kubernetes environment variable must have.
 *
 * Kubernetes validates `envFrom`-derived names with `IsCEnvIdentifier`; a key that fails it is
 * skipped and reported as an `InvalidVariableNames` event. This is the same expression AC-18
 * names: `[A-Za-z_][A-Za-z0-9_]*`.
 */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

interface Violation {
  readonly valueSet: string;
  readonly configMap: string;
  readonly consumedBy: string;
  readonly key: string;
}

function containersOf(document: K8sDocument): readonly Container[] {
  const spec = document.spec as { template?: { spec?: { containers?: readonly Container[] } } } | undefined;
  return spec?.template?.spec?.containers ?? [];
}

/**
 * Every `envFrom`-consumed ConfigMap key in the rendered manifest that cannot become an
 * environment variable.
 *
 * Deliberately driven from the **consumer** side: it walks the containers, follows each
 * `envFrom: configMapRef` to the ConfigMap that render produced, and checks that ConfigMap's keys.
 * Walking the ConfigMaps instead would report keys nothing consumes — and would miss the one thing
 * that matters, which is that a container believes it received them.
 */
export function envFromViolations(outcome: RenderOutcome, valueSet: string): Violation[] {
  const configMaps = new Map<string, Record<string, string>>();
  for (const document of byKind(outcome, 'ConfigMap')) {
    configMaps.set(document.metadata?.name ?? '', document.data ?? {});
  }

  const violations: Violation[] = [];
  for (const document of byKind(outcome, 'Deployment')) {
    for (const container of containersOf(document)) {
      for (const source of container.envFrom ?? []) {
        const reference = source['configMapRef'] as { name?: string } | undefined;
        const name = reference?.name;
        if (name === undefined) continue;
        const data = configMaps.get(name);
        if (data === undefined) {
          // A container consuming a ConfigMap this chart does not render is a different defect,
          // and a silent one: every key would be missing rather than some.
          violations.push({
            valueSet,
            configMap: name,
            consumedBy: `${document.metadata?.name ?? ''}/${container.name ?? ''}`,
            key: '<the ConfigMap itself is not rendered by this chart>',
          });
          continue;
        }
        for (const key of Object.keys(data)) {
          if (!ENV_NAME.test(key)) {
            violations.push({
              valueSet,
              configMap: name,
              consumedBy: `${document.metadata?.name ?? ''}/${container.name ?? ''}`,
              key,
            });
          }
        }
      }
    }
  }
  return violations;
}

function describeViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => `  ${v.valueSet}: ${v.configMap}[${v.key}] → ${v.consumedBy}`)
    .join('\n');
}

/**
 * The pre-existing violating keys, **frozen**, and the inventory the AC-18 escalation covers.
 *
 * Identical in all four value sets, measured rather than transcribed: 15 occurrences, 13 distinct.
 * This exists because AC-18's red is permanent, and a permanently red assertion has no observable
 * states left with which to detect anything — so the detection has to be a comparison against a
 * baseline rather than an absence.
 *
 * **Updating this list is a deliberate act.** Adding an entry means accepting a new setting that
 * silently never reaches its process; removing one means the escalation is being resolved, and the
 * removal belongs in the PR that resolves it.
 */
const ESCALATED_KEYS: readonly string[] = [
  'checks.executor.max-concurrency',
  'checks.executor.source-limits.APPDYNAMICS',
  'checks.executor.source-limits.GRAFANA',
  'checks.executor.source-limits.HTTP',
  'checks.executor.source-limits.ITRS',
  'checks.executor.source-limits.SPLUNK',
  'checks.executor.source-limits.TCP',
  'checks.executor.source-limits.UI_TEST',
  'checks.scheduling.batch-size',
  'checks.scheduling.min-interval-seconds',
  'checks.scheduling.poll-interval-ms',
  'checks.scheduling.shutdown-timeout-sec',
  'spring.datasource.hikari.maximum-pool-size',
];

/** 13 distinct keys, two of which are rendered into both the api and the worker ConfigMap. */
const ESCALATED_VIOLATION_COUNT = 15;

const ESCALATION = [
  '',
  'AC-18 ESCALATION — this failure is the deliverable, not a bug in this test.',
  '',
  'Each key above is rendered into a ConfigMap that a container consumes with',
  '`envFrom: configMapRef`. Kubernetes skips any key that is not a valid C identifier and',
  'reports it as an InvalidVariableNames event on the pod. The pod starts; the setting does',
  'not arrive. Every one of these has been silently inert since the chart was written.',
  '',
  'NOT FIXED HERE, DELIBERATELY. These are database and scheduler settings. Converting them —',
  'to SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE, or to a mounted application config file, or',
  'to SPRING_APPLICATION_JSON — changes deployment behaviour in subsystems this Studio story',
  'does not own and whose owners have not reviewed it. Allowlisting them instead would produce',
  'a guard that cannot fail (ADR-002 §12, "leave it red and escalate").',
  '',
  'OWNER: @devops (Gage) owns the chart and the deployment mechanism and carries this to',
  'resolution. MECHANISM DECISION: @architect (Aria) — env-name conversion vs. a mounted config',
  'file vs. SPRING_APPLICATION_JSON is a configuration-architecture choice, not a rename.',
  'This story raises it; it does not decide it.',
  '',
  "THIS STORY'S OWN VALUES CONFORM — see the assertion below; the failure above is entirely",
  'pre-existing and none of these keys was introduced by story 10.18b.',
].join('\n');

describe('AC-18 — every envFrom-consumed key is a valid environment-variable name', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: EXPECTED RED — dotted configOverrides keys never reach the process`, () => {
      const violations = envFromViolations(render({ valuesFile }), label);
      expect(
        violations,
        `${String(violations.length)} envFrom key(s) cannot become environment variables:\n` +
          `${describeViolations(violations)}\n${ESCALATION}`,
      ).toEqual([]);
    });
  }

  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: the escalated set is EXACTLY the thirteen — nothing new hides inside the red`, () => {
      // **QA TEST-001, the twentieth catalogued vacuous-guard shape, and it was mine.**
      //
      // This assertion used to filter the violations by a naming allowlist —
      // `/^(STUDIO_SSE_|CHECKS_BYPASS_|STUDIO_RUNNER_|STUDIO_OBJECT_STORE_|STUDIO_EVIDENCE_)/` —
      // and assert the remainder was empty. It was falsified with a FAVOURABLE mutation: M15 added
      // `STUDIO_SSE_HEARTBEAT.seconds`, which matches a prefix, so the control fired and looked
      // like a guard.
      //
      // QA ran the unfavourable one. Adding `checks.studio.qa-probe-7255` to
      // `backend.configOverrides` produced **4 failed / 3 passed — byte-identical to the
      // unmutated baseline**: the four `toEqual([])` assertions above were already red, each
      // silently gained a key, and **no number moved**. AC-18's intentional red ABSORBS any new
      // invalid key that does not happen to carry one of this story's five prefixes. A permanently
      // red assertion cannot also be a detector, because it has no observable states left.
      //
      // The repair is to stop scoping by name and scope by **baseline diff**: the escalated set is
      // frozen, and equality is asserted both ways. Any key that enters — whoever adds it, whatever
      // it is called — moves this. Any key that leaves means the escalation is being resolved and
      // the frozen set must be updated deliberately, in the PR that resolves it.
      const violations = envFromViolations(render({ valuesFile }), label);
      const distinct = [...new Set(violations.map((v) => v.key))].sort();

      expect(
        distinct,
        'the set of invalid envFrom keys has changed. If a key was ADDED, it is a new setting that ' +
          'will never reach its process and it must be given a valid environment-variable name — ' +
          'the AC-18 escalation does not cover it. If a key was REMOVED, update ESCALATED_KEYS in ' +
          `the PR that removed it.\n${describeViolations(violations)}`,
      ).toEqual([...ESCALATED_KEYS]);

      // The occurrence count as well as the key set: `checks.scheduling.min-interval-seconds` and
      // `spring.datasource.hikari.maximum-pool-size` are rendered into BOTH the api and the worker
      // ConfigMap, so a third consumer of an already-listed key would leave the key set unchanged
      // and must still move a number.
      expect(violations.length, describeViolations(violations)).toBe(ESCALATED_VIOLATION_COUNT);
    });
  }

  it('the check DISCRIMINATES: a conforming ConfigMap produces no violations', () => {
    // The red above must be the chart's, not a broken checker's. `SERVER_PORT` is rendered into
    // every one of these ConfigMaps and is a valid name; if the checker flagged everything, this
    // would be impossible to satisfy.
    const outcome = render();
    const all = envFromViolations(outcome, 'values.yaml');
    const keys = new Set(all.map((v) => v.key));
    expect(keys.has('SERVER_PORT')).toBe(false);
    // …and it is genuinely finding things, or "no violations" would mean nothing.
    expect(all.length).toBeGreaterThan(0);
  });

  it('the check FIRES on a NEW dotted key — M15, inside the measurement window', () => {
    // The mutation AC-18 names: add a dotted key to this story's own values. The override goes to
    // the `helm template` invocation this assertion reads, so there is no cached rendering.
    const mutated = envFromViolations(
      render({ args: ['--set', 'backend.configOverrides.studio\\.sse\\.heartbeat=15s'] }),
      'mutated',
    );
    expect(mutated.map((v) => v.key)).toContain('studio.sse.heartbeat');
  });

  it("QA's UNFAVOURABLE probe moves a number — the key set is not scoped by name", () => {
    // `checks.studio.qa-probe-7255` carries none of the five prefixes the defective control
    // matched on, which is exactly why QA chose it: against the old control it changed nothing at
    // all. Kept in the suite rather than only in the record, so the twentieth shape cannot be
    // reintroduced by someone who finds the frozen list inconvenient.
    const mutated = envFromViolations(
      render({ args: ['--set', 'backend.configOverrides.checks\\.studio\\.qa-probe-7255=1'] }),
      'qa-probe',
    );
    const distinct = [...new Set(mutated.map((v) => v.key))].sort();

    expect(distinct).not.toEqual([...ESCALATED_KEYS]);
    expect(distinct).toContain('checks.studio.qa-probe-7255');
    expect(mutated.length).toBe(ESCALATED_VIOLATION_COUNT + 1);
  });
});
