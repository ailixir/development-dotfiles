import { describe, expect, it } from 'vitest';
import { declareInsertedSecret, type EditableVariable, type SecretDeclaration } from './secretDeclaration';

/**
 * Tech gate L5b F-L5b-4 (L5b-F2), corrected by W5-2 (unfreeze unit U1, ruling
 * `w5-unreadable-and-alias.md` section 4): inserting `<secret ID>` must leave the test declaring a
 * `secretRef` whose `secretId` is ID and whose name is not shared with a different declaration, and
 * never a secret row with a null or empty `secretId` (ruling D-8). When a row named ID declares
 * something else, the insert is refused: the backend refuses such a set at start
 * (`IncrementalAuthoringIdentity.java:83-90`), so an alias row (`ID_2`) would only move the failure.
 */

const plain = (name: string, value = 'v'): EditableVariable => ({ id: `p_${name}`, name, type: 'plain', value });
const secret = (name: string, secretId?: string): EditableVariable => ({ id: `s_${name}`, name, type: 'secret', secretId });

const declaresId = (rows: readonly EditableVariable[], id: string) =>
  rows.filter((row) => row.type === 'secret' && row.secretId === id);

/** The rows of an accepted declaration; fails the test if the insert was refused. */
function accepted(outcome: SecretDeclaration): EditableVariable[] {
  if (!outcome.ok) throw new Error(`expected the insert to be accepted, it was refused: ${outcome.reason}`);
  return [...outcome.rows];
}

describe('declareInsertedSecret', () => {
  it('1. already declared by secretId (under any name): unchanged', () => {
    const rows = [plain('USER_ID'), secret('LOGIN', 'API_TOKEN')];
    expect(accepted(declareInsertedSecret(rows, 'API_TOKEN'))).toEqual(rows);
  });

  it('2. the author\'s incomplete secret row of that name is completed, not duplicated', () => {
    const rows = [secret('API_TOKEN')];
    const next = accepted(declareInsertedSecret(rows, 'API_TOKEN'));
    expect(next).toEqual([{ ...rows[0], secretId: 'API_TOKEN' }]);
  });

  it('3. no row of that name: a secretRef named ID with secretId ID is added', () => {
    const next = accepted(declareInsertedSecret([plain('USER_ID')], 'API_TOKEN'));
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ name: 'API_TOKEN', type: 'secret', secretId: 'API_TOKEN' });
  });

  it('refused: a PLAIN row has the name, so nothing is declared and no alias is made (W5-2)', () => {
    const rows = [plain('USER_ID', 'pilot-user')];
    expect(declareInsertedSecret(rows, 'USER_ID')).toEqual({ ok: false, reason: 'nameTaken' });
  });

  it('refused: a secret row of that name points at ANOTHER Vault name (W5-2)', () => {
    const rows = [secret('API_TOKEN', 'OTHER'), plain('API_TOKEN_2')];
    expect(declareInsertedSecret(rows, 'API_TOKEN')).toEqual({ ok: false, reason: 'nameTaken' });
  });

  it('refused: an already ambiguous set (a plain USER_ID beside LOGIN pointing at USER_ID) is not made worse (W5-2)', () => {
    const rows = [plain('USER_ID'), secret('LOGIN', 'USER_ID')];
    expect(declareInsertedSecret(rows, 'USER_ID')).toEqual({ ok: false, reason: 'nameTaken' });
  });

  it('a refusal returns no rows at all, so the caller cannot write an alias by accident', () => {
    const outcome = declareInsertedSecret([plain('USER_ID')], 'USER_ID');
    expect(outcome.ok).toBe(false);
    expect(outcome).not.toHaveProperty('rows');
  });

  it('parity with the backend identity resolver (Dex probe logs/probe-backend-ambiguity.log)', () => {
    // rule3 ACCEPTED
    expect(declareInsertedSecret([], 'USER_ID').ok).toBe(true);
    // rule1 ACCEPTED, unchanged
    const rule1 = [plain('PW'), secret('LOGIN', 'USER_ID')];
    expect(declareInsertedSecret(rule1, 'USER_ID')).toEqual({ ok: true, rows: rule1 });
    // 4a REFUSED
    expect(declareInsertedSecret([plain('USER_ID')], 'USER_ID').ok).toBe(false);
    // 4b REFUSED
    expect(declareInsertedSecret([secret('API_TOKEN', 'OTHER')], 'API_TOKEN').ok).toBe(false);
  });

  it('D-8: whenever the insert is accepted, exactly one secret row declares the ID, and it carries that non-empty secretId', () => {
    const acceptedSets = [[], [secret('X')], [secret('Z', 'X')], [plain('Y')], [secret('Z', 'X'), plain('Y')]];
    for (const rows of acceptedSets) {
      const declaring = declaresId(accepted(declareInsertedSecret(rows, 'X')), 'X');
      expect(declaring).toHaveLength(1);
      expect(declaring[0].secretId).toBe('X');
    }
    for (const rows of [[plain('X')], [secret('X', 'Y')]]) {
      expect(declareInsertedSecret(rows, 'X').ok).toBe(false);
    }
  });

  it('a name that differs only by surrounding spaces still counts as taken, as the page trims names before it saves', () => {
    expect(declareInsertedSecret([plain('  USER_ID ')], 'USER_ID').ok).toBe(false);
  });
});
