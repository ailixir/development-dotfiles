import { describe,it,expect } from 'vitest';
import { PrivateObservationInventory } from '../../src/run/observationInventory.js';
describe('session-private bounded masking state',()=>{
  it('retains exact values and normalized aliases across snapshots with strictest provenance',()=>{
    const store=new PrivateObservationInventory();store.merge([['on',false],['  PRIVATE\u200b\nVALUE ',true],['',true]]);
    store.merge([['on',true],['next',false]]);expect(store.snapshot()).toEqual([['on',true],['  PRIVATE\u200b\nVALUE ',true],['PRIVATE VALUE',true],['next',false]]);
    const snapshot=store.snapshot();snapshot.length=0;expect(store.snapshot()).toHaveLength(4);
  });
  it.each(['count','bytes','unicode'])('keeps earlier values and permanently refuses after %s failure',kind=>{
    const store=new PrivateObservationInventory();store.merge([['FIRST',true]]);
    const values=kind==='count'?Array.from({length:4096},(_,i)=>`value-${String(i)}`):kind==='bytes'?['é'.repeat(524288)]:['\ud800'];
    expect(()=>{ store.merge(values.map(value=>[value,true])); }).toThrow('CONTEXT_LOST');expect(()=>store.snapshot()).toThrow('CONTEXT_LOST');expect(()=>{ store.merge([['later',true]]); }).toThrow('CONTEXT_LOST');
    const state=store as unknown as {values:Map<string,boolean>;bytes:number};expect(state.values.get('FIRST')).toBe(true);store.dispose();expect(state.values.size).toBe(0);expect(state.bytes).toBe(0);
  });
  it('releases all state at teardown and rejects late copies after collection failure or disposal',()=>{
    const store=new PrivateObservationInventory();store.merge([['PRIVATE',true]]);store.fail();expect(()=>store.snapshot()).toThrow('CONTEXT_LOST');store.dispose();expect(()=>{ store.merge([['LATE',true]]); }).toThrow('CONTEXT_LOST');
    const state=store as unknown as {values:Map<string,boolean>;bytes:number};expect(state.values.size).toBe(0);expect(state.bytes).toBe(0);store.dispose();
  });
});
