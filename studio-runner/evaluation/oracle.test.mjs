/* global structuredClone */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOracle, summarize, validateManifest } from './oracle.mjs';

const expected = {
  namespace: 'isolated-trial', events: [
    { type: 'login.accepted', account: 'alice' }, { type: 'account.opened', account: 'target' },
    { type: 'form.saved', value: 'Reviewed' }], state: { saved: 'Reviewed', banner: 'Approved' },
  executionStatus: 'PASSED', revisionId: 'candidate-new', configurationRevision: 2,
};
const mutate = change => { const value = structuredClone(expected); change(value); return value; };
test('positive control accepts independently expected domain state', () => {
  assert.deepEqual(evaluateOracle(expected, structuredClone(expected)), {correct:true,falseSuccess:false,failures:[]});
});
const mutations = [
  ['M1 reversed negative assertion', v => {v.state.banner = 'Denied';}],
  ['M2 wrong account', v => {v.events[1].account = 'wrong';}],
  ['M3 omitted save', v => {v.events.pop(); v.state.saved = null;}],
  ['M4 trial action no business event', v => {v.events.pop();}],
  ['M5 case weakened', v => {v.state.saved = 'reviewed';}],
  ['M6 historical passing revision', v => {v.revisionId = 'old-confirmed';}],
  ['M7 contaminated namespace', v => {v.namespace = 'previous-trial';}],
];
for (const [name, change] of mutations) test(name, () => {
  const result = evaluateOracle(expected, mutate(change));
  assert.equal(result.correct, false);
  assert.equal(result.falseSuccess, true);
});
test('deliberate failure requires correct assertion step not an arbitrary transport failure', () => {
  const failure = {...expected, executionStatus:'FAILED', assertionFailureStep:2, failureKind:'ASSERTION', errorCode:null};
  assert.equal(evaluateOracle(failure, {...failure}).correct,true);
  assert.equal(evaluateOracle(failure, {...failure, assertionFailureStep:0}).correct,false);
});
test('incomplete and unavailable usage cannot be scored as zero cost or release pass', () => {
  const summary = summarize([{id:'a',complete:true,expectedClass:'SUPPORTED',elapsedMs:10,oracle:{correct:true,falseSuccess:false}}],['a','b','c']);
  assert.equal(summary.missingTrials,2); assert.equal(summary.releaseReady,false); assert.equal(summary.inputTokens,null);
});
test('family split leakage rejected before running', () => {
  const entry={id:'a',family:'account',split:'development',expectedClass:'SUPPORTED',source:['Save'],expected};
  assert.throws(()=>validateManifest({schemaVersion:1,cases:[entry,{...entry,id:'b',split:'held-out'}]}));
});

test('incomplete oracle identity cannot accidentally pass',()=>{
 assert.equal(evaluateOracle({events:[],state:{}},{events:[],state:{}}).correct,false);
});
test('wrong completed outcomes fail and duplicate trial identities cannot hide missing trials',()=>{
 const wrong={id:'a',complete:true,expectedClass:'SUPPORTED',elapsedMs:1,oracle:{correct:false,falseSuccess:false}};
 assert.equal(summarize([wrong],['a']).incorrectTrials,1);
 assert.throws(()=>summarize([wrong,wrong],['a','b']));
 assert.equal(summarize([],['a']).inputTokens,null);
});

test('same-step browser crash cannot count as the expected assertion failure',()=>{
 const expectedFailure={...expected,executionStatus:'FAILED',assertionFailureStep:2,failureKind:'ASSERTION',errorCode:null};
 assert.equal(evaluateOracle(expectedFailure,{...expectedFailure,failureKind:'TRANSPORT',errorCode:'BROWSER_CRASH'}).correct,false);
});

test('contradictory correctness and missing timing cannot manufacture healthy metrics',()=>{
 const trial={id:'a',complete:true,expectedClass:'SUPPORTED',elapsedMs:10,oracle:{correct:true,falseSuccess:true}};
 assert.throws(()=>summarize([trial],['a']));
 assert.throws(()=>summarize([{...trial,elapsedMs:null,oracle:{correct:true,falseSuccess:false}}],['a']));
});
