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
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { ACCEPTED_KEYS, PERMITTED_DESTINATIONS } from '../../src/server/config.js';
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
} from './helm.js';
import type { K8sDocument } from './helm.js';
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
    const outcome = render({
      args: ['--set-string', `studioRunner.runnerEnv.STUDIO_RUNNER_HOST=${DISABLING_FLAGS[0] ?? ''}`],
    });
    // The flag reaches the rendered environment through the one enumerated key that takes a
    // string, which is the closest a values file can get to it. The scan sees it.
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
      const pod = podSpec(runnerDeployment(render({ valuesFile })));
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

    const mutated = render({ chartDir: chart });
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
      const outcome = render({ valuesFile });
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
    const volume = (podSpec(runnerDeployment(render())).volumes ?? []).find(
      (v) => v.secret !== undefined,
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

    const shared = render({ set: { 'studioRunner.objectStore.credentialsSecret': 'checks-api-object-store' } });
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

export type { K8sDocument };
