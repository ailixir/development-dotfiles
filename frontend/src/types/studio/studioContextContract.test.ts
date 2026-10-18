import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AuthoringV2Request, LiteralInput } from './studioTypes';
import {
  isAuthoringV2Request,
  validateStudioAuthoring,
  type AuthoringValidationCategory,
} from './studioAuthoringValidation';

const EXAMPLE_DIR = path.resolve(__dirname, '../../../../docs/specs/studio/examples');

interface ValidCase {
  name: string;
  request?: unknown;
  transition?: Record<string, unknown>;
}

interface InvalidCase {
  name: string;
  request: unknown;
  expectedCategories: AuthoringValidationCategory[];
}

const validCases = (
  JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, 'context-authoring-valid.json'), 'utf8')) as {
    cases: ValidCase[];
  }
).cases;
const invalidCases = (
  JSON.parse(fs.readFileSync(path.join(EXAMPLE_DIR, 'context-authoring-invalid.json'), 'utf8')) as {
    cases: InvalidCase[];
  }
).cases;

function validCase(name: string): ValidCase {
  const fixture = validCases.find((candidate) => candidate.name === name);
  if (!fixture) throw new Error(`Missing shared fixture ${name}`);
  return fixture;
}

describe('Story 10.36 shared authoring contract fixtures', () => {
  it('enumerates the required valid and invalid corpus', () => {
    expect(validCases.map(({ name }) => name)).toEqual([
      'global-and-step-context',
      'reorder-retains-identities',
      'copy-creates-fresh-identity',
      'delete-removes-only-deleted-metadata',
      'exact-literals',
      'login-then-protected-navigation',
    ]);
    expect(invalidCases.map(({ name }) => name)).toEqual([
      'missing-step-id',
      'duplicate-step-id',
      'orphan-evidence-step-id',
      'unsupported-v2-field',
      'secret-reference-in-global-context',
      'secret-reference-as-contextual-default',
      'author-claims-observed-provenance',
      'step-local-evidence-owned-by-different-existing-step',
    ]);
  });

  it.each(validCases.filter(({ request }) => request !== undefined))(
    'accepts valid fixture $name',
    ({ request }) => {
      expect(validateStudioAuthoring(request)).toEqual([]);
      expect(isAuthoringV2Request(request)).toBe(true);
    },
  );

  it.each(invalidCases)('rejects invalid fixture $name with its declared category', (fixture) => {
    const categories = validateStudioAuthoring(fixture.request).map(({ category }) => category);
    for (const expected of fixture.expectedCategories) expect(categories).toContain(expected);
    expect(isAuthoringV2Request(fixture.request)).toBe(false);
  });

  it('refuses string steps and a missing schema version as an invalid shape, never as another generation', () => {
    const IDS = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    const strings = validateStudioAuthoring({ authoringSchemaVersion: 2, steps: ['one', 'two'] });
    expect(strings.map(({ category }) => category)).toEqual(['INVALID_SHAPE', 'INVALID_SHAPE']);
    expect(validateStudioAuthoring({ steps: ['one'] })).toContainEqual({ category: 'INVALID_SHAPE', path: '$' });
    expect(
      validateStudioAuthoring({
        authoringSchemaVersion: 2,
        steps: ['one', { id: IDS[0], text: 'two' }],
      }),
    ).toContainEqual({ category: 'INVALID_SHAPE', path: '$.steps[0]' });
    expect(isAuthoringV2Request({ authoringSchemaVersion: 2, steps: [{ id: IDS[0], text: ' x ' }] })).toBe(true);
    expect(isAuthoringV2Request({ steps: [{ id: IDS[0], text: ' x ' }] })).toBe(false);
  });

  it('preserves empty, Unicode, quoted, backslash, newline and surrounding-space literals', () => {
    const request = validCase('exact-literals').request as AuthoringV2Request;
    const roundTripped = JSON.parse(JSON.stringify(request)) as AuthoringV2Request;
    const literals = roundTripped.steps.flatMap((step) =>
      (step.context?.entries ?? []).filter((entry): entry is LiteralInput => entry.kind === 'literal'),
    );

    expect(literals.map(({ value }) => value)).toEqual([
      '',
      '  Café 東京 "quoted" C:\\tmp\\file\nsecond line !@#$%^&*()  ',
    ]);
  });

  it('encodes identity transitions independently of array position', () => {
    const reorder = validCase('reorder-retains-identities');
    const copy = validCase('copy-creates-fresh-identity');
    const deletion = validCase('delete-removes-only-deleted-metadata');

    expect(reorder.transition?.afterStepIds).toEqual(
      (reorder.request as AuthoringV2Request).steps.map(({ id }) => id),
    );
    expect(copy.transition?.sourceStepId).not.toBe(copy.transition?.copiedStepId);
    expect((deletion.request as AuthoringV2Request).steps.map(({ id }) => id)).toEqual(
      deletion.transition?.retainedStepIds,
    );
    expect((deletion.request as AuthoringV2Request).steps.map(({ id }) => id)).not.toContain(
      deletion.transition?.deletedStepId,
    );
  });

  it('keeps author-submitted evidence supplied while server-held provenance can represent observed', () => {
    const accepted = validCase('global-and-step-context').request as AuthoringV2Request;
    expect(accepted.globalContext?.evidenceReferences?.map(({ source }) => source)).toEqual([
      'supplied',
    ]);

    const falseClaim = invalidCases.find(
      ({ name }) => name === 'author-claims-observed-provenance',
    );
    expect(validateStudioAuthoring(falseClaim?.request)).toContainEqual({
      category: 'FALSE_OBSERVED_PROVENANCE',
      path: '$.steps[0].context.evidenceReferences[0].source',
    });
  });

  it('rejects cross-step local evidence while allowing global evidence to name any existing step', () => {
    const fixture = invalidCases.find(
      ({ name }) => name === 'step-local-evidence-owned-by-different-existing-step',
    );
    if (!fixture) throw new Error('Missing shared cross-step evidence fixture');

    expect(validateStudioAuthoring(fixture.request)).toContainEqual({
      category: 'ORPHAN_STEP_ID',
      path: '$.steps[0].context.evidenceReferences[0].stepId',
    });

    const globallyScoped = structuredClone(fixture.request) as AuthoringV2Request;
    const evidenceReferences = globallyScoped.steps[0].context?.evidenceReferences;
    globallyScoped.steps[0].context = {};
    globallyScoped.globalContext = { evidenceReferences };

    expect(validateStudioAuthoring(globallyScoped)).toEqual([]);
  });

  it('keeps stable identities, opaque credentials and state-specific evidence across login navigation', () => {
    const request = validCase('login-then-protected-navigation').request as AuthoringV2Request;
    const stepIds = request.steps.map(({ id }) => id);

    expect(stepIds).toEqual([
      '00000000-0000-4000-8000-000000000070',
      '00000000-0000-4000-8000-000000000071',
      '00000000-0000-4000-8000-000000000072',
      '00000000-0000-4000-8000-000000000073',
      '00000000-0000-4000-8000-000000000074',
      '00000000-0000-4000-8000-000000000075',
    ]);
    expect(new Set(stepIds).size).toBe(stepIds.length);

    const passwordStep = request.steps.find(({ id }) => id.endsWith('71'));
    const passwordReferences = (passwordStep?.context?.entries ?? []).filter(
      (entry) => entry.kind === 'secretRef',
    );
    expect(passwordReferences).toEqual([
      { kind: 'secretRef', referenceId: 'vault://studio/protected-page-password' },
    ]);
    expect(passwordReferences.every((reference) => !('value' in reference))).toBe(true);
    expect(passwordStep?.context?.entries?.some((entry) => entry.kind === 'literal')).toBe(false);

    const evidenceBindings = request.steps.flatMap((step) =>
      (step.context?.evidenceReferences ?? []).map((evidence) => {
        expect(evidence.stepId).toBe(step.id);
        expect(evidence.source).toBe('supplied');
        return { stepId: evidence.stepId, route: evidence.route, state: evidence.state };
      }),
    );
    expect(evidenceBindings).toEqual([
      { stepId: stepIds[0], route: '/login', state: 'anonymous-login' },
      { stepId: stepIds[1], route: '/login', state: 'anonymous-login' },
      { stepId: stepIds[2], route: '/login', state: 'credentials-entered' },
      { stepId: stepIds[3], route: '/home', state: 'authenticated-home' },
      { stepId: stepIds[4], route: '/home', state: 'authenticated-home' },
      {
        stepId: stepIds[5],
        route: '/reports/protected',
        state: 'authenticated-protected',
      },
    ]);
  });
});
