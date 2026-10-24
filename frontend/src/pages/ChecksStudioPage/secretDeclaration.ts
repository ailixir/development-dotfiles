import type { StudioVariable } from '@/types/studio/studioTypes';
import { isReferenceName } from '@/components/studio/references/referenceTokens';

/** One row of the Variables dialog. `secret` rows hold a reference id, never a secret value. */
export type EditableVariable = {
  id: string;
  name: string;
  type: 'plain' | 'secret';
  value?: string;
  secretId?: string;
};

/** What inserting a `<secret ID>` does to the declarations: the rows to keep, or a refusal. */
export type SecretDeclaration =
  | { readonly ok: true; readonly rows: EditableVariable[] }
  | { readonly ok: false; readonly reason: 'nameTaken' };

/**
 * Makes sure the test declares the `<secret ID>` the author just inserted (STUDIO-OBS-008 AC-5(b),
 * ruling D-8; tech gate L5b F-L5b-4, corrected by W5-2, ruling `w5-unreadable-and-alias.md` §4).
 *
 * A `<secret ID>` token resolves only against a `secretRef` whose `secretId` is ID (`openapi.yaml`
 * `validateTestVariables`: "A `secretRef` declaration matches by its `secretId`"). The row's `name` is
 * an opaque alias for that match. But the backend refuses, at start, any `secretRef` whose `secretId`
 * equals the **name** of another declaration that is not a `secretRef` with that same `secretId`
 * (`IncrementalAuthoringIdentity.java:83-90`, `422 INVALID_CONTRACT` / `AUTHORING_REFERENCE_AMBIGUOUS`).
 * So an alias row (`ID_2` pointing at ID) beside a row named ID is a set that never starts. The insert
 * is therefore refused, and the author renames the other row in Variables:
 *  0. any row named ID that is not a secret row with `secretId` ID or none yet: **refused**, and
 *     nothing is inserted (no token, no row). This also catches an already ambiguous set, which the
 *     backend refuses for the whole test anyway;
 *  1. a secret row whose `secretId` is ID already declares it: nothing changes;
 *  2. a secret row named ID with no secret chosen yet is the author's own incomplete declaration: it
 *     is completed with `secretId` = ID;
 *  3. no row is named ID: a `secretRef` row named ID with `secretId` = ID is added.
 * Every row this writes carries a non-empty `secretId`, so D-8's invariant holds.
 */
export function declareInsertedSecret(rows: readonly EditableVariable[], secretId: string): SecretDeclaration {
  const taken = rows.some(
    (row) =>
      row.name.trim() === secretId &&
      !(row.type === 'secret' && ((row.secretId ?? '').trim() === '' || row.secretId === secretId)),
  );
  if (taken) {
    return { ok: false, reason: 'nameTaken' };
  }
  if (rows.some((row) => row.type === 'secret' && row.secretId === secretId)) {
    return { ok: true, rows: [...rows] };
  }
  const incomplete = rows.findIndex(
    (row) => row.type === 'secret' && row.name.trim() === secretId && (row.secretId ?? '').trim() === '',
  );
  if (incomplete >= 0) {
    return { ok: true, rows: rows.map((row, index) => (index === incomplete ? { ...row, secretId } : row)) };
  }
  return { ok: true, rows: [...rows, { id: `ref_${secretId}`, name: secretId, type: 'secret', secretId }] };
}

/**
 * The contract's typed variables. A `secretRef` carries its reference only.
 *
 * Ruling D-8: a `secretRef` always carries the Vault name it points at, and no write sends
 * `secretId` as null, empty or the alias. A secret row the author has not pointed at a secret yet
 * stays visible in the Variables dialog, incomplete, and is not sent until a secret is chosen.
 */
export function toContractVariables(rows: EditableVariable[]): StudioVariable[] {
  return rows
    .filter((row) => row.name.trim() !== '')
    .filter((row) => row.type !== 'secret' || (row.secretId ?? '').trim() !== '')
    .map((row) =>
      row.type === 'secret'
        ? { name: row.name.trim(), kind: 'secretRef', secretId: (row.secretId ?? '').trim() }
        : { name: row.name.trim(), kind: 'plain', value: row.value ?? '' },
    );
}

export type VariableDeclarationIssue = 'invalidSecretId' | 'duplicateName' | 'secretNameCollision';

/** Checks the exact normalized declarations that Save will submit; editing-only rows stay omitted. */
export function variableDeclarationIssue(variables: readonly StudioVariable[]): VariableDeclarationIssue | null {
  const names = new Map<string, StudioVariable>();
  const secretIds = new Set<string>();
  for (const variable of variables) {
    if (variable.kind === 'secretRef') {
      if (typeof variable.secretId !== 'string' || !isReferenceName(variable.secretId)) return 'invalidSecretId';
      secretIds.add(variable.secretId);
    }
    if (names.has(variable.name)) return 'duplicateName';
    names.set(variable.name, variable);
  }
  for (const secretId of secretIds) {
    const named = names.get(secretId);
    if (named && (named.kind !== 'secretRef' || named.secretId !== secretId)) return 'secretNameCollision';
  }
  return null;
}
