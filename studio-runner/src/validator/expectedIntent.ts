import type { Operation } from '../executor/operations.js';

export const EXPECTED_INTENT_SCHEMA_VERSION = 1;

export interface ExpectedIntentStep {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly operations: readonly Operation[];
}

export interface ExpectedIntent {
  readonly schemaVersion: 1;
  readonly steps: readonly ExpectedIntentStep[];
}

export type ExpectedIntentResult =
  | { readonly ok: true; readonly intent: ExpectedIntent }
  | { readonly ok: false; readonly code: string; readonly path?: string };

const DOCUMENT_KEYS = new Set(['schemaVersion', 'steps']);
const STEP_KEYS = new Set(['stepIndex', 'stepId', 'operations']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closed(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function keys(value: unknown, allowed: readonly string[], required: readonly string[]): value is Record<string, unknown> {
  return record(value) && closed(value, new Set(allowed)) && required.every((name) => Object.hasOwn(value, name));
}

const textMatcher = (value: unknown): boolean =>
  keys(value, ['kind', 'value'], ['kind', 'value']) && value.kind === 'literal' && typeof value.value === 'string'
  || keys(value, ['kind', 'name'], ['kind', 'name']) && value.kind === 'variable' && typeof value.name === 'string' && value.name.length > 0
  || keys(value, ['kind', 'source', 'flags'], ['kind', 'source', 'flags']) && value.kind === 'regex' && typeof value.source === 'string' && typeof value.flags === 'string';

const fillValue = (value: unknown): boolean => textMatcher(value)
  || keys(value, ['kind', 'id'], ['kind', 'id']) && value.kind === 'secret' && typeof value.id === 'string' && value.id.length > 0;

const literalOrVariable = (value: unknown): boolean =>
  keys(value, ['kind', 'value'], ['kind', 'value']) && value.kind === 'literal' && typeof value.value === 'string'
  || keys(value, ['kind', 'name'], ['kind', 'name']) && value.kind === 'variable' && typeof value.name === 'string' && value.name.length > 0;

function optionBag(value: unknown, allowed: readonly string[]): boolean {
  if (!keys(value, allowed, [])) return false;
  return Object.entries(value).every(([name, item]) => {
    if (['timeout', 'delay', 'level'].includes(name)) return typeof item === 'number' && Number.isInteger(item) && item >= 0;
    if (name === 'clickCount') return typeof item === 'number' && Number.isInteger(item) && item >= 1;
    if (name === 'button') return item === 'left' || item === 'right' || item === 'middle';
    if (name === 'waitUntil') return ['load', 'domcontentloaded', 'networkidle', 'commit'].includes(String(item));
    if (name === 'name') return textMatcher(item);
    return typeof item === 'boolean';
  });
}

function locatorSegment(value: unknown): boolean {
  if (!record(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'getByRole') {
    return keys(value, ['kind', 'role', 'options'], ['kind', 'role'])
      && typeof value.role === 'string'
      && (value.options === undefined || optionBag(value.options, ['name', 'exact', 'checked', 'disabled', 'expanded', 'selected', 'pressed', 'level']));
  }
  if (['getByText', 'getByLabel', 'getByPlaceholder'].includes(value.kind)) {
    return keys(value, ['kind', 'text', 'options'], ['kind', 'text'])
      && textMatcher(value.text)
      && (value.options === undefined || optionBag(value.options, ['exact']));
  }
  if (value.kind === 'getByTestId') {
    return keys(value, ['kind', 'testId'], ['kind', 'testId'])
      && (keys(value.testId, ['kind', 'value'], ['kind', 'value']) && value.testId.kind === 'literal' && typeof value.testId.value === 'string'
        || keys(value.testId, ['kind', 'name'], ['kind', 'name']) && value.testId.kind === 'variable' && typeof value.testId.name === 'string');
  }
  return value.kind === 'locator'
    && keys(value, ['kind', 'selector'], ['kind', 'selector'])
    && typeof value.selector === 'string';
}

function locator(value: unknown): boolean {
  return keys(value, ['segments'], ['segments'])
    && Array.isArray(value.segments) && value.segments.length > 0 && value.segments.every(locatorSegment);
}

function operationPath(value: unknown, path: string): string | null {
  if (!record(value) || typeof value.op !== 'string') return path;
  const shapes: Record<string, { allowed: string[]; required: string[]; options?: string[] }> = {
    goto: { allowed: ['op', 'url', 'options'], required: ['op', 'url'], options: ['timeout', 'waitUntil'] },
    waitForURL: { allowed: ['op', 'url', 'options'], required: ['op', 'url'], options: ['timeout', 'waitUntil'] },
    click: { allowed: ['op', 'locator', 'options'], required: ['op', 'locator'], options: ['timeout', 'force', 'trial', 'button', 'clickCount', 'delay'] },
    fill: { allowed: ['op', 'locator', 'value', 'options'], required: ['op', 'locator', 'value'], options: ['timeout', 'force', 'trial'] },
    press: { allowed: ['op', 'locator', 'key', 'options'], required: ['op', 'locator', 'key'], options: ['timeout', 'delay'] },
    check: { allowed: ['op', 'locator', 'options'], required: ['op', 'locator'], options: ['timeout', 'force', 'trial'] },
    uncheck: { allowed: ['op', 'locator', 'options'], required: ['op', 'locator'], options: ['timeout', 'force', 'trial'] },
    hover: { allowed: ['op', 'locator', 'options'], required: ['op', 'locator'], options: ['timeout', 'force', 'trial'] },
    selectOption: { allowed: ['op', 'locator', 'value', 'options'], required: ['op', 'locator', 'value'], options: ['timeout', 'force', 'trial'] },
    expectVisible: { allowed: ['op', 'locator', 'options'], required: ['op', 'locator'], options: ['timeout'] },
    expectContainText: { allowed: ['op', 'locator', 'expected', 'options'], required: ['op', 'locator', 'expected'], options: ['timeout', 'ignoreCase', 'useInnerText'] },
    expectValue: { allowed: ['op', 'locator', 'expected', 'options'], required: ['op', 'locator', 'expected'], options: ['timeout'] },
    expectUrl: { allowed: ['op', 'expected', 'options'], required: ['op', 'expected'], options: ['timeout', 'ignoreCase'] },
    expectTitle: { allowed: ['op', 'expected', 'options'], required: ['op', 'expected'], options: ['timeout'] },
  };
  const shape = shapes[value.op];
  if (shape === undefined || !keys(value, shape.allowed, shape.required)) return path;
  if (value.options !== undefined && !optionBag(value.options, shape.options ?? [])) return `${path}.options`;
  if (shape.required.includes('locator') && !locator(value.locator)) return `${path}.locator`;
  if ((value.op === 'goto' && !literalOrVariable(value.url)) || (value.op === 'waitForURL' && !textMatcher(value.url))) return `${path}.url`;
  if (value.op === 'fill' && !fillValue(value.value)) return `${path}.value`;
  if (value.op === 'selectOption' && !literalOrVariable(value.value)) return `${path}.value`;
  if (value.op === 'press' && !(keys(value.key, ['kind', 'value'], ['kind', 'value']) && value.key.kind === 'literal' && typeof value.key.value === 'string')) return `${path}.key`;
  if (shape.required.includes('expected') && !textMatcher(value.expected)) return `${path}.expected`;
  return null;
}

/** Closed, bounded expected-intent envelope. Operation shape is compared against parser output. */
export function parseExpectedIntent(value: unknown, stepCount: number, maxBytes: number): ExpectedIntentResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, code: 'EXPECTED_INTENT_INVALID' };
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    return { ok: false, code: 'EXPECTED_INTENT_TOO_LARGE' };
  }
  if (!record(value) || !closed(value, DOCUMENT_KEYS) || !Array.isArray(value.steps)) {
    return { ok: false, code: 'EXPECTED_INTENT_INVALID' };
  }
  if (value.schemaVersion !== 1) return { ok: false, code: 'EXPECTED_INTENT_VERSION_UNSUPPORTED' };
  if (value.steps.length !== stepCount) return { ok: false, code: 'EXPECTED_INTENT_STEP_COUNT_MISMATCH' };
  const ids = new Set<string>();
  for (let index = 0; index < value.steps.length; index += 1) {
    const step: unknown = value.steps[index];
    if (!record(step) || !closed(step, STEP_KEYS) || step.stepIndex !== index || typeof step.stepId !== 'string' || !UUID.test(step.stepId) || !Array.isArray(step.operations)) {
      return { ok: false, code: 'EXPECTED_INTENT_STEP_INVALID' };
    }
    if (ids.has(step.stepId)) return { ok: false, code: 'EXPECTED_INTENT_DUPLICATE_STEP' };
    ids.add(step.stepId);
    if (step.operations.length === 0) return { ok: false, code: 'EXPECTED_INTENT_OPERATION_INVALID' };
    for (let operationIndex = 0; operationIndex < step.operations.length; operationIndex += 1) {
      const path = operationPath(step.operations[operationIndex], `$.steps[${String(index)}].operations[${String(operationIndex)}]`);
      if (path !== null) return { ok: false, code: 'EXPECTED_INTENT_OPERATION_INVALID', path };
    }
  }
  return { ok: true, intent: value as unknown as ExpectedIntent };
}

function normalized(value: unknown, defaultTimeoutMs?: number, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => normalized(item, defaultTimeoutMs));
  if (!record(value)) return value;
  const result: Record<string, unknown> = {};
  for (const name of Object.keys(value).sort()) {
    const item = value[name];
    if (item === undefined) continue;
    if (name === 'timeout' && item === defaultTimeoutMs) continue;
    const next = normalized(item, defaultTimeoutMs, name);
    if (record(next) && Object.keys(next).length === 0) continue;
    result[name] = next;
  }
  // Only documented Playwright defaults are equivalent to omission.
  for (const booleanDefault of ['force', 'trial', 'exact', 'ignoreCase', 'useInnerText']) {
    if (result[booleanDefault] === false) Reflect.deleteProperty(result, booleanDefault);
  }
  if (key === 'options' && result.button === 'left') delete result.button;
  if (key === 'options' && result.clickCount === 1) delete result.clickCount;
  return result;
}

export function operationsCorrespond(
  actual: readonly Operation[],
  expected: readonly Operation[],
  defaultTimeoutMs?: number,
): boolean {
  return JSON.stringify(normalized(actual, defaultTimeoutMs)) === JSON.stringify(normalized(expected, defaultTimeoutMs));
}

export function expectedReferences(operations: readonly Operation[]): { variables: Set<string>; secrets: Set<string> } {
  const variables = new Set<string>();
  const secrets = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!record(value)) return;
    if (value.kind === 'variable' && typeof value.name === 'string') variables.add(value.name);
    if (value.kind === 'secret' && typeof value.id === 'string') secrets.add(value.id);
    Object.values(value).forEach(visit);
  };
  operations.forEach(visit);
  return { variables, secrets };
}
