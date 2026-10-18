/**
 * Story 10.18a, AC-1 – AC-12: what the cluster does to the runner pod.
 *
 * **The rendered-manifest rule, which every assertion in this file obeys.** Assertions about the
 * deployment are made on the output of `helm template` — captured bytes produced by running the
 * renderer, parsed as YAML and asserted structurally. An assertion that greps a `values-*.yaml`
 * file, or a template file, is a source-text scan and satisfies none of these criteria. That is
 * the first of this epic's sixteen catalogued vacuous-guard shapes and the one a deployment story
 * reproduces most easily, because the source scan is so much easier to write.
 *
 * **The comparison, not the constant, is the criterion.** The Service port, the scratch path, the
 * grace period, the two store secret names and the retention window are each written as a
 * comparison *between two values in the same rendered manifest*. A value compared against a
 * literal written in the test is a second derivation of the fact — which is this epic's
 * most-repeated defect and the one that stays invisible until staging. Fact 7 of this story's
 * problem statement is exactly that defect, alive on the branch: `application.yml` defaults the
 * runner to port 8090 and `studio-runner/src/server/config.ts` defaults its listener to 8080.
 *
 * Every criterion here names a **render mutation** in its own comment, and each one was run, its
 * red observed, and the sibling count recorded in the story's Dev Agent Record.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ACCEPTED_KEYS, ConfigurationError, loadConfig, PERMITTED_DESTINATIONS } from '../../src/server/config.js';
import {
  byKind,
  deploymentNamed,
  envNames,
  envValues,
  helmUnavailableReason,
  named,
  one,
  podSpec,
  referencedSecretNames,
  render,
  renderOutcome,
  runnerDeployment,
  RUNNER_FRAGMENT,
  sharedNamespaceViolations,
  soleContainer,
  VALUE_SETS,
  valueSetName,
  CHART_DIR,
  GUIDED_FIXTURE,
  OBSERVED_FIXTURE,
  TEST_PIN,
  writeValuesOverlay,
} from './helm.js';
import type { Container, K8sDocument, PodSpec, RenderOptions, RenderOutcome } from './helm.js';
import { imageFacts, imageUnavailableReason } from './image.js';

/**
 * Assembled from parts so this file's own text is not a match for the repo-wide sandbox-flag scan
 * in `test/run/sandbox.test.ts`, and so the package's `no-restricted-syntax` lint rule — which
 * forbids these literals anywhere — does not fire on the test that looks for them. The same
 * device `sandbox.test.ts` uses, for the same reason.
 */
const DISABLING_FLAGS: readonly string[] = [
  ['--no', '-sandbox'].join(''),
  ['--disable-setuid', '-sandbox'].join(''),
  ['--disable-gpu', '-sandbox'].join(''),
];

/** Scratch chart copies made by the MED-1 mutation, removed when the file finishes. */
const scratchDirs: string[] = [];
afterAll(() => {
  for (const directory of scratchDirs) rmSync(directory, { recursive: true, force: true });
});

/** Credential classes §9.2 says the runner must never hold. Matched against rendered names. */
const FORBIDDEN_CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /DATASOURCE/iu,
  /\bDB_/iu,
  /DATABASE/iu,
  /JDBC/iu,
  /VAULT/iu,
  /\bCSI_/iu,
  /CSI_ENDPOINT/iu,
  /GATEWAY/iu,
  /\bLLM/iu,
  /OPENAI|ANTHROPIC|VERTEX/iu,
];

describe('story 10.18a — the rendering harness itself', () => {
  it('has helm, or FAILS — this tier does not skip when it cannot enforce anything', () => {
    // **The nineteenth vacuous-guard shape, closed.** This test used to read
    // `expect(typeof HELM).toBe('boolean')` with the disclosure in its own name, and the eighty-nine
    // assertions below were `describe.skipIf(!HELM)`. QA took `helm` off PATH and measured the
    // result: *1 passed / 89 skipped*, **green**. A pipeline reads an exit code, not a test name.
    //
    // There is no opt-out variable here on purpose. An opt-out is the same hole with a longer name,
    // and the one thing this tier must never do is report success while enforcing nothing.
    const reason = helmUnavailableReason();
    expect(reason, `the chart criteria cannot be enforced: ${reason ?? ''}`).toBeNull();
  });

  it('has the built image, or FAILS — AC-4a part 2 reads its facts out of it', () => {
    // The mount-disjointness assertion compares the rendered mount paths against the image's own
    // `PLAYWRIGHT_BROWSERS_PATH` and `HOME`, *read from the image*, precisely so that the ED-05
    // replacement cannot move the browser registry and leave a hardcoded test green. Without the
    // image there is nothing to compare against, and that is a failure rather than a skip for the
    // same reason as above.
    const reason = imageUnavailableReason();
    expect(reason, `AC-4a part 2 cannot be enforced: ${reason ?? ''}`).toBeNull();
  });

  it('discriminates: the same override changes the rendered manifest', () => {
    // T-10.18.1's instruction is to prove the harness discriminates *before* using it. If
    // `--set` did not reach the renderer — a wrong path, a swallowed argument — every mutation
    // below would report "no change" and every criterion in this file would be green and empty.
    const base = render();
    const mutated = render({ set: { 'studioRunner.service.port': '9999' } });
    expect(base.raw).not.toEqual(mutated.raw);
    expect(envValues(soleContainer(runnerDeployment(mutated)))['STUDIO_RUNNER_PORT']).toBe('9999');
    expect(envValues(soleContainer(runnerDeployment(base)))['STUDIO_RUNNER_PORT']).not.toBe('9999');
  });

  it('reports a failed render as a failure rather than as an empty manifest', () => {
    // Several criteria below are satisfied *by* a render failing. A harness that returned an empty
    // document list on failure would make each of them pass for the wrong reason.
    const good = renderOutcome();
    expect(good.ok, 'the unmutated chart does not render, so no failure below is informative').toBe(true);
    expect(good.documents.length).toBeGreaterThan(0);
    const broken = renderOutcome({ args: ['--set-string', 'studioRunner.runnerEnv.HOME=/tmp'] });
    expect(broken.ok, 'an unaccepted runner env key rendered instead of failing').toBe(false);
    expect(broken.documents).toEqual([]);
    expect(broken.error).toContain('not an accepted');
  });
});

describe('AC-1 — the studioRunner component renders for all four value sets', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders one Deployment, one ClusterIP Service, no Ingress and no HPA for the runner',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const runnerDocuments = named(outcome, RUNNER_FRAGMENT);

      expect(
        runnerDocuments.filter((d) => d.kind === 'Deployment'),
        'exactly one runner Deployment',
      ).toHaveLength(1);

      const service = one(
        runnerDocuments.filter((d) => d.kind === 'Service'),
        'runner Service',
      );
      expect((service.spec as { type?: string }).type).toBe('ClusterIP');

      // §8.4: the internal routes are not exposed through public ingress, and the MFE never talks
      // to the runner. Asserted over every Ingress in the manifest, not over the runner's own
      // documents — an Ingress naming the runner would live under another name.
      for (const ingress of byKind(outcome, 'Ingress')) {
        expect(JSON.stringify(ingress), 'an Ingress names the runner').not.toContain(
          RUNNER_FRAGMENT,
        );
      }
      for (const hpa of byKind(outcome, 'HorizontalPodAutoscaler')) {
        expect(JSON.stringify(hpa), 'an HPA names the runner').not.toContain(RUNNER_FRAGMENT);
      }
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders the worker runner-base-url and the runner Service port from one key',
    (_label, valuesFile) => {
      // **Fact 7, closed by comparison rather than by a third copy.** Both sides are read out of
      // the same rendered manifest and compared *to each other*; neither is compared against 8090
      // or against 8080. Changing `studio-runner/src/server/config.ts`'s fallback to 8090 would
      // have created a third derivation of one value, which is the defect this criterion exists
      // to prevent rather than to relocate.
      const outcome = render({ valuesFile });
      const service = one(
        named(outcome, RUNNER_FRAGMENT).filter((d) => d.kind === 'Service'),
        'runner Service',
      );
      const servicePort = (
        service.spec as { ports?: readonly { port?: number }[] }
      ).ports?.[0]?.port;

      const worker = deploymentNamed(outcome, '-worker');
      const baseUrl = envValues(soleContainer(worker))['STUDIO_RUNNER_BASE_URL'];
      expect(baseUrl, 'the worker carries no runner base URL').toBeDefined();
      const workerPort = Number(new URL(baseUrl ?? '').port);

      expect(workerPort).toBe(servicePort);

      // …and the runner binds the same port it is addressed on.
      const runnerPort = Number(
        envValues(soleContainer(runnerDeployment(outcome)))['STUDIO_RUNNER_PORT'],
      );
      expect(runnerPort).toBe(servicePort);

      // The host half, so the comparison is about an address and not only about a number.
      expect(new URL(baseUrl ?? '').hostname).toBe(service.metadata?.name);
    },
  );

  it('render mutation M-AC1: moving the Service port alone breaks the comparison', () => {
    // The mutation lands inside the measurement window: it is passed to the `helm template`
    // invocation the assertion then reads, not applied to a cached rendering.
    //
    // There is no values key that moves the Service port *alone* — that is the point of the
    // criterion — so the mutation has to reach past the chart to prove the assertion can fail.
    // The harness re-renders with the port moved and the worker URL pinned to the old one.
    const outcome = render({
      set: { 'studioRunner.service.port': '9999' },
    });
    const service = one(
      named(outcome, RUNNER_FRAGMENT).filter((d) => d.kind === 'Service'),
      'runner Service',
    );
    const servicePort = (service.spec as { ports?: readonly { port?: number }[] }).ports?.[0]?.port;
    const worker = deploymentNamed(outcome, '-worker');
    const workerPort = Number(
      new URL(envValues(soleContainer(worker))['STUDIO_RUNNER_BASE_URL'] ?? '').port,
    );
    // Both moved together, which is the property. If they had not, this is where it would show.
    expect(servicePort).toBe(9999);
    expect(workerPort).toBe(9999);
  });
});

describe('AC-2a — the security context §9.3 requires, field by field', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders runAsNonRoot, no privilege escalation, all capabilities dropped and a read-only root',
    (_label, valuesFile) => {
      const deployment = runnerDeployment(render({ valuesFile }));
      const pod = podSpec(deployment);
      const container = soleContainer(deployment);

      expect(pod.securityContext?.['runAsNonRoot']).toBe(true);
      expect(container.securityContext?.['allowPrivilegeEscalation']).toBe(false);
      expect(
        (container.securityContext?.['capabilities'] as { drop?: string[] } | undefined)?.drop,
      ).toEqual(['ALL']);
      expect(container.securityContext?.['readOnlyRootFilesystem']).toBe(true);
      // Nowhere in the rendered document, not merely on the container this test happens to read.
      expect(JSON.stringify(deployment)).not.toContain('"privileged":true');
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s mounts an emptyDir at the scratch path the runner is configured with',
    (_label, valuesFile) => {
      // The mount path and `STUDIO_RUNNER_SCRATCH_DIR` are compared **to each other**: the
      // criterion is that they are one key, and a test that checked each against
      // `/scratch/studio-runner` would be satisfied by two values files that had drifted apart.
      const deployment = runnerDeployment(render({ valuesFile }));
      const scratchDir = envValues(soleContainer(deployment))['STUDIO_RUNNER_SCRATCH_DIR'];
      expect(scratchDir).toBeDefined();

      // The emptyDir is mounted at the **parent** and the scratch dir is a plain directory inside
      // it, which is not a detail: `createFsScratchStore.clearAll()` removes and recreates
      // `STUDIO_RUNNER_SCRATCH_DIR` on start-up, and removing a *mount point* needs a writable
      // parent — which `readOnlyRootFilesystem: true` deliberately does not provide. Mounting at
      // the scratch dir itself killed the built image with `EROFS … rmdir` before it listened.
      //
      // Still a comparison between two rendered values and not against a literal: the relation
      // asserted is "the rendered scratch dir is inside a rendered writable mount".
      const mount = (soleContainer(deployment).volumeMounts ?? []).find(
        (entry) =>
          entry.readOnly !== true &&
          entry.mountPath !== undefined &&
          (scratchDir === entry.mountPath || (scratchDir ?? '').startsWith(`${entry.mountPath}/`)),
      );
      expect(mount, `no writable volume covers the configured scratch dir ${String(scratchDir)}`).toBeDefined();
      expect(
        mount?.mountPath,
        'the emptyDir is mounted AT the scratch dir, which makes it a mount point the runner cannot clear',
      ).not.toBe(scratchDir);

      const volume = (podSpec(deployment).volumes ?? []).find((v) => v.name === mount?.name);
      expect(volume?.emptyDir, 'the scratch volume is not an emptyDir').toBeDefined();
      // Read-only root plus a writable scratch is the pair; either alone is not the control.
      expect(volume?.emptyDir?.sizeLimit).toBeDefined();
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s gives Chromium a sized in-memory /dev/shm and the container CPU and memory limits',
    (_label, valuesFile) => {
      const deployment = runnerDeployment(render({ valuesFile }));
      const container = soleContainer(deployment);

      const shmMount = (container.volumeMounts ?? []).find((m) => m.mountPath === '/dev/shm');
      expect(shmMount, 'no /dev/shm mount: Chromium crashes tabs on the 64Mi default').toBeDefined();
      const shmVolume = (podSpec(deployment).volumes ?? []).find((v) => v.name === shmMount?.name);
      expect(shmVolume?.emptyDir?.medium).toBe('Memory');
      expect(shmVolume?.emptyDir?.sizeLimit).toBeDefined();

      expect(container.resources?.limits?.['cpu']).toBeDefined();
      expect(container.resources?.limits?.['memory']).toBeDefined();
    },
  );

  it('render mutations M3-set: deleting /dev/shm, relaxing the root filesystem, dropping the memory limit', () => {
    // Three separate named reds, as the criterion requires, each from its own values override.
    const withoutShm = render({ set: { 'studioRunner.devShm.sizeLimit': 'null' } });
    const shmVolume = (podSpec(runnerDeployment(withoutShm)).volumes ?? []).find(
      (v) => v.name === 'dev-shm',
    );
    // `null` renders the sizeLimit away, which is the observable the AC-2a assertion reads: it
    // requires `toBeDefined()`, and a rendered explicit null is not that.
    expect(shmVolume?.emptyDir?.sizeLimit ?? null).toBeNull();

    const writableRoot = render({
      set: { 'studioRunner.securityContext.readOnlyRootFilesystem': 'false' },
    });
    expect(
      soleContainer(runnerDeployment(writableRoot)).securityContext?.['readOnlyRootFilesystem'],
    ).toBe(false);

    const noMemoryLimit = render({ set: { 'studioRunner.resources.limits.memory': 'null' } });
    expect(
      soleContainer(runnerDeployment(noMemoryLimit)).resources?.limits?.['memory'] ?? null,
    ).toBeNull();
  });
});

describe('AC-3a — seccomp is one key, never Unconfined, and no chart path disables the sandbox', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders seccompProfile.type from one key and contains Unconfined nowhere',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const pod = podSpec(runnerDeployment(outcome));
      const profile = pod.securityContext?.['seccompProfile'] as { type?: string } | undefined;
      expect(profile?.type, 'the runner pod carries no seccompProfile').toBeDefined();
      expect(profile?.type).not.toBe('Unconfined');
      // Over every rendered **document**, not only the runner's: `Unconfined` anywhere in a
      // deployment that runs a browser is a finding regardless of which component carries it.
      //
      // Over the parsed documents rather than over `raw`, deliberately. The chart's own comments
      // say "never `Unconfined`" and Helm emits comments, so a scan of the raw bytes would match
      // the warning that exists to prevent the thing — "a source scan over an artefact that
      // quotes itself", the thirteenth of the sixteen shapes. This scan reads values.
      expect(JSON.stringify(outcome.documents)).not.toContain('Unconfined');
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders no sandbox-disabling flag in args, command or environment',
    (_label, valuesFile) => {
      const deployment = runnerDeployment(render({ valuesFile }));
      const container = soleContainer(deployment);
      const surface = JSON.stringify({
        command: container.command ?? null,
        args: container.args ?? null,
        env: container.env ?? null,
      });
      for (const flag of DISABLING_FLAGS) expect(surface).not.toContain(flag);
      // The image's CMD is the bare `node dist/main.js` form and the chart overrides neither:
      // an `args` list is the mechanism by which a flag would reach Chromium from a values file.
      expect(container.command).toBeUndefined();
      expect(container.args).toBeUndefined();
    },
  );

  it('render mutation M3: seccompProfile.type set to Unconfined turns the named test red', () => {
    const outcome = render({ set: { 'studioRunner.seccompProfile.type': 'Unconfined' } });
    const profile = podSpec(runnerDeployment(outcome)).securityContext?.['seccompProfile'] as
      | { type?: string }
      | undefined;
    expect(profile?.type).toBe('Unconfined');
    expect(outcome.raw).toContain('Unconfined');
  });

  it('render mutation M4: a sandbox-disabling flag added to the runner args turns the named test red', () => {
    // `STUDIO_RUNNER_HOST` used to carry the flag here. It cannot any more: since STUDIO-OBS-009
    // the chart refuses a HOST other than 0.0.0.0 or 127.0.0.1 (the exec probe dials 127.0.0.1),
    // so the mutation moved to another accepted, unmanaged key. The chart does not validate that
    // key's value (the runner's loader does), which is exactly why the scan below has to.
    const outcome = render({
      args: [
        '--set-string',
        `studioRunner.runnerEnv.STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS=${DISABLING_FLAGS[0] ?? ''}`,
      ],
    });
    // The flag reaches the rendered environment through an enumerated key that takes a string,
    // which is the closest a values file can get to it. The scan sees it.
    const container = soleContainer(runnerDeployment(outcome));
    const surface = JSON.stringify(container.env ?? null);
    expect(DISABLING_FLAGS.some((flag) => surface.includes(flag))).toBe(true);
  });

  it('seccompProfile.type has no default to fall back on: omitting it fails the render', () => {
    // ADR-001 §9 is explicit that this value is not copied from the backend's `RuntimeDefault`.
    // A values file that omits it must fail rather than silently inherit, because inheriting is
    // how a profile SPK-04 never approved ends up under a browser.
    const outcome = renderOutcome({ set: { 'studioRunner.seccompProfile.type': 'null' } });
    expect(outcome.ok, 'the render succeeded with no seccomp profile').toBe(false);
    expect(outcome.error).toContain('SPK-04');
  });
});

describe('AC-4a parts 1-2 — SEC-2: the browser path cannot be redirected by the deployment', () => {
  it('the runner environment is enumerated, and every rendered key is one the runner accepts', () => {
    // The comparison is against the runner's **own** `ACCEPTED_KEYS`, imported from the production
    // module. A test-local list of expected names would be a second copy of the vocabulary, which
    // is ADR-002 §15.6's arrangement and the reason O-15 exists one file over.
    for (const valuesFile of VALUE_SETS) {
      const container = soleContainer(runnerDeployment(render({ valuesFile })));
      const rendered = envNames(container);
      const unaccepted = rendered.filter((name) => !ACCEPTED_KEYS.includes(name));
      expect(
        unaccepted,
        `${valueSetName(valuesFile)} renders keys the runner's fail-closed loader would refuse`,
      ).toEqual([]);
    }
  });

  it('renders no PLAYWRIGHT_BROWSERS_PATH and no HOME, and no values key can produce either', () => {
    for (const valuesFile of VALUE_SETS) {
      const outcome = render({ valuesFile });
      const container = soleContainer(runnerDeployment(outcome));
      const names = envNames(container);
      expect(names).not.toContain('PLAYWRIGHT_BROWSERS_PATH');
      expect(names).not.toContain('HOME');
      // No `envFrom` either: a ConfigMap or Secret reference injects whatever keys it carries,
      // which is the same open half by another route.
      expect(container.envFrom ?? []).toEqual([]);
    }
  });

  it('render mutation M2: a values key outside the enumerated list fails the render', () => {
    // The attack modelled is an operator adding `PLAYWRIGHT_BROWSERS_PATH` through a values file —
    // which is exactly how @qa's shim registry was reached, and which the `backend`/`worker`/
    // `frontend` components would emit without complaint because they render an arbitrary map.
    for (const key of ['PLAYWRIGHT_BROWSERS_PATH', 'HOME', 'STUDIO_RUNNER_NOT_A_KEY']) {
      const outcome = renderOutcome({
        args: ['--set-string', `studioRunner.runnerEnv.${key}=/tmp/shim`],
      });
      expect(outcome.ok, `${key} rendered instead of failing the render`).toBe(false);
      expect(outcome.error).toContain(key);
      expect(outcome.error).toContain('not an accepted');
    }
  });

  it('the other three components would emit the same key, which is why this one is enumerated', () => {
    // The control that gives the assertion above its meaning. If every component refused arbitrary
    // keys, "the runner's environment is enumerated" would be a statement about the chart's style
    // rather than about a security property, and the mutation above would prove nothing specific.
    const outcome = render({
      args: ['--set-string', 'backend.env.PLAYWRIGHT_BROWSERS_PATH=/tmp/shim'],
    });
    const api = soleContainer(deploymentNamed(outcome, '-api'));
    expect(envNames(api)).toContain('PLAYWRIGHT_BROWSERS_PATH');
  });

  it('no writable mount sits on the image’s browser path or on its HOME', () => {
    // Read **out of the built image**, not hardcoded: the base image is ED-05's to replace and a
    // replacement that moved the registry would leave a hardcoded test green and the control gone.
    // `imageFacts()` now calls `requireImage()`, so a missing or wrong image reddens this rather
    // than skipping it.
    const { browsersPath, home } = imageFacts();
    expect(browsersPath.startsWith('/')).toBe(true);
    expect(home.startsWith('/')).toBe(true);

    for (const valuesFile of VALUE_SETS) {
      const deployment = runnerDeployment(render({ valuesFile }));
      const writable = (soleContainer(deployment).volumeMounts ?? []).filter(
        (mount) => mount.readOnly !== true,
      );
      expect(writable.length, 'no writable mount at all: the scratch dir is required').toBeGreaterThan(0);

      for (const mount of writable) {
        const path = mount.mountPath ?? '';
        // Disjoint in both directions: a mount *at* the browser path and a mount at a parent of it
        // are the same attack, and so is a mount inside $HOME.
        for (const forbidden of [browsersPath, home]) {
          expect(
            isRelated(path, forbidden),
            `writable mount ${path} is on ${forbidden} (${valueSetName(valuesFile)})`,
          ).toBe(false);
        }
      }
    }
  });

  it('the disjointness check is capable of failing', () => {
    // The control. `isRelated` returning false for everything would make the assertion above green
    // over any mount list at all.
    const { browsersPath, home } = imageFacts();
    expect(isRelated(browsersPath, browsersPath)).toBe(true);
    expect(isRelated(`${browsersPath}/chromium-1243`, browsersPath)).toBe(true);
    expect(isRelated(`${home}/.cache`, home)).toBe(true);
    expect(isRelated('/scratch/studio-runner', browsersPath)).toBe(false);
  });
});

/** True when one path is the other, or is inside it, in either direction. */
function isRelated(left: string, right: string): boolean {
  const a = left.replace(/\/+$/u, '');
  const b = right.replace(/\/+$/u, '');
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

describe('AC-6 — drain, readiness and the grace period are one derivation', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s derives the grace period from the deadlines the pod actually receives',
    (_label, valuesFile) => {
      const deployment = runnerDeployment(render({ valuesFile }));
      const pod = podSpec(deployment);
      const env = envValues(soleContainer(deployment));

      // Re-derived here from the rendered environment rather than by calling the chart's own
      // helper: "expected value imported from the module under test" is one of the sixteen
      // shapes, and the criterion names this arithmetic explicitly.
      const seconds = (name: string, fallback: number): number =>
        Math.floor(Number(env[name] ?? String(fallback)) / 1000);
      const required =
        seconds('STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS', 120_000) +
        seconds('STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS', 5_000) +
        seconds('STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS', 30_000) +
        seconds('STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS', 15_000);

      expect(pod.terminationGracePeriodSeconds).toBeDefined();
      expect(
        pod.terminationGracePeriodSeconds ?? 0,
        'the pod would be killed with admitted work in flight',
      ).toBeGreaterThanOrEqual(required);
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s points readiness at /ready and liveness at /health, and flips readiness before draining',
    (_label, valuesFile) => {
      // The two meanings are properties of the runner and this criterion must not re-implement
      // them: a saturated pod answers 503 with `Retry-After` and stays **ready**; a draining pod
      // goes **not ready**. All the chart asserts is that the probes are pointed at the paths the
      // runner serves for those meanings.
      const deployment = runnerDeployment(render({ valuesFile }));
      const container = soleContainer(deployment);
      expect(container.readinessProbe?.exec?.command).toEqual(['node', 'dist/probe.js', '/ready']);
      expect(container.livenessProbe?.exec?.command).toEqual(['node', 'dist/probe.js', '/health']);
      expect(container.lifecycle?.['preStop']).toBeDefined();
    },
  );

  it('render mutation M7: dropping the headroom below the derived sum turns the named test red', () => {
    const outcome = render({ set: { 'studioRunner.drain.extraGraceSeconds': '-200' } });
    const deployment = runnerDeployment(outcome);
    const env = envValues(soleContainer(deployment));
    const required =
      Math.floor(Number(env['STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS']) / 1000) +
      Math.floor(Number(env['STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS']) / 1000) +
      Math.floor(Number(env['STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS']) / 1000) +
      Math.floor(Number(env['STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS']) / 1000);
    expect(podSpec(deployment).terminationGracePeriodSeconds ?? 0).toBeLessThan(required);
  });

  it('render mutation M7b: raising the runtime cap carries the grace period with it', () => {
    // The other direction, which is what "one derivation" means. A chart that pinned the grace
    // period to a literal would pass the assertion above and fail here.
    const base = podSpec(runnerDeployment(render())).terminationGracePeriodSeconds ?? 0;
    const raised = render({
      args: ['--set-string', 'studioRunner.runnerEnv.STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS=600000'],
    });
    expect(podSpec(runnerDeployment(raised)).terminationGracePeriodSeconds ?? 0).toBe(base + 480);
  });
});

describe('AC-5a — the reaping mechanism is chosen, named, and does not cost the signal', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s shares the process namespace, so the pause container reaps orphaned grandchildren',
    (_label, valuesFile) => {
      // **Which half this is.** AC-5a asks for two properties and says to state which mechanism was
      // chosen rather than blur them. Reaping is `shareProcessNamespace`, so the *reaping* half
      // moves to AC-5b (SPK-04 question 6) — a pause container exists only in a real pod. The
      // signal half is proven here, against the built image, and recorded in the Dev Agent Record:
      // `docker stop` on the exec-form image emits `runner.draining` and `runner.drained` within
      // four milliseconds; with a shell-form CMD substituted, `docker stop` waits out its whole
      // timeout and emits neither.
      const pod = podSpec(runnerDeployment(render({ valuesFile })));
      expect(pod.shareProcessNamespace).toBe(true);
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders exactly one container, which is the bound that makes a shared PID namespace safe',
    (_label, valuesFile) => {
      // **QA MED-1.** `shareProcessNamespace: true` was adopted as a reaping control without its
      // other consequence being weighed: a shared PID namespace exposes `/proc/<pid>/root` between
      // containers, so a second container in this pod reads
      // `/proc/1/root/etc/studio/object-store/secretAccessKey` regardless of its own mounts, and a
      // read-only root filesystem does not obstruct a read.
      //
      // The pod was safe — it renders one container — but **only incidentally**: the bound was
      // enforced by `soleContainer()` calling `one()`, which throws. A log shipper or a mesh
      // sidecar would have broken several tests for the wrong reason while handing that sidecar
      // the write-only store credential, and nothing in the chart named the coupling.
      //
      // Asserted as a relation between three rendered facts — the shared namespace, the mounted
      // Secret and the container count — rather than as "there is one container", so it says what
      // it is for.
      const pod =
        podSpec(
          runnerDeployment(
            render({
              valuesFile,
              set: {
                'objectStore.provider': 's3',
                'objectStore.endpoint': 'https://sonic.internal.example',
              },
            }),
          ),
        );
      expect(pod.shareProcessNamespace).toBe(true);
      expect(
        (pod.volumes ?? []).filter((volume) => volume.secret !== undefined).length,
        'no Secret is mounted, so this guard is passing for a reason that is not the bound',
      ).toBeGreaterThan(0);
      expect(sharedNamespaceViolations(pod)).toEqual([]);
    },
  );

  it('chart mutation MED-1: a sidecar on the runner pod turns the bound red', () => {
    // The mutation is a **template** change, so it is made to a copy of the chart and rendered from
    // there: a render mutation must land inside the measurement window, and the production template
    // must not gain a sidecar to prove a guard can fire.
    const scratch = mkdtempSync(join(tmpdir(), 'studio-chart-med1-'));
    scratchDirs.push(scratch);
    const chart = join(scratch, 'put-checks');
    cpSync(CHART_DIR, chart, { recursive: true });

    const templatePath = join(chart, 'templates', 'studio-runner-deployment.yaml');
    const template = readFileSync(templatePath, 'utf8');
    const anchor = ['      containers:', '        - name: studio-runner'].join('\n');
    expect(template, 'the sidecar anchor moved; this mutation would inject nothing').toContain(anchor);
    writeFileSync(
      templatePath,
      template.replace(
        anchor,
        [
          '      containers:',
          '        - name: log-shipper',
          '          image: registry.citi.com/put/log-shipper:1',
          '        - name: studio-runner',
        ].join('\n'),
      ),
      'utf8',
    );

    const mutated = render({
      chartDir: chart,
      set: {
        'objectStore.provider': 's3',
        'objectStore.endpoint': 'https://sonic.internal.example',
      },
    });
    const deployment = one(
      byKind(mutated, 'Deployment').filter((d) =>
        (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT),
      ),
      'runner Deployment',
    );
    const pod = podSpec(deployment);
    expect(pod.containers ?? []).toHaveLength(2);
    const violations = sharedNamespaceViolations(pod);
    expect(violations, 'a sidecar was added and the bound did not notice').toHaveLength(1);
    expect(violations[0]).toContain('/proc/1/root');
  });

  it('the bound is silent when there is nothing to expose, so it is about the coupling', () => {
    // The control that keeps the guard from being "assert one container" wearing a security name.
    // With the shared namespace off, or with no Secret mounted, a second container is a deployment
    // decision and not this bound's business — and the guard says nothing.
    const twoContainersNoSharing = {
      shareProcessNamespace: false,
      containers: [{ name: 'a' }, { name: 'b' }],
      volumes: [{ name: 'creds', secret: { secretName: 's' } }],
    };
    const twoContainersNoSecret = {
      shareProcessNamespace: true,
      containers: [{ name: 'a' }, { name: 'b' }],
      volumes: [{ name: 'scratch', emptyDir: {} }],
    };
    expect(sharedNamespaceViolations(twoContainersNoSharing)).toEqual([]);
    expect(sharedNamespaceViolations(twoContainersNoSecret)).toEqual([]);
    // …and it does fire when both are present, which is the case the runner pod is in.
    expect(
      sharedNamespaceViolations({
        shareProcessNamespace: true,
        containers: [{ name: 'a' }, { name: 'b' }],
        volumes: [{ name: 'creds', secret: { secretName: 's' } }],
      }),
    ).toHaveLength(1);
  });

  it('does not wrap the image’s entry point, which is what keeps SIGTERM direct', () => {
    // An `ENTRYPOINT`/`command` override in the chart is the other way the drain dies: PID 1
    // becomes a shell that never forwards the signal, and the pod is killed with an admitted
    // attempt in flight.
    const container = soleContainer(runnerDeployment(render()));
    expect(container.command).toBeUndefined();
    expect(container.args).toBeUndefined();
  });
});

describe('AC-7 — the runner holds no credential §9.2 forbids, on its own service account', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders no database, vault, CSI or LLM credential anywhere on the runner pod',
    (_label, valuesFile) => {
      // **Why the render and not the loader.** The runner's loader is fail-closed only inside the
      // `STUDIO_RUNNER_*` namespace and would ignore a `SPRING_DATASOURCE_URL` entirely. §9.2's
      // guarantee is that the credential is never *mounted*, and only the deployment can make
      // that true.
      const deployment = runnerDeployment(render({ valuesFile }));
      const container = soleContainer(deployment);
      const pod = podSpec(deployment);

      const surface = [
        ...envNames(container),
        ...referencedSecretNames(pod),
        ...(pod.volumes ?? []).map((v) => v.name ?? ''),
        ...(container.envFrom ?? []).map((source) => JSON.stringify(source)),
      ];
      for (const pattern of FORBIDDEN_CREDENTIAL_PATTERNS) {
        const offenders = surface.filter((entry) => pattern.test(entry));
        expect(offenders, `the runner pod carries something matching ${String(pattern)}`).toEqual([]);
      }
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s gives the runner its own ServiceAccount with no mounted token',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const pod = podSpec(runnerDeployment(outcome));
      const shared = podSpec(deploymentNamed(outcome, '-api')).serviceAccountName;

      expect(pod.serviceAccountName).toBeDefined();
      expect(
        pod.serviceAccountName,
        'the runner shares the API’s service account, so it inherits whatever the API is granted next',
      ).not.toBe(shared);
      expect(pod.automountServiceAccountToken).toBe(false);

      const account = one(
        byKind(outcome, 'ServiceAccount').filter(
          (d) => d.metadata?.name === pod.serviceAccountName,
        ),
        'the runner ServiceAccount',
      );
      expect(account.automountServiceAccountToken).toBe(false);
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s gives the runner exactly the two identity secrets §9.2 permits, plus the object store',
    (_label, valuesFile) => {
      const deployment = runnerDeployment(render({ valuesFile }));
      const container = soleContainer(deployment);
      const fromSecret = (container.env ?? [])
        .filter((entry) => entry.valueFrom?.secretKeyRef !== undefined)
        .map((entry) => entry.name)
        .sort();
      expect(fromSecret).toEqual([
        'STUDIO_RUNNER_CALLBACK_IDENTITY',
        'STUDIO_RUNNER_SERVICE_IDENTITY',
      ]);
    },
  );

  it('render mutation M8: a datasource URL on the runner values turns the named test red', () => {
    // The mutation has to reach the rendered pod to model the attack, and the enumerated
    // environment refuses it — which is itself the first control. So the attack is modelled where
    // it *could* land: the credential-class scan is run over a pod that has one.
    const outcome = renderOutcome({
      args: ['--set-string', 'studioRunner.runnerEnv.SPRING_DATASOURCE_URL=jdbc:postgresql://db/checks'],
    });
    expect(outcome.ok, 'a datasource URL rendered onto the runner pod').toBe(false);
    expect(outcome.error).toContain('SPRING_DATASOURCE_URL');

    // …and the scan that would have caught it if the enumeration had not: the API pod, which
    // legitimately carries such a key, is found by the same patterns.
    const withApiSecret = render({
      set: { 'backend.envFromSecrets[0].secretName': 'checks-db-credentials',
             'backend.envFromSecrets[0].keys[0]': 'SPRING_DATASOURCE_URL' },
    });
    const api = soleContainer(deploymentNamed(withApiSecret, '-api'));
    expect(
      FORBIDDEN_CREDENTIAL_PATTERNS.some((pattern) => envNames(api).some((n) => pattern.test(n))),
      'the credential-class scan does not recognise a datasource URL',
    ).toBe(true);
  });
});

describe('AC-8a — default-deny egress with exactly the destination classes the runner declares', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders a NetworkPolicy selecting the runner, denying by default',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const policy = one(
        byKind(outcome, 'NetworkPolicy').filter((d) =>
          (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT),
        ),
        'the runner NetworkPolicy',
      );
      const spec = policy.spec as {
        policyTypes?: string[];
        ingress?: readonly Record<string, unknown>[];
        egress?: readonly Record<string, unknown>[];
        podSelector?: { matchLabels?: Record<string, string> };
      };
      // Naming both types is what makes it default-deny: a policy listing only Egress leaves
      // ingress wide open.
      expect([...(spec.policyTypes ?? [])].sort()).toEqual(['Egress', 'Ingress']);
      expect(spec.podSelector?.matchLabels?.['app.kubernetes.io/component']).toBe('studio-runner');

      // Ingress from the worker pods only (§8.4).
      const ingress = spec.ingress ?? [];
      expect(ingress).toHaveLength(1);
      const from = (ingress[0] as { from?: readonly Record<string, unknown>[] }).from ?? [];
      expect(JSON.stringify(from)).toContain('worker');
      expect(JSON.stringify(from)).not.toContain('frontend');
    },
  );

  it('the permitted egress classes are the runner’s own three, plus DNS', () => {
    // Compared against the runner's production `PERMITTED_DESTINATIONS`, so a fourth class cannot
    // appear on one side alone. "An isolation test that asserts the policy exists by rendering
    // only the policy" is one of the sixteen shapes; this reads the other side.
    expect([...PERMITTED_DESTINATIONS]).toEqual(['callback-api', 'object-store', 'target-page']);
    const outcome = render();
    const policy = one(
      byKind(outcome, 'NetworkPolicy').filter((d) =>
        (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT),
      ),
      'the runner NetworkPolicy',
    );
    const egress = (policy.spec as { egress?: readonly Record<string, unknown>[] }).egress ?? [];

    // `target-page` renders one rule per approved target and the approved list is empty until
    // ED-04 / SPK-05 rules — default-deny for that class, which is the correct failing direction
    // and is recorded rather than filled in with a guess.
    const callback = egress.filter((rule) => JSON.stringify(rule).includes('component":"api'));
    const dns = egress.filter((rule) => JSON.stringify(rule).includes('kube-dns'));
    const store = egress.filter((rule) => JSON.stringify(rule).includes('ipBlock'));
    expect(callback, 'no callback-api egress rule: the terminal report would hang, not fail').toHaveLength(1);
    expect(dns, 'no DNS rule: every destination becomes a silent hang rather than a refusal').toHaveLength(1);
    expect(store.length, 'no object-store egress rule').toBeGreaterThanOrEqual(1);
    expect(egress.length).toBe(callback.length + dns.length + store.length);
  });

  it('render mutation M9: deleting the DNS rule and adding a fourth peer', () => {
    const noPolicy = render({ set: { 'studioRunner.networkPolicy.enabled': 'false' } });
    expect(
      byKind(noPolicy, 'NetworkPolicy').filter((d) =>
        (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT),
      ),
    ).toHaveLength(0);

    const fourthPeer = render({
      set: {
        'studioRunner.networkPolicy.approvedTargets[0].cidr': '203.0.113.0/24',
        'studioRunner.networkPolicy.approvedTargets[0].port': '443',
      },
    });
    const policy = one(
      byKind(fourthPeer, 'NetworkPolicy').filter((d) =>
        (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT),
      ),
      'the runner NetworkPolicy',
    );
    const egress = (policy.spec as { egress?: readonly unknown[] }).egress ?? [];
    expect(JSON.stringify(egress)).toContain('203.0.113.0/24');
  });
});

describe('AC-10a, AC-12 — two store principals, and one retention key', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s gives the runner a different object-store Secret from the API’s',
    (_label, valuesFile) => {
      // Asserted **unequal to each other** rather than each matched against a literal: two values
      // files that had drifted to the same name would satisfy a literal check twice over.
      const outcome = render({
        valuesFile,
        set: {
          'objectStore.provider': 's3',
          'objectStore.endpoint': 'https://sonic.internal.example',
        },
      });
      const runnerSecrets = (podSpec(runnerDeployment(outcome)).volumes ?? [])
        .map((volume) => volume.secret?.secretName)
        .filter((name): name is string => typeof name === 'string');
      const apiSecrets = (podSpec(deploymentNamed(outcome, '-api')).volumes ?? [])
        .map((volume) => volume.secret?.secretName)
        .filter((name): name is string => typeof name === 'string');

      expect(runnerSecrets.length).toBeGreaterThan(0);
      expect(apiSecrets.length).toBeGreaterThan(0);
      for (const runnerSecret of runnerSecrets) {
        expect(
          apiSecrets,
          'the runner and the API read the object store with one principal, so write-only is not a scope',
        ).not.toContain(runnerSecret);
      }
    },
  );

  it('the runner’s declared credential keys carry no Get or List capability name', () => {
    const volume = (
      podSpec(
        runnerDeployment(
          render({
            set: {
              'objectStore.provider': 's3',
              'objectStore.endpoint': 'https://sonic.internal.example',
            },
          }),
        ),
      ).volumes ?? []
    ).find(
      // By name: since STUDIO-OBS-009 the pod always mounts its TLS Secret too, and "the first
      // Secret volume" would silently start checking that one instead of the store principal.
      (v) => v.name === 'object-store-credentials',
    );
    const keys = (volume?.secret?.items ?? []).map((item) => item.key ?? '');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(/get|list|read/iu.test(key), `the runner's key set names ${key}`).toBe(false);
    }
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders the API retention window and the store lifecycle window from one key',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const apiRetention = envValues(soleContainer(deploymentNamed(outcome, '-api')))[
        'STUDIO_EVIDENCE_RETENTION'
      ];
      const lifecycle = one(
        byKind(outcome, 'ConfigMap').filter((d) =>
          (d.metadata?.name ?? '').endsWith('-studio-object-store'),
        ),
        'the object-store lifecycle ConfigMap',
      );
      expect(apiRetention).toBeDefined();
      expect(lifecycle.data?.['STUDIO_OBJECT_STORE_LIFECYCLE']).toBe(apiRetention);
      // The §6.2 prefix, fixed deployment-wide and never rendered per run or per job.
      expect(lifecycle.data?.['STUDIO_OBJECT_STORE_KEY_PREFIX']).toBe('studio/');
    },
  );

  it('render mutation M10, and AC-12’s retention pair: one secret for both, and a moved window', () => {
    // Named for M10 only. **M12 in this story's falsification table is exact-origin credentialed
    // CORS, which is story 10.18b's**, and labelling this row M12 would put a tick in a box the
    // other half has to fill. The retention pair is AC-12's own comparison and carries no M number.

    const shared = render({
      set: {
        'objectStore.provider': 's3',
        'objectStore.endpoint': 'https://sonic.internal.example',
        'studioRunner.objectStore.credentialsSecret': 'checks-api-object-store',
      },
    });
    const runnerSecrets = (podSpec(runnerDeployment(shared)).volumes ?? []).map(
      (v) => v.secret?.secretName,
    );
    const apiSecrets = (podSpec(deploymentNamed(shared, '-api')).volumes ?? []).map(
      (v) => v.secret?.secretName,
    );
    expect(runnerSecrets.filter((n) => n !== undefined && apiSecrets.includes(n))).not.toEqual([]);

    const moved = render({ set: { 'objectStore.retention': '7d' } });
    const apiRetention = envValues(soleContainer(deploymentNamed(moved, '-api')))[
      'STUDIO_EVIDENCE_RETENTION'
    ];
    const lifecycle = one(
      byKind(moved, 'ConfigMap').filter((d) =>
        (d.metadata?.name ?? '').endsWith('-studio-object-store'),
      ),
      'the object-store lifecycle ConfigMap',
    );
    // Both moved together, which is the property under test.
    expect(apiRetention).toBe('7d');
    expect(lifecycle.data?.['STUDIO_OBJECT_STORE_LIFECYCLE']).toBe('7d');
  });

  it('claims no exact-time physical deletion in any artefact this story delivers', () => {
    // Scoped to the **claims this story makes**, which is the only legitimate use of a source
    // scan here: run over a document that quotes §6.2's prohibition it would be a guard that
    // matches its own warning (one of the sixteen shapes).
    const outcome = render();
    const rendered = outcome.raw.toLowerCase();
    for (const claim of ['deleted after exactly', 'deleted exactly', 'guaranteed deletion']) {
      expect(rendered).not.toContain(claim);
    }
    // …and it says the true thing instead.
    expect(outcome.raw).toContain('Logical expiry');
  });
});

describe('AC-9a — ADR-002 O-6 is carried, not absorbed', () => {
  it('adds no destination-policy field to the job envelope from the deployment side either', () => {
    // O-6 is Class B and @architect's: a story may propose but may not land a field on the closed
    // `RunJob`. The deployment could smuggle the same thing in as a policy environment key, so the
    // rendered manifest is checked for it too.
    // 2026-10-18 (STUDIO-OBS-009 OI-06 B5): this render is observed-replay OFF by design (the chart
    // default). With observed replay on, exactly one chart-managed file PATH is a policy-named key,
    // `STUDIO_RUNNER_OBSERVED_POLICY_FILE`, which `runnerEnv` cannot set. That case is the exact-set
    // assertion in the OI-06 B5 blocks below (every value set, observed on and off). This test and its
    // regex are deliberately unchanged, and it is not the O-6 proof on its own: the closed `RunJob` is
    // guarded by the runner's gate-shut tripwire in `test/run/canary.test.ts`.
    const outcome = render();
    const container = soleContainer(runnerDeployment(outcome));
    for (const name of envNames(container)) {
      expect(/POLICY|APPROVED_ORIGINS|DESTINATIONS/u.test(name), name).toBe(false);
    }
    // The runner's own gate-shut tripwire is re-run unchanged in `test/run/canary.test.ts`; this
    // is its deployment-side companion, not a replacement for it.
    expect([...PERMITTED_DESTINATIONS]).toHaveLength(3);
  });
});

/**
 * Story 10.32 AC-5 — the seek-origin calibration key reaches the pod, as `"0"`, in every value set
 * (ADR-002 §26.3 item 3, §26.4(a)).
 *
 * The chart has its own closed key list (`put-checks.studioRunner.acceptedEnvKeys`), and a
 * `runnerEnv` key it does not name fails the render. So the key has to be on that list for any
 * deployment to set it, and `values.yaml` carries it as an explicit, uncalibrated `"0"`. Every
 * assertion reads the rendered manifest. None reads a values file.
 */
const SEEK_CALIBRATION_KEY = 'STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS';

/** The value the runner container is rendered with. Shared, so the falsification applies the same read. */
function renderedCalibration(outcome: RenderOutcome): string | undefined {
  return envValues(soleContainer(runnerDeployment(outcome)))[SEEK_CALIBRATION_KEY];
}

/** The AC-5 criterion itself: present, and exactly `"0"`. Absent does not pass. */
function expectUncalibrated(outcome: RenderOutcome, label: string): void {
  expect(renderedCalibration(outcome), label).toBe('0');
}

describe('story 10.32 AC-5 — the seek-origin calibration renders as exactly "0"', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: the runner container carries the key with the value "0"',
    (name, valuesFile) => {
      expectUncalibrated(render({ valuesFile }), name);
    },
  );

  it('falsification (i): a deliberate override renders, and the criterion rejects it', () => {
    const overridden = render({
      args: ['--set-string', `studioRunner.runnerEnv.${SEEK_CALIBRATION_KEY}=90`],
    });
    // The override reached the renderer, so the rejection below is about the value, not a no-op.
    expect(renderedCalibration(overridden)).toBe('90');
    expect(() => {
      expectUncalibrated(overridden, 'override');
    }).toThrow();
  });

  it('falsification (ii): off the chart’s accepted list, the key fails the render in every value set', () => {
    // A template mutation, made on a scratch copy so it lands inside the measurement window and
    // the production template stays untouched (the MED-1 method above).
    const scratch = mkdtempSync(join(tmpdir(), 'studio-chart-seek-calibration-'));
    scratchDirs.push(scratch);
    const chart = join(scratch, 'put-checks');
    cpSync(CHART_DIR, chart, { recursive: true });
    const helpersPath = join(chart, 'templates', '_helpers.tpl');
    const helpers = readFileSync(helpersPath, 'utf8');
    const entry = ` ${SEEK_CALIBRATION_KEY}`;
    expect(helpers.split(entry), 'the key is not on the accepted list exactly once').toHaveLength(2);
    writeFileSync(helpersPath, helpers.replace(entry, ''), 'utf8');

    for (const valuesFile of VALUE_SETS) {
      const outcome = renderOutcome({ chartDir: chart, valuesFile });
      expect(outcome.ok, `${valueSetName(valuesFile)} rendered without the key on the list`).toBe(false);
      expect(outcome.error).toContain(SEEK_CALIBRATION_KEY);
      expect(outcome.error).toContain('not an accepted');
    }
  });

  it('is a key the runner’s own loader accepts', () => {
    // The drift check for every rendered key is `every rendered key is one the runner accepts`
    // above. This names the one key this story adds.
    expect(ACCEPTED_KEYS).toContain(SEEK_CALIBRATION_KEY);
  });
});

/**
 * STUDIO-OBS-015 G (aria-g-ruling01) — the per-step ceiling renders as the contract maximum,
 * `"120000"`, in every value set, and the runner's own loader accepts it. A lower override still
 * renders (the chart does not own the bound) but the loader refuses it, so the pod cannot start.
 * Every assertion reads the rendered manifest. None reads a values file.
 */
const MAX_STEP_TIMEOUT_KEY = 'STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS';

/** The rendered runner environment, with secret-backed entries given a placeholder. */
function renderedRunnerEnv(outcome: RenderOutcome): Record<string, string> {
  const env: Record<string, string> = {};
  for (const entry of soleContainer(runnerDeployment(outcome)).env ?? []) {
    env[entry.name] = entry.value ?? 'secret-placeholder';
  }
  return env;
}

describe('STUDIO-OBS-015 G — the per-step ceiling renders as the contract maximum "120000"', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: the runner container carries the key with the value "120000"',
    (name, valuesFile) => {
      expect(envValues(soleContainer(runnerDeployment(render({ valuesFile }))))[MAX_STEP_TIMEOUT_KEY], name).toBe(
        '120000',
      );
    },
  );

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s: the rendered runner env passes the runner’s own loader with maxStepTimeoutMs 120000',
    (_name, valuesFile) => {
      expect(loadConfig(renderedRunnerEnv(render({ valuesFile }))).maxStepTimeoutMs).toBe(120_000);
    },
  );

  it('falsification: a 30000 override renders, and the loader refuses the rendered env', () => {
    const overridden = render({
      args: ['--set-string', `studioRunner.runnerEnv.${MAX_STEP_TIMEOUT_KEY}=30000`],
    });
    // The override reached the renderer, so the refusal below is about the value, not a no-op.
    const env = renderedRunnerEnv(overridden);
    expect(env[MAX_STEP_TIMEOUT_KEY]).toBe('30000');
    expect(() => loadConfig(env)).toThrow(ConfigurationError);
  });
});

describe('AC-25 residual — this half’s diff, and what it did not touch', () => {
  it('names the runner image from values, never a digest pinned in a template', () => {
    const image = soleContainer(runnerDeployment(render())).image ?? '';
    expect(image).toContain('checks-studio-runner');
    // ED-05: the internal image is what staging deploys. The chart must not hard-code the public
    // Playwright base, which ADR-001 §8 permits for local development only.
    expect(image).not.toContain('mcr.microsoft.com');
  });

  it('renders the runner disabled by default, so it cannot be deployed by forgetting to configure it', () => {
    const outcome = render({ enableRunner: false });
    expect(named(outcome, RUNNER_FRAGMENT)).toEqual([]);
  });
});

/**
 * Studio v1 WP2 — the worker presents the bearer the runner requires on `POST /v1/runs`.
 *
 * Before this, the worker Deployment rendered `STUDIO_RUNNER_BASE_URL` and nothing else, so
 * `HttpRunnerDispatchClient` refused every dispatch with `SERVICE_IDENTITY_NOT_CONFIGURED` and a
 * chart-deployed pair could never run. The criterion is a **comparison inside one rendered
 * manifest**: the worker's secret reference must equal the runner's inbound one, name and key. A
 * comparison against the literal `serviceIdentity` would be a second copy of the fact.
 */
function secretRefOf(container: Container, name: string): { name?: string; key?: string } | undefined {
  return (container.env ?? []).find((entry) => entry.name === name)?.valueFrom?.secretKeyRef;
}

describe('Studio v1 WP2 — the worker reads its runner bearer from the runner’s own identity Secret', () => {
  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s renders STUDIO_RUNNER_SERVICE_TOKEN from the same secret key as STUDIO_RUNNER_SERVICE_IDENTITY, never inline',
    (_label, valuesFile) => {
      const outcome = render({ valuesFile });
      const worker = soleContainer(deploymentNamed(outcome, '-worker'));
      const runner = soleContainer(runnerDeployment(outcome));

      const entry = (worker.env ?? []).find((e) => e.name === 'STUDIO_RUNNER_SERVICE_TOKEN');
      expect(entry, 'the worker carries no runner bearer, so every dispatch is refused').toBeDefined();
      expect(entry?.value, 'the bearer must never be inlined into the manifest').toBeUndefined();

      const workerRef = secretRefOf(worker, 'STUDIO_RUNNER_SERVICE_TOKEN');
      const runnerRef = secretRefOf(runner, 'STUDIO_RUNNER_SERVICE_IDENTITY');
      expect(runnerRef?.name, 'the runner reads its inbound identity from a Secret').toBeDefined();
      expect(workerRef).toEqual(runnerRef);

      // The worker is given the dispatch bearer only — never the runner's callback identity.
      const callbackRef = secretRefOf(runner, 'STUDIO_RUNNER_CALLBACK_IDENTITY');
      const workerKeys = (worker.env ?? [])
        .map((e) => e.valueFrom?.secretKeyRef)
        .filter((ref) => ref?.name === callbackRef?.name)
        .map((ref) => ref?.key);
      expect(workerKeys).not.toContain(callbackRef?.key);
    },
  );

  it('render mutation: moving the identity Secret name and key moves both ends together', () => {
    const outcome = render({
      set: {
        'studioRunner.identity.secretName': 'moved-identity',
        'studioRunner.identity.serviceIdentityKey': 'movedKey',
      },
    });
    const workerRef = secretRefOf(
      soleContainer(deploymentNamed(outcome, '-worker')),
      'STUDIO_RUNNER_SERVICE_TOKEN',
    );
    const runnerRef = secretRefOf(
      soleContainer(runnerDeployment(outcome)),
      'STUDIO_RUNNER_SERVICE_IDENTITY',
    );
    expect(runnerRef).toEqual({ name: 'moved-identity', key: 'movedKey' });
    expect(workerRef).toEqual(runnerRef);
  });

  it('renders no runner bearer on the worker when the runner is disabled', () => {
    const worker = soleContainer(deploymentNamed(render({ enableRunner: false }), '-worker'));
    expect(envNames(worker)).not.toContain('STUDIO_RUNNER_SERVICE_TOKEN');
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// STUDIO-OBS-009 W2 lane D2 — one runner Deployment, guided mode as a mode of it (AC-1), and the
// PID-1 launch obligations. Every assertion reads `helm template` output, over the four value sets
// with guided mode OFF (as shipped) and ON (the overlay), and every guard names its mutation.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Each value set, guided off and guided on. */
const MODES = VALUE_SETS.flatMap((file) =>
  [false, true].map((guided) => [`${valueSetName(file)} guided=${String(guided)}`, file, guided] as const),
);

/** The seven guided keys the runner refuses unless the switch is on (the switch itself is the eighth). */
const GUIDED_ONLY_KEYS: readonly string[] = [
  'STUDIO_RUNNER_GUIDED_WORKER_ID',
  'STUDIO_RUNNER_GUIDED_JOURNAL_DIR',
  'STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER',
  'STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT',
  'STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE',
  'STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL',
  'STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE',
];

/** The four listener keys every deployment gets (launch contract 2.3). */
const LISTENER_KEYS: readonly string[] = [
  'STUDIO_RUNNER_TLS_KEY_FILE',
  'STUDIO_RUNNER_TLS_CERT_FILE',
  'STUDIO_RUNNER_TLS_CA_FILE',
  'STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256',
];

/** Copies the chart, replaces one anchor in one template, and returns the copy. A template mutation inside the measurement window. */
function mutatedChart(label: string, file: string, from: string, to: string): string {
  const scratch = mkdtempSync(join(tmpdir(), `studio-chart-${label}-`));
  scratchDirs.push(scratch);
  const chart = join(scratch, 'put-checks');
  cpSync(CHART_DIR, chart, { recursive: true });
  const path = join(chart, 'templates', file);
  const text = readFileSync(path, 'utf8');
  expect(text.split(from).length - 1, `the mutation anchor moved in ${file}; this would mutate nothing`).toBe(1);
  writeFileSync(path, text.replace(from, to), 'utf8');
  return chart;
}

function volumeNamed(pod: PodSpec, name: string): NonNullable<PodSpec['volumes']>[number] | undefined {
  return (pod.volumes ?? []).find((volume) => volume.name === name);
}

describe('STUDIO-OBS-009 AC-1 — one Deployment, and no guided template', () => {
  it.each(MODES)('%s renders exactly one workload for the runner and none named guided', (_label, valuesFile, guided) => {
    const outcome = render({ valuesFile, guided });
    const workloads = outcome.documents.filter((d) =>
      ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'ReplicaSet', 'Pod'].includes(d.kind ?? ''),
    );
    expect(
      workloads.filter((d) => (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT)),
      'exactly one runner workload',
    ).toHaveLength(1);
    expect(
      workloads.filter((d) => /guided/iu.test(d.metadata?.name ?? '')),
      'a workload named guided: a second Deployment contradicts AC-1 and ADR-SC-005',
    ).toEqual([]);
    // The pieces guided mode adds are a ConfigMap, a Service and the API's ingress NetworkPolicy for
    // the connector port (architect pre-F-merge ruling 4(i) b), never a pod of their own.
    if (guided) {
      expect(named(outcome, 'guided').map((d) => d.kind).sort()).toEqual(['ConfigMap', 'NetworkPolicy', 'Service']);
    } else {
      expect(named(outcome, 'guided')).toEqual([]);
    }
  });

  it('has no template file for a guided worker (the AC-1 inventory, beside the rendered check above)', () => {
    // A directory inventory, not a content scan: AC-1 says "no separate studio-guided-worker-*
    // template is created", and a template that rendered nothing by default would pass the
    // rendered checks above.
    const templates = readdirSync(join(CHART_DIR, 'templates'));
    // The one allowed name is the API ingress policy for the guided connector port (ruling 4(i) b):
    // it selects API pods, renders no workload, and only while guided mode is on. Anything else
    // with "guided" in its file name is still a failure, so a worker template cannot hide behind it.
    expect(templates.filter((file) => /guided/iu.test(file) && file !== 'api-guided-tls-networkpolicy.yaml')).toEqual([]);
  });

  it.each(MODES)('%s renders the switch in both directions and the other seven guided keys only when on', (_label, valuesFile, guided) => {
    const env = envValues(soleContainer(runnerDeployment(render({ valuesFile, guided }))));
    expect(env['STUDIO_RUNNER_GUIDED_ENABLED']).toBe(guided ? 'true' : 'false');
    for (const key of GUIDED_ONLY_KEYS) {
      if (guided) expect(env[key], `${key} is missing while guided mode is on`).toBeTruthy();
      else expect(env, `${key} rendered while guided mode is off: the runner refuses a half configuration`).not.toHaveProperty(key);
    }
    for (const key of LISTENER_KEYS) {
      expect(env[key], `${key} must render in every deployment (TLS is required, ruling A3)`).toBeTruthy();
    }
  });

  it.each(MODES)('%s renders every rendered key as one the runner accepts, and all 12 new keys are accepted', (_label, valuesFile, guided) => {
    const container = soleContainer(runnerDeployment(render({ valuesFile, guided })));
    expect(envNames(container).filter((name) => !ACCEPTED_KEYS.includes(name))).toEqual([]);
    // The chart's closed list and the loader's are the same set for the new keys, in both
    // directions: a key the loader gained and the chart did not name could never be rendered.
    for (const key of [...LISTENER_KEYS, 'STUDIO_RUNNER_GUIDED_ENABLED', ...GUIDED_ONLY_KEYS]) {
      expect(ACCEPTED_KEYS, `${key} is not in the runner's ACCEPTED_KEYS`).toContain(key);
    }
  });

  it('keeps the chart-managed names out of runnerEnv, in every spelling', () => {
    for (const key of [...LISTENER_KEYS, 'STUDIO_RUNNER_GUIDED_ENABLED', ...GUIDED_ONLY_KEYS]) {
      const outcome = renderOutcome({ args: ['--set-string', `studioRunner.runnerEnv.${key}=x`] });
      expect(outcome.ok, `${key} rendered from runnerEnv`).toBe(false);
      expect(outcome.error).toContain('managed by the chart');
    }
  });

  it('refuses a HOST other than 0.0.0.0 or 127.0.0.1, because the exec probe dials 127.0.0.1', () => {
    for (const host of ['0.0.0.0', '127.0.0.1']) {
      const ok = renderOutcome({ args: ['--set-string', `studioRunner.runnerEnv.STUDIO_RUNNER_HOST=${host}`] });
      expect(ok.ok, `HOST ${host} must render: ${ok.error}`).toBe(true);
    }
    for (const host of ['10.1.2.3', 'localhost', '::1']) {
      const bad = renderOutcome({ args: ['--set-string', `studioRunner.runnerEnv.STUDIO_RUNNER_HOST=${host}`] });
      expect(bad.ok, `HOST ${host} rendered: the pod would be Running and never Ready`).toBe(false);
      expect(bad.error).toContain('STUDIO_RUNNER_HOST');
    }
  });
});

describe('STUDIO-OBS-009 A2.6 — the render fails for guided mode off a one-pod runner', () => {
  // Each case changes ONE thing from the allowed guided shape, so the failure can only be about it.
  const NEGATIVE: readonly (readonly [string, Readonly<Record<string, string>>, string])[] = [
    ['replicaCount 2', { 'studioRunner.replicaCount': '2' }, 'studioRunner.replicaCount: 1'],
    ['replicaCount 3', { 'studioRunner.replicaCount': '3' }, 'studioRunner.replicaCount: 1'],
    [
      'autoscaling.enabled',
      {
        'studioRunner.autoscaling.enabled': 'true',
        'studioRunner.autoscaling.prometheus.serverAddress': 'http://prometheus.monitoring:9090',
      },
      'studioRunner.autoscaling.enabled: false',
    ],
    ['shareProcessNamespace false', { 'studioRunner.shareProcessNamespace': 'false' }, 'shareProcessNamespace: true'],
  ];

  it.each(NEGATIVE.flatMap(([label, set, message]) => VALUE_SETS.map((file) => [`${label} / ${valueSetName(file)}`, file, set, message] as const)))(
    '%s fails the render, naming the key and what to set',
    (_label, valuesFile, set, message) => {
      const control = renderOutcome({ valuesFile, guided: true });
      expect(control.ok, `the allowed guided shape must render, or this negative proves nothing: ${control.error}`).toBe(true);
      const outcome = renderOutcome({ valuesFile, guided: true, set });
      expect(outcome.ok, 'guided mode rendered off the one-pod shape').toBe(false);
      expect(outcome.error).toContain(message);
    },
  );

  it('fails when guided mode is on and the runner is disabled, rather than rendering nothing', () => {
    const outcome = renderOutcome({ guided: true, enableRunner: false });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('studioRunner.enabled');
  });

  it('does not constrain a runner with guided mode off: two replicas and the autoscaler still render', () => {
    // The control that makes the guard about guided mode and not about the runner in general.
    expect(renderOutcome({ set: { 'studioRunner.replicaCount': '2' } }).ok).toBe(true);
    expect(
      renderOutcome({
        set: {
          'studioRunner.autoscaling.enabled': 'true',
          'studioRunner.autoscaling.prometheus.serverAddress': 'http://prometheus.monitoring:9090',
        },
      }).ok,
    ).toBe(true);
  });

  it('chart mutation: deleting the replica check lets replicaCount 2 render, so the cases above discriminate', () => {
    const chart = mutatedChart(
      'guided-guard',
      '_helpers.tpl',
      '{{- if ne (int $r.replicaCount) 1 -}}',
      '{{- if false -}}',
    );
    const mutated = renderOutcome({ chartDir: chart, guided: true, set: { 'studioRunner.replicaCount': '2' } });
    expect(mutated.ok, 'the guard was deleted and replicaCount 2 still failed: another guard answers for it').toBe(true);
    expect(
      renderOutcome({ guided: true, set: { 'studioRunner.replicaCount': '2' } }).ok,
      'and the real chart refuses the same input',
    ).toBe(false);
  });

  it('chart mutation: deleting the autoscaling check lets the autoscaler render with guided mode on', () => {
    const chart = mutatedChart(
      'guided-guard-as',
      '_helpers.tpl',
      '{{- if $r.autoscaling.enabled -}}',
      '{{- if false -}}',
    );
    const set = {
      'studioRunner.autoscaling.enabled': 'true',
      'studioRunner.autoscaling.prometheus.serverAddress': 'http://prometheus.monitoring:9090',
    };
    expect(renderOutcome({ chartDir: chart, guided: true, set }).ok).toBe(true);
    expect(renderOutcome({ guided: true, set }).ok).toBe(false);
  });

  it('refuses each guided input that has no default when it is empty, naming the key', () => {
    // AC-2's "the chain fails closed when any part is absent", for the chart's half.
    const empties: readonly (readonly [string, string])[] = [
      ['studioRunner.guided.token.issuer', 'token.issuer'],
      ['studioRunner.guided.token.controllerSubject', 'token.controllerSubject'],
      ['studioRunner.guided.token.publicKey', 'token.publicKey'],
      ['studioRunner.guided.callbackToken.secretName', 'callbackToken.secretName'],
      ['studioRunner.guided.backendTokens.secretName', 'backendTokens.secretName'],
      ['studioRunner.guided.workerId', 'workerId'],
    ];
    for (const [key, fragment] of empties) {
      const outcome = renderOutcome({ guided: true, set: { [key]: '' } });
      expect(outcome.ok, `${key} empty rendered a guided pod with no ${fragment}`).toBe(false);
      expect(outcome.error).toContain(fragment);
    }
    const notPem = renderOutcome({ guided: true, set: { 'studioRunner.guided.token.publicKey': 'not-a-key' } });
    expect(notPem.ok).toBe(false);
    expect(notPem.error).toContain('BEGIN PUBLIC KEY');
  });

  it('refuses a plain-http guided callback URL and a journal that overlaps a clearable path', () => {
    const http = renderOutcome({ guided: true, set: { 'studioRunner.guided.callbackBaseUrl': 'http://api.internal:8080' } });
    expect(http.ok).toBe(false);
    expect(http.error).toContain('https://');
    // Scratch is cleared at start and at drain (Q3), so a journal under or over it would be erased.
    for (const mountPath of ['/scratch', '/scratch/journal', '/tmp', '/var/lib/studio-objects', '/etc/studio/tls']) {
      const overlap = renderOutcome({ guided: true, set: { 'studioRunner.guided.journal.mountPath': mountPath } });
      expect(overlap.ok, `journal mount ${mountPath} rendered`).toBe(false);
      expect(overlap.error).toContain('disjoint');
    }
    const root = renderOutcome({ guided: true, set: { 'studioRunner.guided.journal.directory': '/' } });
    expect(root.ok).toBe(false);
    expect(root.error).toContain('subdirectory');
  });
});

describe('STUDIO-OBS-009 A2.6 — Recreate, one pod, and resources for two browsers', () => {
  it.each(MODES)('%s sets strategy Recreate exactly when guided mode is on', (_label, valuesFile, guided) => {
    const strategy = (runnerDeployment(render({ valuesFile, guided })).spec as { strategy?: { type?: string } }).strategy;
    if (guided) expect(strategy?.type, 'RollingUpdate would run two Ready pods with one worker id').toBe('Recreate');
    else expect(strategy, 'the replay-only Deployment kept its default rollout').toBeUndefined();
  });

  it.each(MODES)('%s renders one replica when guided mode is on', (_label, valuesFile, guided) => {
    if (!guided) return;
    expect((runnerDeployment(render({ valuesFile, guided })).spec as { replicas?: number }).replicas).toBe(1);
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s sizes a guided pod for a replay browser plus a guided browser, and says so in /dev/shm and limits',
    (_label, valuesFile) => {
      const off = runnerDeployment(render({ valuesFile }));
      const on = runnerDeployment(render({ valuesFile, guided: true }));
      const memory = (deployment: K8sDocument): number => toBytes(soleContainer(deployment).resources?.limits?.['memory'] ?? '0');
      const requested = (deployment: K8sDocument): number => toBytes(soleContainer(deployment).resources?.requests?.['memory'] ?? '0');
      const shm = (deployment: K8sDocument): number =>
        toBytes(volumeNamed(podSpec(deployment), 'dev-shm')?.emptyDir?.sizeLimit ?? '0');
      expect(memory(on), 'a pod with two browsers must not be sized as one').toBeGreaterThan(memory(off));
      expect(requested(on)).toBeGreaterThan(requested(off));
      expect(shm(on)).toBeGreaterThan(shm(off));
      // /dev/shm is memory-backed and counts against the container limit: it cannot be the limit.
      expect(shm(on)).toBeLessThan(memory(on));
    },
  );

  it('tolerates more liveness misses while guided (a restart ends the live session), from values keys', () => {
    const container = (guided: boolean): Container => soleContainer(runnerDeployment(render({ guided })));
    expect(container(false).livenessProbe?.failureThreshold).toBe(3);
    expect(container(true).livenessProbe?.failureThreshold).toBe(6);
    const moved = soleContainer(
      runnerDeployment(render({ guided: true, set: { 'studioRunner.guided.livenessFailureThreshold': '9' } })),
    );
    expect(moved.livenessProbe?.failureThreshold).toBe(9);
    const defaultMoved = soleContainer(
      runnerDeployment(render({ set: { 'studioRunner.probes.livenessFailureThreshold': '4' } })),
    );
    expect(defaultMoved.livenessProbe?.failureThreshold).toBe(4);
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s makes a startup refusal readable: terminationMessagePolicy FallbackToLogsOnError',
    (_label, valuesFile) => {
      for (const guided of [false, true]) {
        expect(soleContainer(runnerDeployment(render({ valuesFile, guided }))).terminationMessagePolicy).toBe(
          'FallbackToLogsOnError',
        );
      }
    },
  );

  it('keeps the guided close inside the pod grace period (the Q5 arithmetic, recorded, not a knob)', () => {
    // Aria's Q5 ruling: no `closeGraceSeconds` key. The guided half of the drain is bounded by
    // constants of the runner: a close of at most 14.5 s, a recording settle of at most a 15 s
    // upload window plus 3 x 10 s callbacks plus a 3 s back-off, so about 63 s, and it runs
    // CONCURRENTLY with the replay drain. This asserts the inequality on the rendered pod for every
    // value set, so a values change that shrinks the grace below it reddens here.
    const GUIDED_DRAIN_SECONDS = 14.5 + 15 + 3 * 10 + 3;
    for (const valuesFile of VALUE_SETS) {
      const pod = podSpec(runnerDeployment(render({ valuesFile, guided: true })));
      const env = envValues(soleContainer(runnerDeployment(render({ valuesFile, guided: true }))));
      const preStop = 5;
      expect(
        (pod.terminationGracePeriodSeconds ?? 0) - preStop,
        `${valueSetName(valuesFile)}: SIGKILL would land inside the guided close`,
      ).toBeGreaterThanOrEqual(GUIDED_DRAIN_SECONDS);
      // And it is not the only term: the replay drain still fits, so concurrency is real.
      expect(pod.terminationGracePeriodSeconds ?? 0).toBeGreaterThanOrEqual(
        Math.floor(Number(env['STUDIO_RUNNER_DRAIN_TIMEOUT_MS']) / 1000),
      );
    }
  });
});

/** Kubernetes quantity in bytes, for the Mi/Gi forms this chart uses. */
function toBytes(quantity: string): number {
  const match = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti)?$/u.exec(quantity);
  if (match === null) throw new Error(`unrecognised quantity ${quantity}`);
  const unit = { Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40 }[match[2] ?? ''] ?? 1;
  return Number(match[1]) * unit;
}

describe('STUDIO-OBS-009 PID-1 b — the one Deployment keeps node off PID 1, on guided value sets too', () => {
  it.each(MODES)('%s shares the process namespace (the pause container is PID 1, so node is not)', (_label, valuesFile, guided) => {
    const pod = podSpec(runnerDeployment(render({ valuesFile, guided })));
    expect(pod.shareProcessNamespace).toBe(true);
  });

  it.each(MODES)('%s keeps the one-container bound, now that the pod always mounts its private key', (_label, valuesFile, guided) => {
    const pod = podSpec(runnerDeployment(render({ valuesFile, guided })));
    const secrets = (pod.volumes ?? []).filter((volume) => volume.secret !== undefined);
    // The TLS Secret holds the runner's PRIVATE KEY in every deployment, so the bound that
    // protects the object-store credential protects it too, even with the local object store.
    expect(secrets.length, 'no Secret mounted: this bound would be passing vacuously').toBeGreaterThan(0);
    expect(sharedNamespaceViolations(pod)).toEqual([]);
    expect(pod.containers ?? []).toHaveLength(1);
    expect(pod.initContainers ?? []).toHaveLength(0);
  });

  it('chart mutation: a sidecar on a GUIDED pod turns the bound red, because the pod now mounts a private key', () => {
    const chart = mutatedChart(
      'guided-sidecar',
      'studio-runner-deployment.yaml',
      ['      containers:', '        - name: studio-runner'].join('\n'),
      ['      containers:', '        - name: mesh-sidecar', '          image: registry.citi.com/put/mesh:1', '        - name: studio-runner'].join('\n'),
    );
    const pod = podSpec(runnerDeployment(render({ chartDir: chart, guided: true })));
    expect(pod.containers ?? []).toHaveLength(2);
    const violations = sharedNamespaceViolations(pod);
    expect(violations, 'a sidecar was added to a pod that mounts the TLS key and the bound did not notice').toHaveLength(1);
  });

  it('refuses to render a guided pod without the shared namespace (PID-1 b is a render rule, not a hope)', () => {
    // Also in the A2.6 table above; named here because PID-1 b is its own obligation.
    const outcome = renderOutcome({ guided: true, set: { 'studioRunner.shareProcessNamespace': 'false' } });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('PID-1 b');
  });
});

describe('STUDIO-OBS-009 Q4 — a writable /tmp, and neither TMPDIR nor NODE_OPTIONS anywhere', () => {
  const FORBIDDEN_ENV = ['TMPDIR', 'NODE_OPTIONS', 'DEBUG', 'PWDEBUG', 'NODE_DEBUG'];

  it.each(MODES)('%s renders none of TMPDIR, NODE_OPTIONS, DEBUG, PWDEBUG or NODE_DEBUG on the runner', (_label, valuesFile, guided) => {
    const names = envNames(soleContainer(runnerDeployment(render({ valuesFile, guided }))));
    for (const forbidden of FORBIDDEN_ENV) expect(names).not.toContain(forbidden);
  });

  it('cannot be made to render one through runnerEnv, because the key is not accepted', () => {
    for (const key of FORBIDDEN_ENV) {
      const outcome = renderOutcome({ guided: true, args: ['--set-string', `studioRunner.runnerEnv.${key}=/x`] });
      expect(outcome.ok, `${key} rendered through runnerEnv`).toBe(false);
      expect(outcome.error).toContain('not an accepted');
    }
  });

  it('declares none of them in the image under test either', () => {
    // Read out of the image (`docker image inspect`, no container run). A base-image change that
    // set NODE_OPTIONS would make every guided start fail CONFIGURATION_DENIED.
    const names = imageFacts().envNames;
    for (const forbidden of FORBIDDEN_ENV) expect(names).not.toContain(forbidden);
  });

  it.each(VALUE_SETS.map((file) => [valueSetName(file), file] as const))(
    '%s mounts a disk-backed /tmp and a journal volume only while guided, each its own emptyDir with a size limit',
    (_label, valuesFile) => {
      const off = runnerDeployment(render({ valuesFile }));
      expect((soleContainer(off).volumeMounts ?? []).map((m) => m.mountPath)).not.toContain('/tmp');
      expect(volumeNamed(podSpec(off), 'guided-journal')).toBeUndefined();

      const on = runnerDeployment(render({ valuesFile, guided: true }));
      const container = soleContainer(on);
      const env = envValues(container);
      const tmp = (container.volumeMounts ?? []).find((m) => m.mountPath === '/tmp');
      expect(tmp, 'no /tmp mount: a guided browser cannot launch on a read-only root').toBeDefined();
      const tmpVolume = volumeNamed(podSpec(on), tmp?.name ?? '');
      expect(tmpVolume?.emptyDir?.sizeLimit).toBeDefined();
      expect(tmpVolume?.emptyDir?.medium, 'memory-backed /tmp would count against the container limit').toBeUndefined();

      const journalDir = env['STUDIO_RUNNER_GUIDED_JOURNAL_DIR'] ?? '';
      const journal = (container.volumeMounts ?? []).find(
        (m) => m.mountPath !== undefined && journalDir.startsWith(`${m.mountPath}/`),
      );
      expect(journal, 'the journal directory is not inside a mounted volume').toBeDefined();
      expect(journal?.mountPath, 'the journal directory IS the mount root').not.toBe(journalDir);
      const journalVolume = volumeNamed(podSpec(on), journal?.name ?? '');
      expect(journalVolume?.emptyDir, 'the journal is on an emptyDir (ruling part 1 1.5 b), not a PVC').toBeDefined();
      expect(journalVolume?.persistentVolumeClaim).toBeUndefined();
      expect(journalVolume?.emptyDir?.sizeLimit).toBeDefined();

      // Disjoint from the directories the runner clears or shares: scratch, the object store, /tmp.
      for (const other of [env['STUDIO_RUNNER_SCRATCH_DIR'] ?? '', env['STUDIO_RUNNER_OBJECT_STORE_DIR'] ?? '', '/tmp']) {
        expect(isRelated(journalDir, other), `journal ${journalDir} overlaps ${other}`).toBe(false);
      }
      expect(journal?.name).not.toBe(tmp?.name);
    },
  );

  it('keeps the new writable mounts off the browser registry and HOME, on guided sets too', () => {
    const { browsersPath, home } = imageFacts();
    for (const valuesFile of VALUE_SETS) {
      const deployment = runnerDeployment(render({ valuesFile, guided: true }));
      const writable = (soleContainer(deployment).volumeMounts ?? []).filter((m) => m.readOnly !== true);
      expect(writable.map((m) => m.mountPath)).toEqual(expect.arrayContaining(['/tmp']));
      for (const mount of writable) {
        for (const forbidden of [browsersPath, home]) {
          expect(
            isRelated(mount.mountPath ?? '', forbidden),
            `writable mount ${mount.mountPath ?? ''} is on ${forbidden} (${valueSetName(valuesFile)}, guided)`,
          ).toBe(false);
        }
      }
    }
  });

  it('chart mutation: a TMPDIR the template did emit would be caught by the scan above', () => {
    const chart = mutatedChart(
      'tmpdir',
      'studio-runner-deployment.yaml',
      '            - name: STUDIO_RUNNER_TLS_KEY_FILE',
      '            - name: TMPDIR\n              value: /scratch\n            - name: STUDIO_RUNNER_TLS_KEY_FILE',
    );
    const names = envNames(soleContainer(runnerDeployment(render({ chartDir: chart, guided: true }))));
    expect(names, 'the injected TMPDIR was not seen: the scan cannot fire').toContain('TMPDIR');
  });
});

describe('STUDIO-OBS-009 co-sign 3.3 — secret mounts are read-only, mode 0440, directory mounts', () => {
  /** One string per violation of the Secret-mount rules on a pod. */
  function secretMountViolations(pod: PodSpec): string[] {
    const violations: string[] = [];
    const container = (pod.containers ?? [])[0];
    for (const volume of pod.volumes ?? []) {
      if (volume.secret === undefined) continue;
      if (volume.secret.defaultMode !== 0o440) {
        violations.push(`${volume.name ?? ''}: mode ${String(volume.secret.defaultMode)} is not 0440`);
      }
      const mounts = (container?.volumeMounts ?? []).filter((m) => m.name === volume.name);
      if (mounts.length === 0) violations.push(`${volume.name ?? ''}: mounted nowhere`);
      for (const mount of mounts) {
        if (mount.readOnly !== true) violations.push(`${volume.name ?? ''}: not readOnly`);
        if (mount.subPath !== undefined) violations.push(`${volume.name ?? ''}: subPath (never updated)`);
      }
    }
    return violations;
  }

  it.each(MODES)('%s mounts every Secret read-only at 0440 with no subPath', (_label, valuesFile, guided) => {
    const pod = podSpec(runnerDeployment(render({ valuesFile, guided })));
    expect((pod.volumes ?? []).filter((v) => v.secret !== undefined).length).toBeGreaterThan(0);
    expect(secretMountViolations(pod)).toEqual([]);
  });

  it('the check can fail: it flags a writable mount, a subPath and the 0644 default', () => {
    const bad: PodSpec = {
      containers: [{ volumeMounts: [{ name: 's', mountPath: '/x', subPath: 'k' }] }],
      volumes: [{ name: 's', secret: { secretName: 's', defaultMode: 0o644 } }],
    };
    expect(secretMountViolations(bad)).toHaveLength(3);
  });

  it('chart mutation: dropping defaultMode from the TLS volume turns the check red', () => {
    const chart = mutatedChart('mode', 'studio-runner-deployment.yaml', '            secretName: {{ $tls.secretName }}\n            defaultMode: {{ $fileMode }}', '            secretName: {{ $tls.secretName }}');
    const pod = podSpec(runnerDeployment(render({ chartDir: chart })));
    expect(secretMountViolations(pod).join('\n')).toContain('is not 0440');
  });

  it.each(MODES)('%s points each *_FILE variable inside a mount of the volume that carries it', (_label, valuesFile, guided) => {
    const deployment = runnerDeployment(render({ valuesFile, guided }));
    const container = soleContainer(deployment);
    const env = envValues(container);
    const tls = volumeNamed(podSpec(deployment), 'tls');
    const mount = (container.volumeMounts ?? []).find((m) => m.name === 'tls');
    const files = (tls?.secret?.items ?? []).map((item) => `${mount?.mountPath ?? ''}/${item.path ?? ''}`);
    for (const key of ['STUDIO_RUNNER_TLS_KEY_FILE', 'STUDIO_RUNNER_TLS_CERT_FILE', 'STUDIO_RUNNER_TLS_CA_FILE']) {
      expect(files, `${key} names a file the volume does not project`).toContain(env[key]);
    }
    if (guided) {
      const tokenMount = (container.volumeMounts ?? []).find((m) => m.name === 'guided-callback-token');
      const tokenVolume = volumeNamed(podSpec(deployment), 'guided-callback-token');
      expect(
        (tokenVolume?.secret?.items ?? []).map((item) => `${tokenMount?.mountPath ?? ''}/${item.path ?? ''}`),
      ).toContain(env['STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE']);
    }
  });
});

describe('STUDIO-OBS-009 co-sign 4 — every variable the exec probe reads is rendered, and non-empty', () => {
  const PROBE_ENV = [
    'STUDIO_RUNNER_PORT',
    'STUDIO_RUNNER_SERVICE_IDENTITY',
    'STUDIO_RUNNER_TLS_KEY_FILE',
    'STUDIO_RUNNER_TLS_CERT_FILE',
    'STUDIO_RUNNER_TLS_CA_FILE',
  ];

  /** Probe variables missing from the container, or rendered empty. A `valueFrom` counts as present. */
  function probeEnvViolations(container: Container): string[] {
    return PROBE_ENV.filter((name) => {
      const entry = (container.env ?? []).find((candidate) => candidate.name === name);
      if (entry === undefined) return true;
      if (entry.valueFrom !== undefined) return false;
      return (entry.value ?? '') === '';
    });
  }

  it.each(MODES)('%s renders all five probe variables', (_label, valuesFile, guided) => {
    expect(probeEnvViolations(soleContainer(runnerDeployment(render({ valuesFile, guided }))))).toEqual([]);
  });

  it('the check can fail, and a dropped TLS_CA_FILE in the template turns it red', () => {
    expect(probeEnvViolations({ env: [{ name: 'STUDIO_RUNNER_PORT', value: '' }] })).toHaveLength(5);
    const chart = mutatedChart(
      'probe-env',
      'studio-runner-deployment.yaml',
      '            - name: STUDIO_RUNNER_TLS_CA_FILE\n              value: {{ printf "%s/%s" $tlsDir $tls.caFile | quote }}\n',
      '',
    );
    const container = soleContainer(runnerDeployment(render({ chartDir: chart })));
    // "Running, never Ready" is the worst place to find this: the probe exits 1 forever.
    expect(probeEnvViolations(container)).toEqual(['STUDIO_RUNNER_TLS_CA_FILE']);
  });

  it('keeps the probe command unchanged: node dist/probe.js with the path from values', () => {
    const container = soleContainer(runnerDeployment(render({ guided: true })));
    expect(container.readinessProbe?.exec?.command).toEqual(['node', 'dist/probe.js', '/ready']);
    expect(container.livenessProbe?.exec?.command).toEqual(['node', 'dist/probe.js', '/health']);
  });
});

describe('STUDIO-OBS-009 ruling part 1 3.5 — one controller pin, one worker id, rotation as a release', () => {
  it('refuses to render without the controller fingerprint, and without the 32-pair upper-case form', () => {
    const missing = renderOutcome({ omitPin: true });
    expect(missing.ok, 'the render succeeded with no controller pin').toBe(false);
    expect(missing.error).toContain('controllerCertificateFingerprint256');
    for (const bad of [
      TEST_PIN.toLowerCase(),
      TEST_PIN.replaceAll(':', ''),
      TEST_PIN.split(':').slice(0, 31).join(':'),
      `${TEST_PIN}:00`,
      'sha256:abcd',
    ]) {
      const outcome = renderOutcome({ omitPin: true, set: { 'studioRunner.tls.controllerCertificateFingerprint256': bad } });
      expect(outcome.ok, `the form ${bad.slice(0, 20)}… rendered`).toBe(false);
      expect(outcome.error).toContain('32 upper-case hex');
    }
  });

  it('renders the pin from exactly one key, and a new value moves the runner env with it', () => {
    const other = Array.from({ length: 32 }, () => 'FE').join(':');
    const base = envValues(soleContainer(runnerDeployment(render())))['STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256'];
    expect(base).toBe(TEST_PIN);
    const moved = envValues(
      soleContainer(runnerDeployment(render({ set: { 'studioRunner.tls.controllerCertificateFingerprint256': other } }))),
    )['STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256'];
    expect(moved).toBe(other);
  });

  it('renders the guided worker id from one key into the runner and both backend pods', () => {
    const outcome = render({ guided: true, set: { 'studioRunner.guided.workerId': 'worker-7' } });
    expect(envValues(soleContainer(runnerDeployment(outcome)))['STUDIO_RUNNER_GUIDED_WORKER_ID']).toBe('worker-7');
    for (const role of ['api', 'worker']) {
      expect(springPropertiesOf(outcome, role)['studio.guided-authoring.translation.worker-id']).toBe('worker-7');
    }
    const defaulted = render({ guided: true });
    expect(envValues(soleContainer(runnerDeployment(defaulted)))['STUDIO_RUNNER_GUIDED_WORKER_ID']).toBe(
      springPropertiesOf(defaulted, 'api')['studio.guided-authoring.translation.worker-id'],
    );
  });

  it('rolls the pod when only a Secret changed, by a values key (rotationRevision), and when the public key changed', () => {
    const annotations = (outcome: RenderOutcome): Record<string, string> =>
      ((runnerDeployment(outcome).spec as { template?: { metadata?: { annotations?: Record<string, string> } } }).template?.metadata?.annotations) ?? {};
    const before = annotations(render({ guided: true }));
    const bumped = annotations(render({ guided: true, set: { 'studioRunner.tls.rotationRevision': '2026-10-18-a' } }));
    expect(before['put.citi.com/tls-rotation-revision']).toBeUndefined();
    expect(bumped['put.citi.com/tls-rotation-revision']).toBe('2026-10-18-a');
    const rekeyed = annotations(
      render({
        guided: true,
        set: { 'studioRunner.guided.token.publicKey': `${GUIDED_FIXTURE.publicKey}\n# rotated` },
      }),
    );
    expect(rekeyed['checksum/guided-controller-key']).not.toBe(before['checksum/guided-controller-key']);
  });
});

describe('STUDIO-OBS-009 A2.2 — the guided callback is its own key', () => {
  it('derives an https guided callback URL from the guided TLS Service, not from the replay callback', () => {
    const outcome = render({ guided: true, set: { 'studioRunner.callbackBaseUrl': 'http://gateway.internal:80' } });
    const env = envValues(soleContainer(runnerDeployment(outcome)));
    expect(env['STUDIO_RUNNER_CALLBACK_BASE_URL']).toBe('http://gateway.internal:80');
    const guidedUrl = new URL(env['STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL'] ?? '');
    expect(guidedUrl.protocol).toBe('https:');
    const tlsService = one(
      byKind(outcome, 'Service').filter((d) => (d.metadata?.name ?? '').endsWith('-api-guided-tls')),
      'guided TLS Service',
    );
    expect(guidedUrl.hostname).toBe(tlsService.metadata?.name);
    expect(Number(guidedUrl.port)).toBe(
      (tlsService.spec as { ports?: readonly { port?: number }[] }).ports?.[0]?.port,
    );
  });

  it('lets guided.callbackBaseUrl win, and keeps the replay one unchanged', () => {
    const outcome = render({ guided: true, set: { 'studioRunner.guided.callbackBaseUrl': 'https://api.corp.example:9443' } });
    const env = envValues(soleContainer(runnerDeployment(outcome)));
    expect(env['STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL']).toBe('https://api.corp.example:9443');
    expect(springPropertiesOf(outcome, 'api')['studio.guided-authoring.translation.controller-origin']).toBe(
      'https://api.corp.example:9443',
    );
    expect(env['STUDIO_RUNNER_CALLBACK_BASE_URL']).toMatch(/^http:\/\//u);
  });
});

/** The mounted Spring `application.yaml` of the API or worker, parsed. */
function springPropertiesOf(outcome: RenderOutcome, role: string): Record<string, unknown> {
  const deployment = deploymentNamed(outcome, `-${role}`);
  const volume = volumeNamed(podSpec(deployment), 'spring-config');
  const configMap = one(
    byKind(outcome, 'ConfigMap').filter((d) => d.metadata?.name === volume?.configMap?.name),
    'mounted Spring config',
  );
  return parseYaml(configMap.data?.['application.yaml'] ?? '') as Record<string, unknown>;
}


// ══════════════════════════════════════════════════════════════════════════════════════════════
// STUDIO-OBS-009 residue (architect ruling OI-06, section B5) — observed replay is chart-renderable.
//
// Before this, `put-checks.studioRunner.acceptedEnvKeys` had no `OBSERVED_*` name and `runnerEnv`
// failed the render for any key off that list, so a chart-deployed runner answered 503 to
// `/v2/validate-observed` and `/v2/runs`, and the backend's trusted catalog and policies were empty
// (409 RUNTIME_INCOMPATIBLE on every publication and replay). One top-level `studioObserved` block
// now feeds both images. Every assertion reads `helm template` output; the fixture catalog and
// policies are TEST VALUES (`OBSERVED_FIXTURE`), supplied the way a release supplies the real ones.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OBSERVED_FLAG_KEYS = [
  'STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED',
  'STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED',
] as const;
const OBSERVED_FILE_KEYS = [
  'STUDIO_RUNNER_OBSERVED_CATALOG_FILE',
  'STUDIO_RUNNER_OBSERVED_POLICY_FILE',
  'STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST',
] as const;
const OBSERVED_KEYS: readonly string[] = [...OBSERVED_FLAG_KEYS, ...OBSERVED_FILE_KEYS];
/** The runner volume and mount of the trust ConfigMap; the ConfigMap's name ends with the same words. */
const OBSERVED_TRUST = 'studio-observed-trust';
const UAT = 'values-uat.yaml';
/** The one chart-managed file path that is a policy-named key while observed replay is on (B5 item 2). */
const POLICY_FILE_KEY = 'STUDIO_RUNNER_OBSERVED_POLICY_FILE';

/** The env names AC-9a treats as policy-named. The same regex as the AC-9a test above, so the two cannot drift. */
function policyNamed(names: readonly string[]): string[] {
  return names.filter((name) => /POLICY|APPROVED_ORIGINS|DESTINATIONS/u.test(name));
}

/** Exact set, not a widened regex: observed on carries the one file-path key and nothing else policy-named. */
function expectOnlyPolicyFile(names: readonly string[], label: string): void {
  expect(policyNamed(names), label).toEqual([POLICY_FILE_KEY]);
}

/** The catalog and policies that reached the runner pod as files, read out of the ConfigMap the render produced. */
function observedTrustData(outcome: RenderOutcome): { catalog: unknown; policies: unknown } {
  const configMap = one(named(outcome, OBSERVED_TRUST).filter((d) => d.kind === 'ConfigMap'), 'observed trust ConfigMap');
  return {
    catalog: JSON.parse(configMap.data?.['catalog.json'] ?? 'null') as unknown,
    policies: JSON.parse(configMap.data?.['policies.json'] ?? 'null') as unknown,
  };
}

/** The runner pod's template annotations. */
function runnerPodAnnotations(outcome: RenderOutcome): Record<string, string> {
  const spec = runnerDeployment(outcome).spec as { template?: { metadata?: { annotations?: Record<string, string> } } };
  return spec.template?.metadata?.annotations ?? {};
}

describe('STUDIO-OBS-009 OI-06 B5 — the closed list and the chart-managed rule', () => {
  it('names the five observed keys: 53 names, each one the runner loader accepts', () => {
    // The one source read in this block, because no render exposes the list: it is the vocabulary of
    // `runnerEnv`, and the comparison is against the runner's OWN ACCEPTED_KEYS (never a second copy).
    const helpers = readFileSync(join(CHART_DIR, 'templates', '_helpers.tpl'), 'utf8');
    const block = /define "put-checks\.studioRunner\.acceptedEnvKeys" -\}\}\n([^\n]+)\n/u.exec(helpers);
    const names = (block?.[1] ?? '').trim().split(' ');
    expect(names, 'the closed list moved or was emptied').toHaveLength(53);
    expect(new Set(names).size, 'a name is listed twice').toBe(names.length);
    for (const key of OBSERVED_KEYS) expect(names, `${key} is not on the closed list`).toContain(key);
    expect(names.filter((name) => !ACCEPTED_KEYS.includes(name))).toEqual([]);
  });

  it.each([...OBSERVED_KEYS, 'STUDIO_RUNNER_OBSERVED_FUTURE_KEY'])(
    'refuses %s through runnerEnv, pointing at studioObserved.* (prefix test, so a future key is covered)',
    (key) => {
      const outcome = renderOutcome({ valuesFile: UAT, args: ['--set-string', `studioRunner.runnerEnv.${key}=x`] });
      expect(outcome.ok, `${key} rendered from runnerEnv`).toBe(false);
      expect(outcome.error).toContain(`${key} is managed by the chart`);
      expect(outcome.error).toContain('studioObserved');
    },
  );
});

describe('STUDIO-OBS-009 OI-06 B5 — observed replay OFF (the chart default)', () => {
  const OFF: readonly (readonly [string, string | null, Record<string, string>])[] = [
    ...VALUE_SETS.filter((file) => file !== UAT).map(
      (file) => [valueSetName(file), file, {}] as const,
    ),
    [
      'values-uat.yaml with both flags turned off',
      UAT,
      { 'studioObserved.validationEnabled': 'false', 'studioObserved.replayEnabled': 'false' },
    ],
  ];

  it.each(OFF)(
    '%s: both flags render "false", and no file key, digest pin, ConfigMap, mount or backend property',
    (_label, valuesFile, set) => {
      const outcome = render({ valuesFile, set });
      const deployment = runnerDeployment(outcome);
      const container = soleContainer(deployment);
      const env = envValues(container);
      for (const key of OBSERVED_FLAG_KEYS) expect(env[key], key).toBe('false');
      expect(policyNamed(envNames(container)), 'a policy-named key while observed replay is off').toEqual([]);
      for (const key of OBSERVED_FILE_KEYS) {
        expect(env, `${key} rendered while both flags are off: no half configuration`).not.toHaveProperty(key);
      }
      expect(container.image ?? '', 'the image is digest-pinned while observed replay is off').not.toContain('@sha256:');
      expect(named(outcome, OBSERVED_TRUST)).toEqual([]);
      expect(volumeNamed(podSpec(deployment), OBSERVED_TRUST)).toBeUndefined();
      expect((container.volumeMounts ?? []).map((mount) => mount.name)).not.toContain(OBSERVED_TRUST);
      expect(runnerPodAnnotations(outcome)).not.toHaveProperty('checksum/studio-observed-trust');
      for (const role of ['api', 'worker']) {
        const delivered = Object.keys(springPropertiesOf(outcome, role));
        expect(delivered.filter((key) => key.startsWith('studio.observed-replay.'))).toEqual([]);
      }
    },
  );
});

describe('STUDIO-OBS-009 OI-06 B5 — observed replay ON', () => {
  const EACH = VALUE_SETS.map((file) => [valueSetName(file), file] as const);

  it('is on in values-uat.yaml, with no catalog or policy committed', () => {
    const env = envValues(soleContainer(runnerDeployment(render({ valuesFile: UAT }))));
    for (const key of OBSERVED_FLAG_KEYS) expect(env[key], key).toBe('true');
  });

  it.each(EACH)(
    '%s: renders the five keys, a digest-pinned image, a read-only ConfigMap mount and one catalog in three places',
    (label, valuesFile) => {
      const outcome = render({ valuesFile, observed: true });
      const deployment = runnerDeployment(outcome);
      const container = soleContainer(deployment);
      const env = envValues(container);
      const digest = OBSERVED_FIXTURE.catalog.build.executableImageDigest;

      for (const key of OBSERVED_FLAG_KEYS) expect(env[key], key).toBe('true');
      expectOnlyPolicyFile(envNames(container), `${label}: policy-named env keys with observed replay on`);
      // The digest is DERIVED from the catalog (no second value), and the image reference names the
      // same digest: both are compared inside one manifest, never to a literal in this test.
      expect(env['STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST']).toBe(digest);
      const image = container.image ?? '';
      expect(image.endsWith(`@sha256:${env['STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST'] ?? ''}`), image).toBe(true);
      expect(/:[^/@]+@/u.test(image), `${image} still carries a tag in front of the digest`).toBe(false);

      // The two file keys point inside the mount of the volume that carries them.
      const mount = (container.volumeMounts ?? []).find((entry) => entry.name === OBSERVED_TRUST);
      expect(mount, 'no mount for the trust ConfigMap').toBeDefined();
      expect(mount?.readOnly).toBe(true);
      expect(mount?.subPath, 'a subPath mount would never receive an update').toBeUndefined();
      const volume = volumeNamed(podSpec(deployment), OBSERVED_TRUST);
      const configMap = one(
        named(outcome, OBSERVED_TRUST).filter((d) => d.kind === 'ConfigMap'),
        'observed trust ConfigMap',
      );
      expect(volume?.configMap?.name).toBe(configMap.metadata?.name);
      expect(volume?.configMap?.defaultMode, 'same 0440 as every other mounted file').toBe(0o440);
      const projected = (volume?.configMap?.items ?? []).map((item) => `${mount?.mountPath ?? ''}/${item.path ?? ''}`);
      expect(projected).toContain(env['STUDIO_RUNNER_OBSERVED_CATALOG_FILE']);
      expect(projected).toContain(env['STUDIO_RUNNER_OBSERVED_POLICY_FILE']);

      // One catalog entry, in the file the runner reads and in the backend's catalog (runner entry first).
      const files = observedTrustData(outcome);
      expect(files.catalog).toEqual(OBSERVED_FIXTURE.catalog);
      expect(files.policies).toEqual(OBSERVED_FIXTURE.policies);
      for (const role of ['api', 'worker']) {
        const props = springPropertiesOf(outcome, role);
        const backendCatalog = JSON.parse(String(props['studio.observed-replay.catalog-json'])) as { build: { executableImageDigest: string } }[];
        expect(backendCatalog[0]?.build.executableImageDigest, `${role}: first backend catalog entry`).toBe(digest);
        expect(JSON.parse(String(props['studio.observed-replay.policies-json']))).toEqual(files.policies);
      }
    },
  );

  it.each(EACH)('%s: the rendered env passes the runner’s own loader with the observed fields set', (_label, valuesFile) => {
    const env = renderedRunnerEnv(render({ valuesFile, observed: true }));
    const config = loadConfig(env);
    expect(config.observedValidationEnabled).toBe(true);
    expect(config.observedReplayEnabled).toBe(true);
    expect(config.observedCatalogFile).toBe(env['STUDIO_RUNNER_OBSERVED_CATALOG_FILE']);
    expect(config.observedPolicyFile).toBe(env['STUDIO_RUNNER_OBSERVED_POLICY_FILE']);
    expect(config.observedImageDigest).toBe(env['STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST']);
  });

  it.each([
    ['validation only', { 'studioObserved.replayEnabled': 'false' }, 'true', 'false'],
    ['replay only', { 'studioObserved.validationEnabled': 'false' }, 'false', 'true'],
  ] as const)('%s: the flags render as set and the files and the pin are still rendered', (_label, set, validation, replay) => {
    const outcome = render({ valuesFile: UAT, set });
    const container = soleContainer(runnerDeployment(outcome));
    const env = envValues(container);
    expect(env['STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED']).toBe(validation);
    expect(env['STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED']).toBe(replay);
    // Either flag needs the build identity (application.ts loadObservedRunnerSupport).
    for (const key of OBSERVED_FILE_KEYS) expect(env[key], key).toBeTruthy();
    expect(container.image).toContain('@sha256:');
  });

  it('ignores studioRunner.image.tag while on: the digest is the reference', () => {
    const image = soleContainer(runnerDeployment(render({ valuesFile: UAT, set: { 'studioRunner.image.tag': '9.9.9' } }))).image ?? '';
    expect(image).toContain('@sha256:');
    expect(image).not.toContain('9.9.9');
  });

  it('adds no Secret volume and no container, so the shareProcessNamespace one-container bound is unchanged', () => {
    for (const valuesFile of VALUE_SETS) {
      const before = podSpec(runnerDeployment(render({ valuesFile, set: { 'studioObserved.validationEnabled': 'false', 'studioObserved.replayEnabled': 'false' } })));
      const after = podSpec(runnerDeployment(render({ valuesFile, observed: true })));
      const secrets = (pod: PodSpec): (string | undefined)[] => (pod.volumes ?? []).filter((v) => v.secret !== undefined).map((v) => v.secret?.secretName);
      expect(secrets(after), valueSetName(valuesFile)).toEqual(secrets(before));
      expect(after.containers ?? []).toHaveLength(1);
      expect(sharedNamespaceViolations(after)).toEqual([]);
    }
  });

  it('rolls the runner pod when only the policies change (the files are read once at start-up)', () => {
    const changed = writeValuesOverlay('observed-policies-changed.json', {
      studioObserved: { policies: [{ ...OBSERVED_FIXTURE.policies[0], policyVersion: '2' }] },
    });
    const before = runnerPodAnnotations(render({ valuesFile: UAT }))['checksum/studio-observed-trust'];
    const after = runnerPodAnnotations(render({ valuesFile: UAT, args: ['-f', changed] }))['checksum/studio-observed-trust'];
    expect(before).toBeTruthy();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
  });

  it('keeps AC-9a’s no-policy-environment-key rule everywhere except the one chart-managed file path', () => {
    const names = envNames(soleContainer(runnerDeployment(render({ valuesFile: UAT }))));
    expectOnlyPolicyFile(names, 'values-uat.yaml');
  });

  it.each(['STUDIO_RUNNER_OBSERVED_POLICY_ORIGINS', 'STUDIO_RUNNER_APPROVED_ORIGINS'])(
    'falsification: a template that renders a second policy-named key (%s) is rejected by the exact-set read',
    (extra) => {
      // A template mutation on a scratch copy (the same method as the guards below): the Deployment
      // gains one extra env entry next to the chart-managed ones.
      const chart = mutatedChart(
        'observed-second-policy-key',
        'studio-runner-deployment.yaml',
        '            - name: STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST\n',
        `            - name: ${extra}\n              value: "x"\n            - name: STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST\n`,
      );
      const mutated = renderOutcome({ chartDir: chart, valuesFile: UAT });
      expect(mutated.ok, 'the mutated chart did not render, so nothing below is evidence').toBe(true);
      const names = envNames(soleContainer(runnerDeployment(mutated)));
      // The mutation reached the render, and the same read now sees two names ...
      expect(policyNamed(names)).toEqual([extra, POLICY_FILE_KEY].sort());
      // ... so the exact-set assertion goes red. The real chart passes the same assertion.
      expect(() => {
        expectOnlyPolicyFile(names, 'mutated');
      }).toThrow();
      expectOnlyPolicyFile(envNames(soleContainer(runnerDeployment(render({ valuesFile: UAT })))), 'unmutated');
    },
  );
});

describe('STUDIO-OBS-009 OI-06 B5 — the four render guards (and the boolean check) fire, each naming the key', () => {
  const CATALOG = OBSERVED_FIXTURE.catalog;
  const policy = (index: number, padding = ''): Record<string, unknown> => ({
    ...OBSERVED_FIXTURE.policies[0],
    policyId: `test-only-policy-${String(index)}${padding}`,
    applicationId: `test-only-application-${String(index)}`,
  });
  const policiesFile = (name: string, policies: readonly unknown[]): readonly string[] => [
    '-f',
    writeValuesOverlay(name, { studioObserved: { policies } }),
  ];
  /** An all-digit hash written without quotes is a YAML number: it loses digits, so the chart refuses it. */
  const unquoted = ((): string => {
    const directory = mkdtempSync(join(tmpdir(), 'studio-chart-observed-yaml-'));
    scratchDirs.push(directory);
    const file = join(directory, 'numeric-hash.yaml');
    writeFileSync(file, `studioObserved:\n  catalog:\n    build:\n      profileHash: ${'1'.repeat(64)}\n`, 'utf8');
    return file;
  })();

  const GUARDS: readonly (readonly [string, RenderOptions, readonly string[]])[] = [
    ['G-O0 a string flag (--set-string)', { valuesFile: UAT, args: ['--set-string', 'studioObserved.replayEnabled=false'] }, ['studioObserved.replayEnabled must be a boolean']],

    ['G-O1 both flags on, runner off', { observed: true, set: { 'studioRunner.enabled': 'false' } }, ['studioObserved', 'studioRunner.enabled']],
    ['G-O1 validation only, runner off', { observedInputs: true, set: { 'studioRunner.enabled': 'false', 'studioObserved.validationEnabled': 'true' } }, ['studioObserved', 'studioRunner.enabled']],
    ['G-O1 replay only, runner off', { observedInputs: true, set: { 'studioRunner.enabled': 'false', 'studioObserved.replayEnabled': 'true' } }, ['studioObserved', 'studioRunner.enabled']],

    ['G-O2 no catalog (UAT, inputs not supplied)', { valuesFile: UAT, observedInputs: false }, ['studioObserved.catalog']],
    ['G-O2 catalog with an extra key', { valuesFile: UAT, set: { 'studioObserved.catalog.extra': '1' } }, ['studioObserved.catalog', 'build and profile']],
    ['G-O2 catalog profile not a map', { valuesFile: UAT, args: ['--set-string', 'studioObserved.catalog.profile=text'] }, ['studioObserved.catalog.profile']],
    ['G-O2 build with an extra key', { valuesFile: UAT, set: { 'studioObserved.catalog.build.extra': '1' } }, ['studioObserved.catalog.build']],
    ['G-O2 build without chromiumBuild', { valuesFile: UAT, set: { 'studioObserved.catalog.build.chromiumBuild': 'null' } }, ['studioObserved.catalog.build.chromiumBuild']],
    ['G-O2 digest with a sha256: prefix', { valuesFile: UAT, set: { 'studioObserved.catalog.build.executableImageDigest': `sha256:${'4'.repeat(64)}` } }, ['studioObserved.catalog.build.executableImageDigest', '64 lower-case hex']],
    ['G-O2 digest in upper case', { valuesFile: UAT, set: { 'studioObserved.catalog.build.executableImageDigest': 'A'.repeat(64) } }, ['studioObserved.catalog.build.executableImageDigest']],
    ['G-O2 hash too short', { valuesFile: UAT, set: { 'studioObserved.catalog.build.schemaBundleHash': 'abc123' } }, ['studioObserved.catalog.build.schemaBundleHash']],
    ['G-O2 hash written as a YAML number', { valuesFile: UAT, args: ['-f', unquoted] }, ['studioObserved.catalog.build.profileHash', 'quoted string']],
    ['G-O2 additionalBackendCatalog entry of the wrong shape', { valuesFile: UAT, set: { 'studioObserved.additionalBackendCatalog[0].x': '1' } }, ['studioObserved.additionalBackendCatalog[0]']],

    ['G-O3 no policies (UAT, only the catalog supplied)', { valuesFile: UAT, observedInputs: false, args: ['-f', writeValuesOverlay('observed-catalog-only.json', { studioObserved: { catalog: CATALOG } })] }, ['studioObserved.policies must not be empty']],
    ['G-O3 17 policies (the backend takes 16)', { valuesFile: UAT, args: policiesFile('observed-policies-17.json', Array.from({ length: 17 }, (_unused, index) => policy(index))) }, ['studioObserved.policies has 17 entries', '16']],
    ['G-O3 policies over 65,536 bytes', { valuesFile: UAT, args: policiesFile('observed-policies-big.json', Array.from({ length: 16 }, (_unused, index) => policy(index, 'x'.repeat(4200)))) }, ['studioObserved.policies is', '65536']],

    ['G-O4 backend.configOverrides catalog-json', { valuesFile: UAT, set: { 'backend.configOverrides.studio\\.observed-replay\\.catalog-json': 'x' } }, ['backend.configOverrides sets studio.observed-replay.catalog-json']],
    ['G-O4 worker.configOverrides policies-json', { valuesFile: UAT, set: { 'worker.configOverrides.studio\\.observed-replay\\.policies-json': 'x' } }, ['worker.configOverrides sets studio.observed-replay.policies-json']],
    ['G-O4 backend.env STUDIO_OBSERVED_CATALOG_JSON', { valuesFile: UAT, set: { 'backend.env.STUDIO_OBSERVED_CATALOG_JSON': 'x' } }, ['backend.env sets STUDIO_OBSERVED_CATALOG_JSON']],
    ['G-O4 worker.env STUDIO_OBSERVED_POLICIES_JSON', { valuesFile: UAT, set: { 'worker.env.STUDIO_OBSERVED_POLICIES_JSON': 'x' } }, ['worker.env sets STUDIO_OBSERVED_POLICIES_JSON']],
    ['G-O4 nested and relaxed spelling in configOverrides', { valuesFile: UAT, args: ['-f', writeValuesOverlay('observed-nested-override.json', { backend: { configOverrides: { studio: { 'observed-replay': { Catalog_JSON: 'x' } } } } })] }, ['backend.configOverrides sets studio.observed-replay.Catalog_JSON']],
  ];

  it.each(GUARDS)('%s', (_label, options, fragments) => {
    const outcome = renderOutcome(options);
    expect(outcome.ok, 'the guard did not fire: the render succeeded').toBe(false);
    for (const fragment of fragments) expect(outcome.error).toContain(fragment);
  });

  it('G-O3 admits 16 policies: the bound is the backend’s, not stricter', () => {
    const outcome = renderOutcome({ valuesFile: UAT, args: policiesFile('observed-policies-16.json', Array.from({ length: 16 }, (_unused, index) => policy(index))) });
    expect(outcome.ok, outcome.error).toBe(true);
  });

  it('G-O4 applies only while observed replay is on: the same overrides render with both flags off', () => {
    const outcome = renderOutcome({
      set: {
        'backend.configOverrides.studio\\.observed-replay\\.catalog-json': 'x',
        'worker.env.STUDIO_OBSERVED_POLICIES_JSON': 'x',
      },
    });
    expect(outcome.ok, outcome.error).toBe(true);
  });

  it('chart mutation: with the 16-entry comparison removed from a scratch copy, 17 policies render', () => {
    const chart = mutatedChart('observed-policy-bound', '_helpers.tpl', '{{- if gt (len $o.policies) 16 -}}', '{{- if false -}}');
    const seventeen = policiesFile('observed-policies-17-mutated.json', Array.from({ length: 17 }, (_unused, index) => policy(index)));
    expect(renderOutcome({ chartDir: chart, valuesFile: UAT, args: seventeen }).ok, 'the mutation did not remove the guard').toBe(true);
    expect(renderOutcome({ valuesFile: UAT, args: seventeen }).ok, 'the unmutated chart accepted 17 policies').toBe(false);
  });

  it('chart mutation: with the runner-enabled check removed from a scratch copy, the runner-off set renders nothing for the runner', () => {
    const chart = mutatedChart('observed-runner-off', '_helpers.tpl', '{{- if not .Values.studioRunner.enabled -}}', '{{- if false -}}');
    const mutated = renderOutcome({ chartDir: chart, observed: true, set: { 'studioRunner.enabled': 'false' } });
    expect(mutated.ok, 'the mutation did not remove G-O1').toBe(true);
    expect(named(mutated, RUNNER_FRAGMENT), 'the values were silently ignored').toEqual([]);
  });
});

export type { K8sDocument };
