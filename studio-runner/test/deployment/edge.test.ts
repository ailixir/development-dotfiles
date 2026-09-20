/**
 * Story 10.18b, AC-13a / AC-16a / AC-19a (rendered half): what the EDGE does to a browser request.
 *
 * **The rendered-manifest rule.** Every assertion here is made on the output of `helm template` —
 * captured bytes produced by running the renderer, parsed as YAML and asserted structurally. An
 * assertion that greps a `values-*.yaml` file or a template file is a source-text scan and
 * satisfies nothing; it is the first of this epic's catalogued vacuous-guard shapes.
 *
 * **The comparison, not the constant, is the criterion.** The ingress idle timeout is compared
 * against the rendered `STUDIO_SSE_HEARTBEAT` and `STUDIO_SSE_LIFETIME` *in the same manifest*; the
 * allowed CORS origin is compared against the rendered `frontend.ingress.host` *in the same
 * manifest*. @po named the failure mode this prevents: a `proxy-read-timeout` annotation sitting
 * beside a heartbeat env var **with nothing joining them** — a second derivation of one bound,
 * invisible until a stream dies in staging. An expected value written as a literal in this file
 * would be exactly that second derivation, one file further away.
 *
 * **Prerequisites are failures, not skips.** Everything here reaches the renderer through
 * `helm.ts`'s `render()`, which calls `requireHelm()` and throws. QA measured what a `skipIf`
 * bought in the first version of this tier: with `helm` off `PATH` it reported *1 passed / 89
 * skipped* and was green. There is no opt-out variable, for the same reason.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';

import {
  byKind,
  deploymentNamed,
  envValues,
  one,
  render,
  renderOutcome,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';
import type { K8sDocument, RenderOutcome } from './helm.js';

const STREAM_INGRESS_SUFFIX = '-api-studio-stream';

/** The runner Deployment's name fragment; it is neither an API nor a worker for these purposes. */
const RUNNER_COMPONENT = 'studio-runner';

/** Annotation names that change how a response is streamed. None may reach the ordinary routes. */
/**
 * A credential carried as a query parameter, in any of the spellings this repository might grow.
 *
 * The SSE assessment forbids it outright — *"Do not put credentials in the event URL"* — because
 * `EventSource` cannot attach a header and a token in the URL is the obvious workaround, while URLs
 * reach proxy logs, browser history and referrer headers.
 *
 * **A scan for something that is absent is the easiest vacuous guard there is**: it would stay green
 * if the pattern were misspelt, and nobody would ever see it fail. The control below plants the
 * canary and watches it be caught.
 */
const CREDENTIAL_QUERY =
  /[?&](access_?token|id_?token|token|api_?key|apikey|session|sessionid|jwt|password|secret)=/giu;

const STREAMING_ANNOTATIONS: readonly string[] = [
  'nginx.ingress.kubernetes.io/proxy-buffering',
  'nginx.ingress.kubernetes.io/proxy-request-buffering',
  'nginx.ingress.kubernetes.io/proxy-read-timeout',
  'nginx.ingress.kubernetes.io/proxy-send-timeout',
  'nginx.ingress.kubernetes.io/use-regex',
];

interface IngressPath {
  readonly path?: string;
  readonly pathType?: string;
  readonly backend?: { readonly service?: { readonly name?: string; readonly port?: { readonly number?: number } } };
}

interface IngressRule {
  readonly host?: string;
  readonly http?: { readonly paths?: readonly IngressPath[] };
}

function ingresses(outcome: RenderOutcome): readonly K8sDocument[] {
  return byKind(outcome, 'Ingress');
}

function ingressEndingWith(outcome: RenderOutcome, suffix: string): K8sDocument {
  return one(
    ingresses(outcome).filter((document) => (document.metadata?.name ?? '').endsWith(suffix)),
    `Ingress ending ${suffix}`,
  );
}

function annotationsOf(document: K8sDocument): Record<string, string> {
  const metadata = document.metadata as { annotations?: Record<string, string> } | undefined;
  return metadata?.annotations ?? {};
}

function rulesOf(document: K8sDocument): readonly IngressRule[] {
  return (document.spec as { rules?: readonly IngressRule[] } | undefined)?.rules ?? [];
}

function pathsOf(document: K8sDocument): readonly IngressPath[] {
  return rulesOf(document).flatMap((rule) => rule.http?.paths ?? []);
}

/** `15s` → 15. Anything that is not a whole number of seconds is a defect, not a rounding. */
function seconds(value: string | undefined, what: string): number {
  if (value === undefined) throw new Error(`${what} is absent from the rendered manifest`);
  const match = /^(\d+)s$/u.exec(value.trim());
  if (match === null) throw new Error(`${what} rendered as ${value}, which is not "<n>s"`);
  return Number(match[1]);
}

// ── AC-13a: the bound between the proxy and the application, in ONE derivation ────────────────

/**
 * Every way the streaming route's timeout can disagree with the SSE bounds the API is running
 * with, computed from **one** rendered manifest.
 *
 * Extracted as a function so the same code that asserts the real chart is the code that is shown
 * to fire on a mutated render below. A guard that is only ever run against a passing input is a
 * guard nobody has watched fail.
 *
 * @returns one string per violation; an empty array is the bound holding.
 */
export function sseBoundViolations(outcome: RenderOutcome): string[] {
  const violations: string[] = [];
  const stream = ingressEndingWith(outcome, STREAM_INGRESS_SUFFIX);
  const annotations = annotationsOf(stream);
  const api = soleContainer(deploymentNamed(outcome, '-api'));
  const env = envValues(api);

  const heartbeat = seconds(env['STUDIO_SSE_HEARTBEAT'], 'STUDIO_SSE_HEARTBEAT');
  const lifetime = seconds(env['STUDIO_SSE_LIFETIME'], 'STUDIO_SSE_LIFETIME');

  for (const name of [
    'nginx.ingress.kubernetes.io/proxy-read-timeout',
    'nginx.ingress.kubernetes.io/proxy-send-timeout',
  ]) {
    const raw = annotations[name];
    if (raw === undefined) {
      violations.push(`${name} is absent from the streaming Ingress`);
      continue;
    }
    const timeout = Number(raw);
    if (!Number.isInteger(timeout)) {
      violations.push(`${name} rendered as ${raw}, which is not a whole number of seconds`);
      continue;
    }
    // §5.5 and the SSE assessment: "Configure upstream idle timeouts longer than the heartbeat
    // interval". Equal is not longer: a proxy that closes exactly when the heartbeat is due is a
    // race, and the browser cannot tell a raced close from a network fault.
    if (timeout <= heartbeat) {
      violations.push(
        `${name} is ${String(timeout)}s but the heartbeat this manifest configures is ` +
          `${String(heartbeat)}s: an idle stream dies before its heartbeat arrives`,
      );
    }
    if (timeout < lifetime) {
      violations.push(
        `${name} is ${String(timeout)}s but the bounded stream lifetime this manifest ` +
          `configures is ${String(lifetime)}s: the proxy closes the stream instead of the ` +
          'application, which the browser cannot distinguish from a fault',
      );
    }
  }
  return violations;
}

describe('AC-13a — the streaming route is configured at the edge, and its timeout is DERIVED', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: renders exactly one streaming Ingress, separate from the API Ingress`, () => {
      const outcome = render({ valuesFile });
      const stream = ingressEndingWith(outcome, STREAM_INGRESS_SUFFIX);
      const names = ingresses(outcome).map((document) => document.metadata?.name ?? '');

      expect(names).toContain(stream.metadata?.name);
      // The API Ingress still exists and is still its own object. A streaming route that replaced
      // it would pass every annotation assertion below and serve nothing.
      expect(names.filter((name) => name.endsWith('-api')).length).toBe(1);
    });

    it(`${label}: buffering is OFF on the streaming route`, () => {
      const annotations = annotationsOf(
        ingressEndingWith(render({ valuesFile }), STREAM_INGRESS_SUFFIX),
      );
      expect(annotations['nginx.ingress.kubernetes.io/proxy-buffering']).toBe('off');
      expect(annotations['nginx.ingress.kubernetes.io/proxy-request-buffering']).toBe('off');
    });

    it(`${label}: the idle timeout exceeds the heartbeat and the lifetime IN THE SAME MANIFEST`, () => {
      // M11. The two values on the right-hand side are read out of the rendered API container, not
      // written here: `STUDIO_SSE_HEARTBEAT` and `STUDIO_SSE_LIFETIME` are the only values
      // SnapshotBroadcaster reads, so this is the bound the running system actually has.
      const violations = sseBoundViolations(render({ valuesFile }));
      expect(violations, violations.join('\n')).toEqual([]);
    });

    it(`${label}: the streaming route covers the two streaming paths and NOTHING else`, () => {
      const stream = ingressEndingWith(render({ valuesFile }), STREAM_INGRESS_SUFFIX);
      const paths = pathsOf(stream);
      expect(paths).toHaveLength(2);

      // Run real URLs through the rendered expressions rather than comparing the expressions to
      // strings. A criterion that compared route *strings* instead of behaviour is a catalogued
      // shape, and the failure it misses is a regex that quietly matches everything.
      const expressions = paths.map((entry) => new RegExp(`^${entry.path ?? ''}$`, 'u'));
      const matches = (url: string): boolean => expressions.some((pattern) => pattern.test(url));

      expect(matches('/api/v1/studio/executions/8b1f6d1e-0000-4000-8000-000000000000/events')).toBe(true);
      expect(matches('/api/v1/studio/executions/8b1f6d1e-0000-4000-8000-000000000000/video')).toBe(true);

      // Ordinary REST must not be dragged onto an unbuffered location by a loose expression.
      for (const rest of [
        '/api/v1/checks',
        '/api/v1/checks/123',
        '/api/v1/studio/executions',
        '/api/v1/studio/executions/8b1f6d1e-0000-4000-8000-000000000000',
        '/api/v1/csi/12345',
        '/actuator/health',
        '/',
      ]) {
        expect(matches(rest), `${rest} is served by the streaming route`).toBe(false);
      }

      for (const entry of paths) {
        expect(entry.pathType).toBe('ImplementationSpecific');
      }
    });

    it(`${label}: the streaming route points at the SAME Service and host as the API Ingress`, () => {
      const outcome = render({ valuesFile });
      const api = ingressEndingWith(outcome, '-api');
      const stream = ingressEndingWith(outcome, STREAM_INGRESS_SUFFIX);

      const apiRule = rulesOf(api)[0];
      const apiBackend = pathsOf(api)[0]?.backend?.service;

      for (const rule of rulesOf(stream)) {
        expect(rule.host).toBe(apiRule?.host);
      }
      for (const entry of pathsOf(stream)) {
        expect(entry.backend?.service?.name).toBe(apiBackend?.name);
        expect(entry.backend?.service?.port?.number).toBe(apiBackend?.port?.number);
      }
    });

    it(`${label}: ORDINARY REST IS UNCHANGED — every other document is identical either way`, () => {
      // The reason the streaming paths carry their own Ingress object at all. The API Ingress is a
      // single `path: / pathType: Prefix` rule, so `proxy-buffering: "off"` written there would
      // unbuffer every REST call in the product. This renders the chart with the feature off and
      // on and asserts the ONLY difference is the streaming Ingress itself — not "the API Ingress
      // looks fine", which would miss a change to the ConfigMap, the Service or the Deployment.
      const without = render({ valuesFile, set: { 'studioSse.ingress.enabled': 'false' } });
      const withRoute = render({ valuesFile });

      const identify = (document: K8sDocument): string =>
        `${document.kind ?? ''}/${document.metadata?.name ?? ''}`;
      const fingerprint = (documents: readonly K8sDocument[]): Record<string, string> =>
        Object.fromEntries(
          documents
            .filter((document) => !identify(document).endsWith(STREAM_INGRESS_SUFFIX))
            .map((document) => [identify(document), JSON.stringify(document)]),
        );

      expect(fingerprint(withRoute.documents)).toEqual(fingerprint(without.documents));
      // …and the feature really did render something, or the comparison above is vacuous.
      expect(withRoute.documents.length).toBe(without.documents.length + 1);
    });

    it(`${label}: no streaming annotation reaches the API or frontend Ingress`, () => {
      // M11's second mutation. Moving `proxy-buffering: off` onto the main Ingress is the change
      // that would "fix" SSE by unbuffering the whole product; this is what notices.
      const outcome = render({ valuesFile });
      for (const document of ingresses(outcome)) {
        const name = document.metadata?.name ?? '';
        if (name.endsWith(STREAM_INGRESS_SUFFIX)) continue;
        for (const annotation of STREAMING_ANNOTATIONS) {
          expect(
            annotationsOf(document)[annotation],
            `${annotation} is set on ${name}, which serves path: / — every REST call is affected`,
          ).toBeUndefined();
        }
      }
    });
  }

  it('the timeout/heartbeat guard FIRES: raising the heartbeat above the timeout is caught', () => {
    // The mutation, run inside the measurement window: the override goes to the `helm template`
    // invocation this assertion then reads, so there is no cached rendering to mutate after the
    // fact. Without this, `sseBoundViolations` would only ever have been run against inputs that
    // satisfy it — which is a guard nobody has watched fail.
    const violations = sseBoundViolations(render({ set: { 'studioSse.heartbeatSeconds': '600' } }));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join('\n')).toContain('an idle stream dies before its heartbeat arrives');
  });

  it('the guard is SILENT on the unmutated chart — it is not simply always violated', () => {
    expect(sseBoundViolations(render())).toEqual([]);
  });

  it('the derivation is real: lengthening the lifetime moves the timeout with it', () => {
    // One derivation, not two. If `proxy-read-timeout` were a values key of its own, this would
    // stay at 120 and a deployment could lengthen the stream while leaving the proxy behind — the
    // 8090/8080 defect of this story's problem statement, in the one place where its failure is
    // invisible until a stream dies in staging.
    const longer = render({ set: { 'studioSse.lifetimeSeconds': '300' } });
    const annotations = annotationsOf(ingressEndingWith(longer, STREAM_INGRESS_SUFFIX));
    expect(annotations['nginx.ingress.kubernetes.io/proxy-read-timeout']).toBe('360');
    expect(sseBoundViolations(longer)).toEqual([]);
  });

  it('a values key may not override the derived annotations — the bound has one owner', () => {
    const outcome = renderOutcome({
      args: [
        '--set',
        'studioSse.ingress.extraAnnotations.nginx\\.ingress\\.kubernetes\\.io/proxy-read-timeout=1',
      ],
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('one owner');
  });
});

// ── AC-16a: credentialed CORS coherence, and no credential in a URL ───────────────────────────

/**
 * Every way the rendered CORS configuration can disagree with the hosts this chart deploys.
 *
 * Both sides come from the same rendered manifest: the allowed origins from the API container's
 * environment, the frontend host from the frontend Ingress. Neither is written here.
 */
export function corsViolations(outcome: RenderOutcome): string[] {
  const violations: string[] = [];
  const api = soleContainer(deploymentNamed(outcome, '-api'));
  const raw = envValues(api)['CHECKS_CORS_ALLOWED_ORIGINS'];
  if (raw === undefined) {
    return ['CHECKS_CORS_ALLOWED_ORIGINS is absent from the rendered API container'];
  }
  const origins = raw.split(',').map((entry) => entry.trim());

  if (origins.includes('*')) {
    violations.push(
      'CHECKS_CORS_ALLOWED_ORIGINS contains "*" while SecurityConfig sets ' +
        'allowCredentials(true): a wildcard credentialed origin is rejected by every browser and ' +
        'is a request-forgery surface',
    );
  }

  const frontend = ingresses(outcome).filter((document) =>
    (document.metadata?.name ?? '').endsWith('-frontend'),
  );
  for (const document of frontend) {
    for (const rule of rulesOf(document)) {
      const host = rule.host;
      if (host === undefined) continue;
      const expected = `https://${host}`;
      if (!origins.includes(expected)) {
        violations.push(
          `the chart deploys the browser at ${expected} and the API's allowed origins are ` +
            `[${origins.join(', ')}]: the frontend this chart deploys cannot call the API this ` +
            'chart deploys',
        );
      }
    }
  }
  return violations;
}

describe('AC-16a — credentialed CORS is coherent for the hosts this chart deploys', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: the allowed origin is the deployed frontend origin, exactly, and never "*"`, () => {
      const violations = corsViolations(render({ valuesFile }));
      expect(violations, violations.join('\n')).toEqual([]);
    });

    it(`${label}: the API and frontend hosts are compared, not assumed equal`, () => {
      // SPK-02's "why it cannot be established locally" rests on this: the Helm values deploy the
      // MFE and API on DIFFERENT hosts, so "same-origin" is not what the chart does. Asserting the
      // difference keeps that fact in the manifest rather than in a paragraph.
      const outcome = render({ valuesFile });
      const apiHost = rulesOf(ingressEndingWith(outcome, '-api'))[0]?.host;
      const frontendHost = rulesOf(ingressEndingWith(outcome, '-frontend'))[0]?.host;
      expect(apiHost).toBeDefined();
      expect(frontendHost).toBeDefined();
      expect(apiHost).not.toEqual(frontendHost);
    });

    it(`${label}: no rendered value carries a credential as a query parameter`, () => {
      const found = render({ valuesFile }).raw.match(CREDENTIAL_QUERY);
      expect(found, `the rendered manifest carries ${String(found)}`).toBeNull();
    });
  }

  it('the CORS guard FIRES: moving the frontend host without the origin is caught', () => {
    // M12's second mutation, inside the measurement window.
    const violations = corsViolations(
      render({ set: { 'frontend.ingress.host': 'checks-moved.citi.com' } }),
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join('\n')).toContain('cannot call the API this chart deploys');
  });

  it('the CORS guard FIRES: a wildcard origin with credentials is caught', () => {
    // M12. `--set` splits on commas, so the wildcard goes in on its own.
    const violations = corsViolations(
      render({ set: { 'backend.env.CHECKS_CORS_ALLOWED_ORIGINS': '*' } }),
    );
    expect(violations.join('\n')).toContain('wildcard credentialed origin');
  });

  it('the CORS guard is SILENT on the unmutated chart', () => {
    expect(corsViolations(render())).toEqual([]);
  });

  it('the credential-in-URL scan CAN fire — the canary is planted, not assumed', () => {
    // Without this, the four assertions above would be satisfied by a pattern that matches nothing.
    for (const planted of [
      'value: "https://checks.citi.com/api/v1/studio/executions/x/events?access_token=abc"',
      'value: "https://host/x?token=abc"',
      'value: "https://host/x?a=1&api_key=abc"',
      'value: "https://host/x?session=abc"',
    ]) {
      CREDENTIAL_QUERY.lastIndex = 0;
      expect(planted.match(CREDENTIAL_QUERY), planted).not.toBeNull();
    }
    // …and it does not fire on an ordinary query parameter, or every render would be red.
    CREDENTIAL_QUERY.lastIndex = 0;
    expect('value: "https://host/x?download=true"'.match(CREDENTIAL_QUERY)).toBeNull();
  });

  it('the controller scan CAN fire — the same canary, against the same expression', () => {
    // `ExecutionEventsController` takes no `@RequestParam` at all today, so the assertion below it
    // would pass against a pattern that could never match anything.
    const pattern = /@RequestParam[^)]*(token|key|session|auth)/iu;
    expect(pattern.test('@RequestParam("access_token") String token')).toBe(true);
    expect(pattern.test('@RequestParam(name = "sessionId") String s')).toBe(true);
    expect(pattern.test('@RequestParam("download") boolean download')).toBe(false);
  });

  it('the credentialed CORS configuration is still credentialed, in the production source', () => {
    // The other half of the criterion lives in Java: `allowCredentials` stays true, and it is what
    // makes the exact-origin requirement above load-bearing rather than cosmetic. Read from the
    // production file, because a copy of the expectation would be a second derivation.
    const securityConfig = readFileSync(
      join(packageRoot, '..', 'backend', 'src', 'main', 'java', 'com', 'citi', 'put', 'checks',
        'config', 'SecurityConfig.java'),
      'utf8',
    );
    expect(securityConfig).toContain('config.setAllowCredentials(true)');
    expect(securityConfig).not.toContain('setAllowedOriginPatterns');
  });

  it('ExecutionEventsController takes no credential as a query parameter', () => {
    // AC-16a asserts this over the controller's mapping as well as over the rendered
    // configuration, because the route is the thing a browser types. `EventSource` cannot attach a
    // header, and the tempting fix for that is a token in the URL — which the SSE assessment
    // forbids outright ("Do not put credentials in the event URL") because URLs reach proxy logs,
    // browser history and referrers.
    const controller = readFileSync(
      join(packageRoot, '..', 'backend', 'src', 'main', 'java', 'com', 'citi', 'put', 'checks',
        'studio', 'sse', 'ExecutionEventsController.java'),
      'utf8',
    );
    expect(controller).toContain('@GetMapping("/executions/{id}/events")');
    expect(controller).not.toMatch(/@RequestParam[^)]*(token|key|session|auth)/iu);
  });
});

// ── AC-19a, the rendered half: all three ED-02 bypasses closed in the deployed profile ────────

/** The three ED-02 flags, as the rendered API container carries them. */
const BYPASS_KEYS: readonly string[] = [
  'CHECKS_BYPASS_CORE_SERVICE',
  'CHECKS_BYPASS_IDENTITY_HEADERS',
  'CHECKS_BYPASS_CSI_READ',
];

export function bypassViolations(outcome: RenderOutcome): string[] {
  const env = envValues(soleContainer(deploymentNamed(outcome, '-api')));
  const violations: string[] = [];
  for (const key of BYPASS_KEYS) {
    const value = env[key];
    if (value === undefined) {
      violations.push(`${key} is absent from the rendered API container`);
    } else if (value !== 'false') {
      violations.push(`${key} renders as ${value}: this profile authenticates callers it must not`);
    }
  }
  return violations;
}

describe('AC-19a (rendered half) — the three ED-02 bypasses are closed in every deployed profile', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: all three bypasses render false, and all three are PRESENT`, () => {
      // Present matters as much as false. A missing key would fall back to the application
      // default — which is also false — and the assertion would pass while the manifest said
      // nothing. A deployed profile that a reader cannot audit from the manifest is not closed,
      // it is merely not open today.
      const violations = bypassViolations(render({ valuesFile }));
      expect(violations, violations.join('\n')).toEqual([]);
    });
  }

  it('the guard FIRES: re-opening the Core-service bypass in the values is caught', () => {
    const violations = bypassViolations(
      render({ set: { 'backend.identityBypass.coreService': 'true' } }),
    );
    expect(violations.join('\n')).toContain('CHECKS_BYPASS_CORE_SERVICE renders as true');
  });

  it('the guard FIRES: re-opening the header-identity path in the values is caught', () => {
    const violations = bypassViolations(
      render({ set: { 'backend.identityBypass.identityHeaders': 'true' } }),
    );
    expect(violations.join('\n')).toContain('CHECKS_BYPASS_IDENTITY_HEADERS renders as true');
  });

  it('the guard FIRES: re-opening the CSI read bypass in the values is caught', () => {
    const violations = bypassViolations(
      render({ set: { 'backend.identityBypass.csiRead': 'true' } }),
    );
    expect(violations.join('\n')).toContain('CHECKS_BYPASS_CSI_READ renders as true');
  });

  it('the guard is SILENT on the unmutated chart — three separate flags, three separate reds', () => {
    expect(bypassViolations(render())).toEqual([]);
  });
});

// ── AC-23a (rendered half): the kill switch and the dispatcher are two distinct decisions ─────

/** Every component's rendered view of the two switches, keyed by Deployment name. */
function switchesByComponent(
  outcome: RenderOutcome,
): Record<string, { kill: string | undefined; dispatcher: string | undefined }> {
  const out: Record<string, { kill: string | undefined; dispatcher: string | undefined }> = {};
  for (const document of byKind(outcome, 'Deployment')) {
    const name = document.metadata?.name ?? '';
    const containers =
      (document.spec as { template?: { spec?: { containers?: readonly unknown[] } } } | undefined)
        ?.template?.spec?.containers ?? [];
    if (containers.length !== 1) continue;
    const env = envValues(containers[0] as Parameters<typeof envValues>[0]);
    out[name] = {
      kill: env['STUDIO_EXECUTION_ENABLED'],
      dispatcher: env['STUDIO_DISPATCHER_ENABLED'],
    };
  }
  return out;
}

describe('AC-23a (rendered half) — kill switch and dispatcher, wired coherently', () => {
  for (const valuesFile of VALUE_SETS) {
    const label = valueSetName(valuesFile);

    it(`${label}: the WORKER is the only component that dispatches`, () => {
      const switches = switchesByComponent(render({ valuesFile }));
      const dispatching = Object.entries(switches)
        .filter(([, value]) => value.dispatcher === 'true')
        .map(([name]) => name);

      expect(dispatching).toHaveLength(1);
      expect(dispatching[0]).toContain('-worker');

      // And the API says so explicitly rather than relying on a default. The two defaults in the
      // application disagree — `application.yml` renders false, `Dispatcher.enabledOrDefault()`
      // returns true for an absent value — so an unset key here would be a coin toss.
      const api = Object.entries(switches).find(([name]) => name.endsWith('-api'))?.[1];
      expect(api?.dispatcher).toBe('false');
    });

    it(`${label}: the kill switch is ON and comes from a DIFFERENT key than the dispatcher`, () => {
      const switches = switchesByComponent(render({ valuesFile }));
      for (const [name, value] of Object.entries(switches)) {
        if (name.endsWith('-frontend') || name.includes(RUNNER_COMPONENT)) continue;
        expect(value.kill, `${name} does not state the kill switch`).toBe('true');
      }
    });
  }

  it('the two keys are INDEPENDENT: engaging the kill switch does not stop the dispatcher', () => {
    // BRD §9: the switch "rejects new executions and closes queued undispatched work EXPLICITLY".
    // `StudioDispatcher.dispatchOnce()` is what performs that closure, so a chart that turned the
    // dispatcher off along with the switch would leave the queued work it promised to close.
    const killed = switchesByComponent(render({ set: { 'studioExecution.enabled': 'false' } }));
    const worker = Object.entries(killed).find(([name]) => name.endsWith('-worker'))?.[1];
    expect(worker?.kill).toBe('false');
    expect(worker?.dispatcher).toBe('true');
  });

  it('…and turning the dispatcher off does not engage the kill switch', () => {
    const quiet = switchesByComponent(
      render({ set: { 'studioExecution.dispatcherEnabled': 'false' } }),
    );
    const worker = Object.entries(quiet).find(([name]) => name.endsWith('-worker'))?.[1];
    expect(worker?.dispatcher).toBe('false');
    expect(worker?.kill).toBe('true');
  });
});
