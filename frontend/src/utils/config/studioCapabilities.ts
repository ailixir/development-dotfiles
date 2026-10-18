import { useEffect, useState } from 'react';
import studioApi from '@/services/api/studioApi';
import {
  GUIDED_START_UNAVAILABLE_CODES,
  type StudioCapabilities,
} from '@/types/studio/studioGuidedTypes';

/**
 * What a component knows about one saved test's runtime capabilities (STUDIO-OBS-008 P1,
 * `GET /tests/{id}/capabilities`).
 *
 * - `unknown`: there is no persisted test id, so nothing is asked.
 * - `loading`: the answer for the current id has not arrived.
 * - `ready`: a `200` whose body has the contract's shape. `capabilities` is set only here.
 * - `unavailable`: any refusal (`400`, `401`, `403`), any other error, or a body without the shape.
 *
 * Every status other than `ready` means unavailable. Nothing is simulated or carried over from
 * another test.
 */
export type StudioCapabilitiesStatus = 'unknown' | 'loading' | 'ready' | 'unavailable';

export type StudioCapabilitiesState =
  | { status: 'unknown' | 'loading' | 'unavailable'; capabilities: null }
  | { status: 'ready'; capabilities: StudioCapabilities };

export const CAPABILITIES_UNKNOWN: StudioCapabilitiesState = Object.freeze({
  status: 'unknown',
  capabilities: null,
});

const CAPABILITIES_LOADING: StudioCapabilitiesState = Object.freeze({
  status: 'loading',
  capabilities: null,
});

const CAPABILITIES_UNAVAILABLE: StudioCapabilitiesState = Object.freeze({
  status: 'unavailable',
  capabilities: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Fail-closed shape check of a `200` body against
 * `public-ui-projections.schema.json#/definitions/StudioCapabilities`: `vaultSecrets` is a boolean,
 * and `guidedStart` is either `{available: true, context}` or `{available: false, code}` with a
 * declared code. Anything else is treated as no answer.
 */
export function isStudioCapabilities(value: unknown): value is StudioCapabilities {
  if (!isRecord(value) || typeof value.vaultSecrets !== 'boolean') return false;
  const guidedStart = value.guidedStart;
  if (!isRecord(guidedStart)) return false;
  if (guidedStart.available === true) return isRecord(guidedStart.context);
  if (guidedStart.available === false) {
    return (GUIDED_START_UNAVAILABLE_CODES as readonly unknown[]).includes(guidedStart.code);
  }
  return false;
}

/** True only for a ready answer that says a Vault provider is configured. */
export function vaultSecretsEnabled(state: StudioCapabilitiesState): boolean {
  return state.status === 'ready' && state.capabilities.vaultSecrets === true;
}

/**
 * Reads `GET /tests/{id}/capabilities` for the persisted test `testId` and keeps the answer for
 * that id only. A new id resets to `loading` before its own answer arrives, so the previous test's
 * capabilities are never shown for another test, and a late answer for an old id is dropped. A
 * failure of any kind (`401`, `403`, network) is `unavailable`, not the previous value.
 *
 * `guidedStart` is read here for display only. A guided start re-reads the capability after its
 * save (plan P6), because the start context is bound to the persisted revisions of that moment.
 */
export function useStudioCapabilities(testId: string | null): StudioCapabilitiesState {
  const [answer, setAnswer] = useState<{ testId: string; state: StudioCapabilitiesState } | null>(
    null,
  );

  useEffect(() => {
    setAnswer(null);
    if (testId === null) return undefined;
    let active = true;
    studioApi.getCapabilities(testId).then(
      (body: unknown) => {
        if (!active) return;
        setAnswer({
          testId,
          state: isStudioCapabilities(body)
            ? { status: 'ready', capabilities: body }
            : CAPABILITIES_UNAVAILABLE,
        });
      },
      () => {
        if (active) setAnswer({ testId, state: CAPABILITIES_UNAVAILABLE });
      },
    );
    return () => {
      active = false;
    };
  }, [testId]);

  if (testId === null) return CAPABILITIES_UNKNOWN;
  if (answer === null || answer.testId !== testId) return CAPABILITIES_LOADING;
  return answer.state;
}
