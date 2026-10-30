import type { Guard } from '../../src/executor/observedOperations.js';
import type { ResolveTargetRequest, ResolveTargetResult } from '../../src/run/observationTypes.js';
import { hashObserved } from '../../src/validator/observedReferencePolicy.js';

/**
 * resolveTarget of a fake replay session: READY for a frozen locator that one of the artifact's element guards names, ABSENT for any other,
 * and the closed TARGET_DRIFT refusal when `refuse` is set (the page changed since learning).
 */
export function resolveFromGuards(guards: readonly Guard[], refuse: () => boolean = () => false): (request: ResolveTargetRequest) => Promise<ResolveTargetResult> {
  const known = new Set(guards.flatMap(guard => (guard.target.kind === 'element' ? [hashObserved(guard.target.locator)] : [])));
  return request => Promise.resolve(refuse() ? { kind: 'REFUSED', code: 'TARGET_DRIFT' } : known.has(hashObserved(request.resolved.locator)) ? { kind: 'READY' } : { kind: 'ABSENT' });
}
