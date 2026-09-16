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
 * `helm` is a stage-8 tool (`studio-runner/ci/stages.md`), so this suite runs where stage 8 runs.
 * Where it is absent the suite records that fact in a test rather than skipping silently.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseAllDocuments } from 'yaml';

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

export function helmAvailable(): boolean {
  try {
    execFileSync('helm', ['version', '--short'], { stdio: 'pipe' });
    return existsSync(CHART_DIR);
  } catch {
    return false;
  }
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
  readonly valuesFile?: string | null;
  /** `--set` overrides. This is the render mutation surface. */
  readonly set?: Readonly<Record<string, string>>;
  /** Extra raw arguments, for the mutations `--set` cannot express. */
  readonly args?: readonly string[];
  /** Defaults to true: nothing renders without it and every criterion here is about the runner. */
  readonly enableRunner?: boolean;
}

/**
 * Runs `helm template` and returns the outcome, success or failure, without throwing.
 */
export function renderOutcome(options: RenderOptions = {}): RenderOutcome {
  const args = ['template', 'release-name', CHART_DIR];
  if (options.valuesFile !== undefined && options.valuesFile !== null) {
    args.push('-f', join(CHART_DIR, options.valuesFile));
  }
  if (options.enableRunner !== false) args.push('--set', 'studioRunner.enabled=true');
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
  readonly terminationGracePeriodSeconds?: number;
  readonly securityContext?: Record<string, unknown>;
  readonly containers?: readonly Container[];
  readonly volumes?: readonly Volume[];
}

export interface Container {
  readonly name?: string;
  readonly image?: string;
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
  }[];
  readonly resources?: {
    readonly limits?: Record<string, string>;
    readonly requests?: Record<string, string>;
  };
  readonly readinessProbe?: { readonly httpGet?: { readonly path?: string } };
  readonly livenessProbe?: { readonly httpGet?: { readonly path?: string } };
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
  readonly secret?: { readonly secretName?: string; readonly items?: readonly { key?: string }[] };
  readonly configMap?: { readonly name?: string };
}

export function podSpec(deployment: K8sDocument): PodSpec {
  const spec = deployment.spec as { template?: { spec?: PodSpec } } | undefined;
  const pod = spec?.template?.spec;
  if (pod === undefined) throw new Error('the Deployment carries no pod spec');
  return pod;
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
