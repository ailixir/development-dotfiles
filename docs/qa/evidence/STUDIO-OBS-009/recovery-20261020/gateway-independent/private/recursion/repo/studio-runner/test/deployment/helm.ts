/**
 * The chart-rendering harness (story 10.18a, T-10.18.1).
 *
 * **Every chart criterion in this story asserts on the output of `helm template`** — captured
 * bytes produced by running the renderer, parsed as YAML and asserted structurally. An assertion
 * that greps a `values-*.yaml` file or a template file is a source-text scan and satisfies
 * nothing: it is the first of the sixteen vacuous-guard shapes this epic has catalogued, and it is
 * the one a deployment story reproduces most easily.
 *
 * Two properties this module exists to provide, and which the tests must not re-implement:
 *
 * 1. **A render mutation lands inside the measurement window.** `render()` takes the overrides and
 *    passes them to the `helm template` invocation the assertion then reads. There is no cached
 *    rendering to mutate after the fact — the standing wave-5 rule, restated because this is where
 *    it bites.
 * 2. **A failed render is an outcome, not an exception to be swallowed.** Several criteria are
 *    satisfied *by* a render failing: a values key outside the runner's enumerated environment
 *    must fail the render rather than be silently dropped. {@link renderOutcome} returns the
 *    failure with its message so a test can assert on it.
 *
 * **Absence of `helm` is a FAILURE here, never a skip.** The first version of this harness used
 * `describe.skipIf(!HELM)`, and QA measured what that bought: with `helm` off `PATH` the chart file
 * reported *1 passed / 89 skipped* and was **green**, with the only surviving assertion a tautology
 * and the disclosure in a test *name*. A pipeline does not read names. `requireHelm()` below throws
 * with the stage that is supposed to provide the binary, so a tier that cannot run says so by going
 * red. There is deliberately **no opt-out variable**: an opt-out is the same hole under a longer
 * name.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse as parseYaml, parseAllDocuments } from 'yaml';

import { packageRoot } from '../helpers/corpus.js';

export const CHART_DIR = join(packageRoot, '..', 'helm-chart', 'put-checks');

/**
 * The four value sets every chart criterion is asserted over.
 *
 * `null` is the chart's own `values.yaml`, which Helm always loads; the other three are layered
 * on top with `-f`, exactly as a deployment does.
 */
export const VALUE_SETS: readonly (string | null)[] = [
  null,
  'values-dev.yaml',
  'values-uat.yaml',
  'values-prod.yaml',
];

export function valueSetName(valuesFile: string | null): string {
  return valuesFile ?? 'values.yaml';
}

/**
 * The controller-certificate pin every render in this tier is given, unless a test says otherwise.
 *
 * `studioRunner.tls.controllerCertificateFingerprint256` has **no default in any values file and
 * the render fails without it** (STUDIO-OBS-009 ruling A3 + devops co-sign 3.5): it is the SHA-256
 * of an environment's backend client certificate, which this repository cannot know. A real
 * release supplies it with `--set-string`; this harness does the same, with a syntactically valid
 * fixture value, so the 90 existing criteria keep rendering. The negative cases (`omitPin`) prove
 * that dropping it still fails the render, so this default cannot hide a missing requirement.
 */
export const TEST_PIN: string = Array.from({ length: 32 }, (_unused, index) =>
  ((index * 7 + 11) % 256).toString(16).toUpperCase().padStart(2, '0'),
).join(':');

/** Every key the guided overlay sets, for the tests that must not restate the value. */
export const GUIDED_FIXTURE = {
  issuer: 'https://guided-issuer.example.test',
  controllerSubject: 'checks-backend-controller',
  publicKey: '-----BEGIN PUBLIC KEY-----\nVEVTVC1LRVktTk9ULVJFQUw=\n-----END PUBLIC KEY-----',
} as const;

const guidedScratch = mkdtempSync(join(tmpdir(), 'studio-chart-guided-'));
process.once('exit', () => {
  rmSync(guidedScratch, { recursive: true, force: true });
});

/**
 * A values overlay that turns guided mode ON in the one shape A2.6 allows (one replica, no
 * autoscaler) with the inputs that have no default. Written once per process to a file because the
 * public key is multi-line, which `--set` cannot carry. The layering is the deployment's own:
 * `-f values-<env>.yaml -f guided.yaml`, then `--set`.
 */
export const GUIDED_OVERLAY_FILE: string = (() => {
  const file = join(guidedScratch, 'guided-overlay.yaml');
  writeFileSync(
    file,
    [
      'studioRunner:',
      '  replicaCount: 1',
      '  guided:',
      '    enabled: true',
      '    token:',
      `      issuer: ${GUIDED_FIXTURE.issuer}`,
      `      controllerSubject: ${GUIDED_FIXTURE.controllerSubject}`,
      `      publicKey: ${JSON.stringify(GUIDED_FIXTURE.publicKey)}`,
      '',
    ].join('\n'),
    'utf8',
  );
  return file;
})();

/**
 * TEST VALUES ONLY: a syntactically valid, obviously fake catalog entry and trusted policy for the
 * `studioObserved` block (architect ruling OI-06, B5).
 *
 * The chart commits neither: the catalog entry is specific to one runner image (CI generates it from
 * the pushed image) and the policies are reviewed per-environment configuration, so a real release
 * supplies both with `-f`, as this harness does. Every hash is a repeated placeholder digit so it
 * cannot be mistaken for a measurement. The chart checks the SHAPE (key set, 64 lower-case hex), not
 * that `profileHash` is the hash of `profile`; that equality is the runner's and the backend's.
 */
export const OBSERVED_FIXTURE = {
  catalog: {
    profile: { placeholder: 'TEST-ONLY replay profile; not a real profile' },
    build: {
      profileHash: '1'.repeat(64),
      schemaBundleHash: '2'.repeat(64),
      referenceBundleHash: '3'.repeat(64),
      executableImageDigest: '4'.repeat(64),
      chromiumBuild: 'TEST-ONLY-chromium-0',
    },
  },
  policies: [
    {
      version: 1,
      policyId: 'test-only-policy',
      policyVersion: '1',
      applicationId: 'test-only-application',
      environment: 'uat',
      allowedOrigins: ['https://app.example.test'],
      entryPolicyId: 'test-only-entry',
      applicationPolicy: null,
      rules: [],
    },
  ],
} as const;

/**
 * Writes a values overlay (JSON, which Helm reads as YAML) into the process-scoped scratch directory
 * and returns its path, for the inputs `--set` cannot express (multi-line, long or nested values).
 */
export function writeValuesOverlay(name: string, values: unknown): string {
  const file = join(guidedScratch, name);
  writeFileSync(file, JSON.stringify(values), 'utf8');
  return file;
}

/**
 * The fixture catalog and policies as a values overlay, with the flags untouched.
 *
 * `values-uat.yaml` turns observed replay ON and commits no catalog or policies on purpose (they come
 * at deploy time), so a UAT render fails by design without them. This is the deploy-time input every
 * UAT render in this tier is given, exactly as {@link TEST_PIN} is, so the criteria that are not
 * about observed replay keep rendering. The negative cases (`observedInputs: false`) prove that
 * dropping it still fails the render.
 */
export const OBSERVED_OVERLAY_FILE: string = writeValuesOverlay('observed-overlay.json', {
  studioObserved: { catalog: OBSERVED_FIXTURE.catalog, policies: OBSERVED_FIXTURE.policies },
});

/** Why `helm` cannot be used, or `null` when it can. Never a bare boolean: the reason is the test. */
export function helmUnavailableReason(): string | null {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'pipe' });
  } catch {
    return (
      'the `helm` binary is not on PATH. Every chart criterion of story 10.18a (AC-1 – AC-12) is ' +
      'asserted on the OUTPUT of `helm template`, so without it this tier enforces nothing. It is ' +
      'not skipped, because a green run that enforced nothing is what this shape is. Run this tier ' +
      'where its prerequisites exist: `ci/stages.md` stage 9, or locally with helm installed.'
    );
  }
  if (!existsSync(CHART_DIR)) {
    return `the chart is not at ${CHART_DIR}; the rendered-manifest rule has nothing to render`;
  }
  return null;
}

/**
 * Throws unless `helm` and the chart are both present.
 *
 * Called by every function below that renders, so a missing prerequisite reddens **all 90**
 * assertions rather than one announcement test — the failure is proportional to what is not being
 * checked.
 */
export function requireHelm(): void {
  const reason = helmUnavailableReason();
  if (reason !== null) throw new Error(`deployment tier prerequisite missing: ${reason}`);
}

export interface K8sDocument {
  readonly apiVersion?: string;
  readonly kind?: string;
  readonly metadata?: { readonly name?: string; readonly labels?: Record<string, string> };
  readonly spec?: Record<string, unknown>;
  readonly data?: Record<string, string>;
  readonly automountServiceAccountToken?: boolean;
  readonly [key: string]: unknown;
}

export interface RenderOutcome {
  readonly ok: boolean;
  /** Present when `ok`. */
  readonly documents: readonly K8sDocument[];
  /** The raw rendered bytes, for the assertions that are genuinely about the whole manifest. */
  readonly raw: string;
  /** Present when not `ok`: everything Helm said, stdout and stderr together. */
  readonly error: string;
}

export interface RenderOptions {
  /**
   * The chart to render. Defaults to the real one.
   *
   * Overridden only by MED-1's falsification, which copies the chart to a scratch directory and
   * injects a sidecar container before rendering — a template mutation that has to land *inside*
   * the measurement window, and which must not be made to the production template to prove a guard
   * can fire.
   */
  readonly chartDir?: string;
  readonly valuesFile?: string | null;
  /** `--set` overrides. This is the render mutation surface. */
  readonly set?: Readonly<Record<string, string>>;
  /** Extra raw arguments, for the mutations `--set` cannot express. */
  readonly args?: readonly string[];
  /** Defaults to true: nothing renders without it and every criterion here is about the runner. */
  readonly enableRunner?: boolean;
  /** Layers {@link GUIDED_OVERLAY_FILE} over the value set: guided mode on, one replica. */
  readonly guided?: boolean;
  /** Leaves the controller pin unset, to prove the render refuses without it. */
  readonly omitPin?: boolean;
  /** Turns observed replay ON (both flags) and supplies {@link OBSERVED_FIXTURE}. */
  readonly observed?: boolean;
  /**
   * Layers {@link OBSERVED_OVERLAY_FILE} (the fixture catalog and policies, flags untouched).
   * Defaults to true for `values-uat.yaml`, which enables observed replay without committing the
   * inputs, and for `observed: true`. Pass `false` to prove the render refuses without them.
   */
  readonly observedInputs?: boolean;
}

/**
 * Runs `helm template` and returns the outcome, success or failure, without throwing.
 */
export function renderOutcome(options: RenderOptions = {}): RenderOutcome {
  // Fail closed, here rather than in a per-file guard: every assertion in this tier reaches the
  // renderer through this function, so a missing binary cannot be answered with a skip anywhere.
  requireHelm();
  const chartDir = options.chartDir ?? CHART_DIR;
  const args = ['template', 'release-name', chartDir];
  if (options.valuesFile !== undefined && options.valuesFile !== null) {
    args.push('-f', join(chartDir, options.valuesFile));
  }
  if (options.guided === true) args.push('-f', GUIDED_OVERLAY_FILE);
  const observedInputs =
    options.observedInputs ?? (options.observed === true || options.valuesFile === 'values-uat.yaml');
  if (observedInputs) args.push('-f', OBSERVED_OVERLAY_FILE);
  if (options.observed === true) {
    args.push('--set', 'studioObserved.validationEnabled=true', '--set', 'studioObserved.replayEnabled=true');
  }
  if (options.enableRunner !== false) args.push('--set', 'studioRunner.enabled=true');
  // Set BEFORE the caller's `--set`s so a test that supplies its own pin (or a bad one) wins. It is
  // `--set` and not `--set-string` on purpose: Helm applies every `--set-string` AFTER every `--set`
  // regardless of argument order, so a `--set-string` default would beat the caller's override.
  // A value of colon-joined hex pairs is a string under `--set` as well.
  if (options.omitPin !== true) {
    args.push('--set', `studioRunner.tls.controllerCertificateFingerprint256=${TEST_PIN}`);
  }
  for (const [key, value] of Object.entries(options.set ?? {})) {
    args.push('--set', `${key}=${value}`);
  }
  args.push(...(options.args ?? []));

  try {
    const raw = execFileSync('helm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, documents: parseDocuments(raw), raw, error: '' };
  } catch (error) {
    const shaped = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      documents: [],
      raw: shaped.stdout ?? '',
      error: [shaped.stderr ?? '', shaped.message ?? ''].join('\n'),
    };
  }
}

/** Renders, and throws if the render failed. For the assertions that expect a manifest. */
export function render(options: RenderOptions = {}): RenderOutcome {
  const outcome = renderOutcome(options);
  if (!outcome.ok) {
    throw new Error(
      `helm template failed for ${valueSetName(options.valuesFile ?? null)}:\n${outcome.error}`,
    );
  }
  return outcome;
}

function parseDocuments(raw: string): readonly K8sDocument[] {
  const parsed = parseAllDocuments(raw, { prettyErrors: true, uniqueKeys: true });
  const documents: K8sDocument[] = [];
  for (const document of parsed) {
    const problems = [...document.errors, ...document.warnings];
    if (problems.length > 0) {
      // A manifest that cannot be read in full must not become a green assertion.
      throw new Error(
        ['The rendered manifest could not be read:', ...problems.map((p) => `  ${p.message}`)].join(
          '\n',
        ),
      );
    }
    const value: unknown = document.toJS({ maxAliasCount: 100 });
    if (value !== null && typeof value === 'object') documents.push(value as K8sDocument);
  }
  return documents;
}

// ── Navigation ────────────────────────────────────────────────────────────────────────────────

export function byKind(outcome: RenderOutcome, kind: string): readonly K8sDocument[] {
  return outcome.documents.filter((document) => document.kind === kind);
}

/** Every document whose name contains `fragment`, of any kind. */
export function named(outcome: RenderOutcome, fragment: string): readonly K8sDocument[] {
  return outcome.documents.filter((document) => (document.metadata?.name ?? '').includes(fragment));
}

export function one(documents: readonly K8sDocument[], what: string): K8sDocument {
  if (documents.length !== 1) {
    throw new Error(`expected exactly one ${what}, found ${String(documents.length)}`);
  }
  const only = documents[0];
  if (only === undefined) throw new Error(`expected exactly one ${what}, found none`);
  return only;
}

export const RUNNER_FRAGMENT = 'studio-runner';

export function runnerDeployment(outcome: RenderOutcome): K8sDocument {
  return one(
    byKind(outcome, 'Deployment').filter((d) => (d.metadata?.name ?? '').includes(RUNNER_FRAGMENT)),
    'runner Deployment',
  );
}

export function deploymentNamed(outcome: RenderOutcome, fragment: string): K8sDocument {
  return one(
    byKind(outcome, 'Deployment').filter((d) => (d.metadata?.name ?? '').endsWith(fragment)),
    `Deployment ending ${fragment}`,
  );
}

export interface PodSpec {
  readonly serviceAccountName?: string;
  readonly automountServiceAccountToken?: boolean;
  /**
   * Declared rather than cast at each use: since QA MED-1 this field is a *security* fact of the
   * pod, not an incidental one. It is the runner's reaping mechanism and it is simultaneously what
   * makes a second container able to read this pod's mounted Secret through `/proc/1/root`.
   */
  readonly shareProcessNamespace?: boolean;
  readonly initContainers?: readonly Container[];
  readonly terminationGracePeriodSeconds?: number;
  readonly securityContext?: Record<string, unknown>;
  readonly containers?: readonly Container[];
  readonly volumes?: readonly Volume[];
}

export interface Container {
  readonly name?: string;
  readonly image?: string;
  readonly ports?: readonly { readonly name?: string; readonly containerPort?: number }[];
  readonly terminationMessagePolicy?: string;
  readonly command?: readonly string[];
  readonly args?: readonly string[];
  readonly securityContext?: Record<string, unknown>;
  readonly env?: readonly EnvEntry[];
  readonly envFrom?: readonly Record<string, unknown>[];
  readonly volumeMounts?: readonly {
    readonly name?: string;
    readonly mountPath?: string;
    /** Absent means writable, which is what makes AC-4a part 2's disjointness assertion matter. */
    readonly readOnly?: boolean;
    /** A Secret mounted through `subPath` never receives updates (devops co-sign 3.3). */
    readonly subPath?: string;
  }[];
  readonly resources?: {
    readonly limits?: Record<string, string>;
    readonly requests?: Record<string, string>;
  };
  readonly readinessProbe?: { readonly httpGet?: { readonly path?: string }; readonly exec?: { readonly command?: readonly string[] }; readonly failureThreshold?: number };
  readonly livenessProbe?: { readonly httpGet?: { readonly path?: string }; readonly exec?: { readonly command?: readonly string[] }; readonly failureThreshold?: number };
  readonly lifecycle?: Record<string, unknown>;
}

export interface EnvEntry {
  readonly name: string;
  readonly value?: string;
  readonly valueFrom?: {
    readonly secretKeyRef?: { readonly name?: string; readonly key?: string };
    readonly configMapKeyRef?: { readonly name?: string; readonly key?: string };
  };
}

export interface Volume {
  readonly name?: string;
  readonly emptyDir?: { readonly medium?: string; readonly sizeLimit?: string };
  readonly secret?: {
    readonly secretName?: string;
    /** Decimal in the manifest (0440 octal is 288). */
    readonly defaultMode?: number;
    readonly items?: readonly { key?: string; path?: string }[];
  };
  readonly configMap?: {
    readonly name?: string;
    readonly defaultMode?: number;
    readonly items?: readonly { key?: string; path?: string }[];
  };
  readonly persistentVolumeClaim?: { readonly claimName?: string };
}

export function podSpec(deployment: K8sDocument): PodSpec {
  const spec = deployment.spec as { template?: { spec?: PodSpec } } | undefined;
  const pod = spec?.template?.spec;
  if (pod === undefined) throw new Error('the Deployment carries no pod spec');
  return pod;
}

/**
 * The Spring properties the chart mounts for `role` (the `application.yaml` of the ConfigMap that
 * the `spring-config` volume names), parsed. Dotted names stay flat keys, as the backend reads them.
 */
export function mountedSpringProperties(
  outcome: RenderOutcome,
  role: 'api' | 'worker',
): Record<string, unknown> {
  const deployment = deploymentNamed(outcome, `-${role}`);
  const volume = podSpec(deployment).volumes?.find((entry) => entry.name === 'spring-config');
  const configMap = one(
    byKind(outcome, 'ConfigMap').filter((entry) => entry.metadata?.name === volume?.configMap?.name),
    'mounted Spring config',
  );
  return parseYaml(configMap.data?.['application.yaml'] ?? '') as Record<string, unknown>;
}

export function soleContainer(deployment: K8sDocument): Container {
  const containers = podSpec(deployment).containers ?? [];
  return one(containers as unknown as K8sDocument[], 'container') as unknown as Container;
}

/** The environment as a map of name → literal value. Entries with a `valueFrom` are excluded. */
export function envValues(container: Container): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of container.env ?? []) {
    if (typeof entry.value === 'string') out[entry.name] = entry.value;
  }
  return out;
}

export function envNames(container: Container): string[] {
  return (container.env ?? []).map((entry) => entry.name).sort();
}

/**
 * Violations of the bound that makes `shareProcessNamespace: true` safe (QA MED-1).
 *
 * **The coupling, stated because nothing in the chart said it.** A shared PID namespace makes every
 * container in the pod visible to every other through `/proc`, including `/proc/<pid>/root` — so a
 * second container reads `/proc/1/root/etc/studio/object-store/secretAccessKey` regardless of its
 * own volume mounts, and `readOnlyRootFilesystem` does not obstruct a read. The runner pod carries
 * `shareProcessNamespace: true` for reaping **and** mounts the object-store Secret, so the only
 * thing keeping the write-only store credential out of a sidecar's hands is that there is no
 * sidecar.
 *
 * That bound was real but enforced **incidentally**: `soleContainer()` calls `one()`, which throws.
 * A log shipper or a mesh sidecar would have broken several tests for the wrong reason while
 * quietly handing that sidecar the credential. This makes the bound explicit, so adding a container
 * announces itself as a security decision.
 *
 * @returns one string per violation; an empty array is the bound holding.
 */
export function sharedNamespaceViolations(pod: PodSpec): string[] {
  const violations: string[] = [];
  const shared = pod.shareProcessNamespace === true;
  const mountedSecrets = (pod.volumes ?? [])
    .map((volume) => volume.secret?.secretName)
    .filter((name): name is string => typeof name === 'string');
  if (!shared || mountedSecrets.length === 0) return violations;

  const containers = pod.containers ?? [];
  if (containers.length !== 1) {
    violations.push(
      `shareProcessNamespace: true with ${String(containers.length)} containers and a mounted ` +
        `Secret (${mountedSecrets.join(', ')}): every extra container can read ` +
        '/proc/1/root/<mountPath> regardless of its own mounts',
    );
  }
  const initContainers = pod.initContainers ?? [];
  if (initContainers.length > 0) {
    violations.push(
      `shareProcessNamespace: true with ${String(initContainers.length)} initContainers and a ` +
        'mounted Secret: same exposure, one phase earlier',
    );
  }
  return violations;
}

/** Every secret name the pod references, through `env`, `envFrom` or a volume. */
export function referencedSecretNames(pod: PodSpec): string[] {
  const names = new Set<string>();
  for (const container of pod.containers ?? []) {
    for (const entry of container.env ?? []) {
      const name = entry.valueFrom?.secretKeyRef?.name;
      if (typeof name === 'string') names.add(name);
    }
    for (const source of container.envFrom ?? []) {
      const secretRef = source.secretRef as { name?: string } | undefined;
      if (typeof secretRef?.name === 'string') names.add(secretRef.name);
    }
  }
  for (const volume of pod.volumes ?? []) {
    const name = volume.secret?.secretName;
    if (typeof name === 'string') names.add(name);
  }
  return [...names].sort();
}
