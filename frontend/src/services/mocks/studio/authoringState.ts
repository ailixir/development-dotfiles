import type {
  AuthoringV2Request,
  AuthoringV2Response,
  TestDetailDto,
  TestDto,
  TestRequest,
} from '@/types/studio/studioTypes';
import { validateStudioAuthoring } from '@/types/studio/studioAuthoringValidation';

const sources = new Map<string, AuthoringV2Request>();
export const resetAuthoringMocks = (): void => sources.clear();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The stable ID the mock gives step `index` (0-based) of a fixture draft, which the list fixtures
 * hold as display text only. Deterministic, so two reads of one draft agree, and shaped like the
 * document's own examples (`…0001`, `…0002`, …): `readinessFixtures.ts` names the second step of
 * the `NEEDS_RELEARN` draft by exactly that ID.
 */
export const fixtureStepId = (index: number): string =>
  `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`;

/** A fixture draft as the single read serves it: its list steps, each under its fixture ID. */
export function fixtureDetail(test: TestDto): TestDetailDto {
  return {
    ...test,
    authoringSchemaVersion: 2,
    steps: test.steps.map((text, index) => ({ id: fixtureStepId(index), text })),
  };
}

/** What the mock holds as a draft's authoring source: the last v2 write, else the fixture's steps. */
function sourceOf(test: TestDto): AuthoringV2Request {
  return sources.get(test.id) ?? normalizedSource(fixtureDetail(test));
}

/** A draft's current steps by stable ID, as the guided mirror learns them. */
export function stepRefsOf(test: TestDto): Array<{ stepId: string; text: string }> {
  return sourceOf(test).steps.map((step) => ({ stepId: step.id, text: step.text }));
}

export function authoringSource(body: TestRequest): AuthoringV2Request {
  return {
    authoringSchemaVersion: 2,
    globalContext: body.globalContext,
    steps: body.steps,
  };
}

export function validateAuthoringWrite(body: TestRequest, csiId: string): string | undefined {
  const errors = validateStudioAuthoring(authoringSource(body));
  if (errors.length) {
    const category = errors[0].category;
    return category === 'INVALID_SHAPE' || category === 'INVALID_CONTEXT_ENTRY' ? 'INVALID_AUTHORING' : category;
  }
  const references = [
    ...(body.globalContext?.evidenceReferences ?? []),
    ...body.steps.flatMap(step => step.context?.evidenceReferences ?? []),
  ];
  if (references.some(reference => reference.csiId !== csiId)) return 'STUDIO_FORBIDDEN';
  const evidenceById = new Map<string, string>();
  for (const reference of references) {
    const serialized = canonical(reference);
    const previous = evidenceById.get(reference.id);
    if (previous !== undefined && previous !== serialized) return 'DUPLICATE_EVIDENCE_REFERENCE';
    evidenceById.set(reference.id, serialized);
  }
  return undefined;
}

export function normalizedSource(source: AuthoringV2Request): AuthoringV2Request {
  return clone({
    authoringSchemaVersion: 2,
    globalContext: {
      entries: source.globalContext?.entries ?? [],
      evidenceReferences: source.globalContext?.evidenceReferences ?? [],
    },
    steps: source.steps.map(step => ({
      ...step,
      context: {
        entries: step.context?.entries ?? [],
        evidenceReferences: step.context?.evidenceReferences ?? [],
      },
    })),
  });
}

function contextIdentity(source: AuthoringV2Request): unknown {
  return {
    globalContext: source.globalContext,
    stepContexts: Object.fromEntries(source.steps
      .filter(step => (step.context?.entries?.length ?? 0) + (step.context?.evidenceReferences?.length ?? 0) > 0)
      .map(step => [step.id, step.context])),
  };
}

/** Object-key order is irrelevant to dirty classification; step and entry order is significant. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function changesFor(previous: TestDto, next: TestRequest) {
  const source = normalizedSource(authoringSource(next));
  const old = sourceOf(previous);
  return {
    source:
      canonical(old.steps.map(step => [step.id, step.text])) !==
      canonical(source.steps.map(step => [step.id, step.text])),
    configuration: canonical(contextIdentity(old)) !== canonical(contextIdentity(source)) ||
      canonical(previous.configuration) !== canonical(next.configuration) ||
      canonical(previous.variables) !== canonical(next.variables ?? []) || previous.environment !== next.environment,
  };
}

export function storeAuthoring(id: string, source: AuthoringV2Request): void {
  sources.set(id, normalizedSource(source));
}

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Hashes are mock provenance only, never a client-generated execution/confirmation authority. */
export async function authoringProjection(test: TestDto): Promise<TestDetailDto> {
  const source = sourceOf(test);
  const contexts = [source.globalContext, ...source.steps.map(step => step.context)];
  const references = new Map<string, string | null>();
  const evidence = new Map<string, { id: string; revision: number; hash: string }>();
  contexts.forEach(context => {
    context?.entries?.forEach(entry => {
      const id = entry.kind === 'variableRef' ? entry.referenceId
        : entry.kind === 'default' && entry.value.kind === 'variableRef' ? entry.value.referenceId : undefined;
      if (id) references.set(id, test.variables.find(variable => variable.kind === 'plain' && variable.name === id)?.value ?? null);
    });
    context?.evidenceReferences?.forEach(reference => {
      evidence.set(reference.id, { id: reference.id, revision: reference.revision, hash: reference.hash });
    });
  });
  const revisionInputs: AuthoringV2Response['revisionInputs'] = {
    contextDigest: await hash(contextIdentity(source)),
    globalContext: await hash(source.globalContext),
    stepContexts: await Promise.all(source.steps.map(async step => ({ stepId: step.id, hash: await hash(step.context) }))),
    nonsecretReferencedValues: await Promise.all(Array.from(references, async ([referenceId, value]) => ({ referenceId, valueHash: await hash(value) }))),
    selectedEvidenceReferences: Array.from(evidence.values()),
  };
  return clone({ ...test, ...source, revisionInputs });
}
