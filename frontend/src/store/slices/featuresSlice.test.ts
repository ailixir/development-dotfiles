import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { featuresApi, type FeaturesResponse } from '@/services/api/featuresApi';
import featuresReducer, { fetchFeatures, selectIsFeatureEnabled } from './featuresSlice';

afterEach(()=>{ vi.restoreAllMocks(); });
describe('feature response validation',()=>{
  it.each([{}, {sources:[],features:[null]}, {sources:null,features:[]}])('rejects malformed successful bodies without corrupting state: %j',async(body)=>{
    vi.spyOn(featuresApi,'getFeatures').mockResolvedValueOnce(body as unknown as FeaturesResponse);
    const store=configureStore({reducer:{features:featuresReducer}});
    const result=await store.dispatch(fetchFeatures());
    expect(fetchFeatures.rejected.match(result)).toBe(true);
    expect(store.getState().features.error).toBe('Invalid feature flags response');
    expect(selectIsFeatureEnabled('STUDIO')(store.getState())).toBe(true);
    expect(store.getState().features.features).not.toHaveLength(0);
  });
  it('retains a previously disabled flag when a later response is malformed',async()=>{
    const store=configureStore({reducer:{features:featuresReducer}});
    store.dispatch(fetchFeatures.fulfilled({sources:[],features:[{key:'STUDIO',enabled:false,label:'Studio'}]},'known'));
    vi.spyOn(featuresApi,'getFeatures').mockResolvedValueOnce({} as FeaturesResponse);
    await store.dispatch(fetchFeatures());
    expect(selectIsFeatureEnabled('STUDIO')(store.getState())).toBe(false);
  });
});
