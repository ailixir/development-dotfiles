import { useAppSelector } from '@/store';
import { selectIsFeatureEnabled, selectFeaturesFetched } from '@/store/slices/featuresSlice';
import { selectIsSourceEnabled, selectSourcesFetched } from '@/store/slices/sourcesSlice';

/**
 * 'pending' until both the sources and the features have been fetched (a failed fetch also counts as
 * fetched), then 'on' or 'off'.
 */
export type UiTestAvailability = 'pending' | 'on' | 'off';

/**
 * Whether UI tests are available (DC-18). 'on' iff the UI_TEST source and the STUDIO feature are both
 * enabled; fail-open, so a missing entry or an empty list counts as enabled. Every switch-off consumer
 * (Create Check's type card, the editor gate, the Dashboard and palette entries) reads this one value.
 */
export function useUiTestAvailability(): UiTestAvailability {
  const sourcesFetched = useAppSelector(selectSourcesFetched);
  const featuresFetched = useAppSelector(selectFeaturesFetched);
  const sourceEnabled = useAppSelector(selectIsSourceEnabled('UI_TEST'));
  const studioEnabled = useAppSelector(selectIsFeatureEnabled('STUDIO'));

  if (!sourcesFetched || !featuresFetched) return 'pending';
  return sourceEnabled && studioEnabled ? 'on' : 'off';
}
