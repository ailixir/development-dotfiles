import type { Action, ResolvedTarget } from '../guided/types.js';

/**
 * The one builder of the operationHash preimage (ADR-SC-007 WI-3 interfaces.GuidedOperationIdentity, invariant I-4; plan D-8):
 * {coordinate, origin, target, operation}, where target is the prepared ResolvedTarget (null for page, passwordControl, navigate,
 * url / title asserts and the secret fill). The five runner sites hash it with their own canonical helper, which agrees with the
 * Java definition on the shared vector.
 */
export interface OperationPreimage {
  readonly coordinate: { readonly stepId: string; readonly ordinal: number };
  readonly origin: string | null;
  readonly target: ResolvedTarget | null;
  readonly operation: Action['operation'];
}

export function operationPreimage(coordinate: { stepId: string; ordinal: number }, origin: string | null, target: ResolvedTarget | null, operation: Action['operation']): OperationPreimage {
  return { coordinate: { stepId: coordinate.stepId, ordinal: coordinate.ordinal }, origin, target, operation };
}
