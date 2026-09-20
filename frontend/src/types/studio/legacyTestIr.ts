/**
 * The pre-10.1 authoring shapes, kept solely to read drafts that were written before the frozen
 * contract existed (story 10.1, AC-15).
 *
 * Nothing new should be expressed in `TestIR`. The editor still builds one while the grammar and
 * Python paths are retired by 10.11; until then, `toTestRequest` is the single crossing point
 * from the legacy shape into the contract, and it never emits anything the server will reject.
 */

import {
  CANONICAL_BROWSER,
  defaultConfiguration,
  type StudioVariable,
  type TestConfiguration,
  type TestRequest,
  type WaitStrategy,
} from './studioTypes';

export type StepActionType =
  | 'go_to'
  | 'click'
  | 'type'
  | 'wait_for_text'
  | 'check_url_contains';

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

export interface StepIRBase {
  id: string;
  index: number;
  originalText: string;
}

export interface GoToStepIR extends StepIRBase {
  type: 'go_to';
  url: string;
}

export interface ClickStepIR extends StepIRBase {
  type: 'click';
  targetText?: string;
  roleHint?: 'button' | 'link' | 'checkbox' | 'textbox' | 'combobox' | 'menuitem' | 'none';
}

export interface TypeStepIR extends StepIRBase {
  type: 'type';
  targetFieldText?: string;
  value: { raw?: string; varName?: string; secretId?: string };
}

export interface WaitForTextStepIR extends StepIRBase {
  type: 'wait_for_text';
  text: string;
  timeoutMs?: number;
}

export interface CheckUrlContainsStepIR extends StepIRBase {
  type: 'check_url_contains';
  substring: string;
}

export type StepIR =
  | GoToStepIR
  | ClickStepIR
  | TypeStepIR
  | WaitForTextStepIR
  | CheckUrlContainsStepIR;

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
  steps: StepIR[];
}

/** Ordered authored lines. The compiler is index-aligned to exactly this list. */
export function toSteps(ir: Pick<TestIR, 'steps'>): string[] {
  return [...ir.steps].sort((a, b) => a.index - b.index).map((step) => step.originalText);
}

export function toVariables(ir: Pick<TestIR, 'variables'>): StudioVariable[] {
  return (ir.variables ?? []).map((variable) =>
    variable.value?.kind === 'secret'
      ? { name: variable.name, kind: 'secretRef', secretId: variable.value.ref?.id ?? null }
      : { name: variable.name, kind: 'plain', value: variable.value?.value ?? null },
  );
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
    timeoutSeconds: legacy.timeout ?? 30,
    waitStrategy: (legacy.waitStrategy ?? 'networkidle') as WaitStrategy,
  };
}

/** The one crossing point from a legacy draft into the frozen request contract. */
export function toTestRequest(
  ir: TestIR,
  overrides: Partial<TestRequest> & { name?: string; csiId?: string },
): TestRequest {
  return {
    name: overrides.name ?? ir.meta?.name ?? 'Untitled Test',
    description: overrides.description ?? ir.meta?.description ?? null,
    csiId: overrides.csiId ?? ir.meta?.csiId ?? null,
    environment: overrides.environment ?? ir.environment ?? 'Production',
    steps: overrides.steps ?? toSteps(ir),
    variables: overrides.variables ?? toVariables(ir),
    configuration: overrides.configuration ?? toConfiguration(ir),
    sourceRevision: overrides.sourceRevision ?? null,
    configurationRevision: overrides.configurationRevision ?? null,
  };
}
