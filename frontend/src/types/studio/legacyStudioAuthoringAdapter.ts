import type {
  AuthoringEvidenceReference,
  AuthoringStep,
  AuthoringV2Request,
  GlobalAuthoringContext,
  LegacyAuthoringRequest,
  StepAuthoringContext,
} from './studioTypes';

export type AuthoringValidationCategory =
  | 'INVALID_SHAPE'
  | 'UNSUPPORTED_FIELD'
  | 'MIXED_STEP_SHAPES'
  | 'MISSING_STEP_ID'
  | 'DUPLICATE_STEP_ID'
  | 'ORPHAN_STEP_ID'
  | 'INVALID_CONTEXT_ENTRY'
  | 'INVALID_SECRET_PLACEMENT'
  | 'INVALID_REFERENCE_PLACEMENT'
  | 'FALSE_OBSERVED_PROVENANCE';

export interface AuthoringValidationError {
  category: AuthoringValidationCategory;
  path: string;
}

export type StudioAuthoringParseResult =
  | { ok: true; value: AuthoringV2Request }
  | { ok: false; errors: AuthoringValidationError[] };

export type AuthoringStepIdFactory = () => string;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA_256 = /^[a-f0-9]{64}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function defaultStepIdFactory(): string {
  return globalThis.crypto.randomUUID();
}

function pushUnsupportedFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: AuthoringValidationError[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push({ category: 'UNSUPPORTED_FIELD', path: `${path}.${key}` });
    }
  }
}

function validateEvidenceReference(
  value: unknown,
  path: string,
  stepIds: ReadonlySet<string>,
  ownerStepId: string | undefined,
  errors: AuthoringValidationError[],
): value is AuthoringEvidenceReference {
  if (!isRecord(value)) {
    errors.push({ category: 'INVALID_SHAPE', path });
    return false;
  }
  const keys = [
    'id',
    'revision',
    'source',
    'csiId',
    'environment',
    'route',
    'state',
    'stepId',
    'capturedAt',
    'completeness',
    'hash',
  ] as const;
  pushUnsupportedFields(value, keys, path, errors);

  let valid = hasOnlyKeys(value, keys);
  if (value.source !== 'supplied') {
    errors.push({ category: 'FALSE_OBSERVED_PROVENANCE', path: `${path}.source` });
    valid = false;
  }
  if (typeof value.stepId !== 'string' || !UUID.test(value.stepId)) {
    errors.push({ category: 'INVALID_SHAPE', path: `${path}.stepId` });
    valid = false;
  } else if (!stepIds.has(value.stepId)) {
    errors.push({ category: 'ORPHAN_STEP_ID', path: `${path}.stepId` });
    valid = false;
  } else if (ownerStepId !== undefined && value.stepId !== ownerStepId) {
    errors.push({ category: 'ORPHAN_STEP_ID', path: `${path}.stepId` });
    valid = false;
  }
  if (
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    typeof value.csiId !== 'string' ||
    value.csiId.length > 20 ||
    typeof value.environment !== 'string' ||
    value.environment.length > 50 ||
    typeof value.route !== 'string' ||
    value.route.length === 0 ||
    typeof value.state !== 'string' ||
    value.state.length === 0 ||
    typeof value.capturedAt !== 'string' ||
    !DATE_TIME.test(value.capturedAt) ||
    !['complete', 'partial', 'unknown'].includes(String(value.completeness)) ||
    typeof value.hash !== 'string' ||
    !SHA_256.test(value.hash)
  ) {
    errors.push({ category: 'INVALID_SHAPE', path });
    valid = false;
  }
  return valid;
}

function isDefaultValue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'literal') {
    return hasOnlyKeys(value, ['kind', 'value']) && typeof value.value === 'string';
  }
  if (value.kind === 'variableRef') {
    return (
      hasOnlyKeys(value, ['kind', 'referenceId']) &&
      typeof value.referenceId === 'string' &&
      value.referenceId.length > 0
    );
  }
  return false;
}

function isContextEntry(value: unknown, global: boolean): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'text':
    case 'literal':
      return (
        (!global || value.kind === 'text') &&
        hasOnlyKeys(value, ['kind', 'value']) &&
        typeof value.value === 'string'
      );
    case 'variableRef':
    case 'secretRef':
      return (
        !global &&
        hasOnlyKeys(value, ['kind', 'referenceId']) &&
        typeof value.referenceId === 'string' &&
        value.referenceId.length > 0
      );
    case 'targetHint':
      return (
        hasOnlyKeys(value, ['kind', 'strategy', 'value', 'scope', 'exact']) &&
        ['role', 'label', 'testId', 'text'].includes(String(value.strategy)) &&
        typeof value.value === 'string' &&
        value.value.length > 0 &&
        (value.scope === undefined || typeof value.scope === 'string') &&
        (value.exact === undefined || typeof value.exact === 'boolean')
      );
    case 'default':
      return (
        hasOnlyKeys(value, ['kind', 'name', 'value']) &&
        typeof value.name === 'string' &&
        value.name.length > 0 &&
        isDefaultValue(value.value)
      );
    default:
      return false;
  }
}

function validateContext(
  value: unknown,
  path: string,
  global: boolean,
  stepIds: ReadonlySet<string>,
  ownerStepId: string | undefined,
  errors: AuthoringValidationError[],
): value is GlobalAuthoringContext | StepAuthoringContext {
  if (!isRecord(value)) {
    errors.push({ category: 'INVALID_SHAPE', path });
    return false;
  }
  pushUnsupportedFields(value, ['entries', 'evidenceReferences'], path, errors);
  let valid = hasOnlyKeys(value, ['entries', 'evidenceReferences']);
  if (value.entries !== undefined) {
    if (!Array.isArray(value.entries)) {
      errors.push({ category: 'INVALID_SHAPE', path: `${path}.entries` });
      valid = false;
    } else {
      value.entries.forEach((entry, index) => {
        if (!isContextEntry(entry, global)) {
          errors.push({
            category:
              global && isRecord(entry) && entry.kind === 'secretRef'
                ? 'INVALID_SECRET_PLACEMENT'
                : isRecord(entry) &&
                    entry.kind === 'default' &&
                    isRecord(entry.value) &&
                    entry.value.kind === 'secretRef'
                  ? 'INVALID_REFERENCE_PLACEMENT'
                : global &&
                    isRecord(entry) &&
                    ['literal', 'variableRef'].includes(String(entry.kind))
                  ? 'INVALID_REFERENCE_PLACEMENT'
                : 'INVALID_CONTEXT_ENTRY',
            path: `${path}.entries[${index}]`,
          });
          valid = false;
        }
      });
    }
  }
  if (value.evidenceReferences !== undefined) {
    if (!Array.isArray(value.evidenceReferences)) {
      errors.push({ category: 'INVALID_SHAPE', path: `${path}.evidenceReferences` });
      valid = false;
    } else {
      value.evidenceReferences.forEach((reference, index) => {
        if (
          !validateEvidenceReference(
            reference,
            `${path}.evidenceReferences[${index}]`,
            stepIds,
            ownerStepId,
            errors,
          )
        ) {
          valid = false;
        }
      });
    }
  }
  return valid;
}

/** Returns every contract violation needed by fixture-driven callers; it never mutates input. */
export function validateStudioAuthoring(value: unknown): AuthoringValidationError[] {
  const errors: AuthoringValidationError[] = [];
  if (!isRecord(value)) return [{ category: 'INVALID_SHAPE', path: '$' }];

  if (!Array.isArray(value.steps)) {
    return [{ category: 'INVALID_SHAPE', path: '$.steps' }];
  }
  const strings = value.steps.filter((step) => typeof step === 'string').length;
  const objects = value.steps.filter(isRecord).length;
  if (strings > 0 && objects > 0) {
    errors.push({ category: 'MIXED_STEP_SHAPES', path: '$.steps' });
    return errors;
  }

  if (value.authoringSchemaVersion === undefined && strings === value.steps.length) {
    pushUnsupportedFields(value, ['steps'], '$', errors);
    if (value.steps.length > 100 || value.steps.some((step) => (step as string).length > 500)) {
      errors.push({ category: 'INVALID_SHAPE', path: '$.steps' });
    }
    return errors;
  }

  pushUnsupportedFields(value, ['authoringSchemaVersion', 'globalContext', 'steps'], '$', errors);
  if (value.authoringSchemaVersion !== 2 || value.steps.length > 100) {
    errors.push({ category: 'INVALID_SHAPE', path: '$' });
  }

  const stepIds = new Set<string>();
  value.steps.forEach((step, index) => {
    const path = `$.steps[${index}]`;
    if (!isRecord(step)) {
      errors.push({ category: 'INVALID_SHAPE', path });
      return;
    }
    pushUnsupportedFields(step, ['id', 'text', 'context'], path, errors);
    if (typeof step.id !== 'string' || !UUID.test(step.id)) {
      errors.push({ category: 'MISSING_STEP_ID', path: `${path}.id` });
    } else if (stepIds.has(step.id)) {
      errors.push({ category: 'DUPLICATE_STEP_ID', path: `${path}.id` });
    } else {
      stepIds.add(step.id);
    }
    if (typeof step.text !== 'string' || step.text.length > 500) {
      errors.push({ category: 'INVALID_SHAPE', path: `${path}.text` });
    }
  });

  if (value.globalContext !== undefined) {
    validateContext(value.globalContext, '$.globalContext', true, stepIds, undefined, errors);
  }
  value.steps.forEach((step, index) => {
    if (isRecord(step) && step.context !== undefined) {
      validateContext(
        step.context,
        `$.steps[${index}].context`,
        false,
        stepIds,
        typeof step.id === 'string' ? step.id : undefined,
        errors,
      );
    }
  });
  return errors;
}

export function isLegacyAuthoringRequest(value: unknown): value is LegacyAuthoringRequest {
  return (
    isRecord(value) &&
    value.authoringSchemaVersion === undefined &&
    Array.isArray(value.steps) &&
    value.steps.every((step) => typeof step === 'string') &&
    validateStudioAuthoring(value).length === 0
  );
}

export function isAuthoringV2Request(value: unknown): value is AuthoringV2Request {
  return (
    isRecord(value) &&
    value.authoringSchemaVersion === 2 &&
    validateStudioAuthoring(value).length === 0
  );
}

/**
 * Converts legacy ordered strings without normalizing them. The ID factory is called once per
 * source step and receives no array index, keeping stable identity separate from presentation.
 */
export function adaptLegacyStudioAuthoring(
  legacy: LegacyAuthoringRequest,
  createStepId: AuthoringStepIdFactory = defaultStepIdFactory,
): AuthoringV2Request {
  const legacyErrors = validateStudioAuthoring(legacy);
  if (!isLegacyAuthoringRequest(legacy)) {
    throw new TypeError(`Invalid legacy Studio authoring: ${JSON.stringify(legacyErrors)}`);
  }
  const seen = new Set<string>();
  const steps: AuthoringStep[] = legacy.steps.map((text) => {
    const id = createStepId();
    if (!UUID.test(id) || seen.has(id)) {
      throw new TypeError('The step ID factory must return a fresh UUID for every legacy step');
    }
    seen.add(id);
    return { id, text };
  });
  return { authoringSchemaVersion: 2, steps };
}

export function parseStudioAuthoring(
  value: unknown,
  createStepId: AuthoringStepIdFactory = defaultStepIdFactory,
): StudioAuthoringParseResult {
  const errors = validateStudioAuthoring(value);
  if (errors.length > 0) return { ok: false, errors };
  if (isLegacyAuthoringRequest(value)) {
    return { ok: true, value: adaptLegacyStudioAuthoring(value, createStepId) };
  }
  return { ok: true, value: value as AuthoringV2Request };
}
