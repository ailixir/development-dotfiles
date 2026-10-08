/**
 * The pre-10.1 authoring shapes, kept solely to read drafts that were written before the frozen
 * contract existed (story 10.1, AC-15).
 *
 * Nothing new should be expressed in `TestIR`. The grammar and Python paths, and the step IR they
 * used, were deleted by story 10.51.
 */

import {
  CANONICAL_BROWSER,
  defaultConfiguration,
  DEFAULT_STEP_TIMEOUT_SECONDS,
  type TestConfiguration,
  type WaitStrategy,
} from './studioTypes';

export interface SecretRef {
  id: string;
  label: string;
  scope: 'project' | 'org' | 'user';
  last4?: string;
  createdAt: string;
}

export type VariableValue =
  | { kind: 'plain'; value: string }
  | { kind: 'secret'; ref: SecretRef };

export interface VariableDefinition {
  name: string;
  value: VariableValue;
}

export interface TestIR {
  meta: {
    name: string;
    csiId?: string;
    description?: string;
  };
  environment: string;
  configuration: {
    /** Legacy drafts recorded any engine here; only `chromium` survives normalization. */
    browser: 'chrome' | 'firefox' | 'safari' | 'edge' | 'chromium';
    viewport: { width: number; height: number };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  variables: VariableDefinition[];
}

/**
 * Normalizes a legacy configuration into the contract's.
 *
 * `chrome` named the same engine Playwright calls `chromium`. Any other engine is not executable
 * in V1, so it is normalized too — those drafts are `STALE` server-side and cannot run until they
 * are recompiled and confirmed, which is the honest outcome rather than a silent substitution.
 */
export function toConfiguration(ir: Pick<TestIR, 'configuration'>): TestConfiguration {
  const legacy = ir.configuration;
  if (!legacy) {
    return defaultConfiguration();
  }
  return {
    browser: CANONICAL_BROWSER,
    viewport: {
      width: legacy.viewport?.width ?? 1920,
      height: legacy.viewport?.height ?? 1080,
    },
    timeoutSeconds: legacy.timeout ?? DEFAULT_STEP_TIMEOUT_SECONDS,
    waitStrategy: (legacy.waitStrategy ?? 'networkidle') as WaitStrategy,
  };
}
