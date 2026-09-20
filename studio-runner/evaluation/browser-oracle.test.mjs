/* global structuredClone */
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import assert from 'node:assert/strict';
// eslint-disable-next-line no-restricted-imports -- Evaluation-only fixed app and oracle, never shipped or model-controlled.
import { chromium } from 'playwright';
import { validateArtifact } from '../dist/validator/index.js';
import { executeSteps, createValueResolver } from '../dist/executor/executor.js';
import { createPlaywrightAdapter } from '../dist/run/playwrightAdapter.js';
import { evaluateOracle } from './oracle.mjs';

const cases = [
  {id:'correct-save', code:"await page.getByRole('button', { name: 'Save target', exact: true }).click();", correct:true},
  {id:'M2-wrong-account', code:"await page.getByRole('button', { name: 'Save other', exact: true }).click();", correct:false},
  {id:'M3-omitted-action', code:"await expect(page.getByText('Approved', { exact: true })).toBeVisible();", correct:false},
  {id:'M4-trial', code:"await page.getByRole('button', { name: 'Save target', exact: true }).click({ trial: true });", rejected:true},
  {id:'M1-reversed-negative', code:"await expect(page.getByText('Approved', { exact: true })).toBeVisible();", correct:false, assertion:true},
  {id:'M5-weakened-case', code:"await expect(page.getByText('Approved', { exact: true })).toContainText('approved', { ignoreCase: true });", correct:false, assertion:true},
];
for (const entry of cases) test(entry.id, async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const events=[];
    const state={saved:null};
    await page.exposeFunction('recordDomainEvent', event => {events.push(event); state.saved=event.account;});
    await page.setContent(`<main><p>Approved</p>
      <button onclick="recordDomainEvent({type:'form.saved',account:'target'})">Save target</button>
      <button onclick="recordDomainEvent({type:'form.saved',account:'other'})">Save other</button></main>`);
    const source=entry.assertion ? 'Assert Approved is absent or exact lowercase approved' : 'Save the target account';
    const verdict=validateArtifact({version:1,steps:[{stepIndex:0,originalText:source,code:entry.code}]},[source],{variables:[],secrets:[]});
    if (entry.rejected) {assert.equal(verdict.ok,false);return;}
    assert.equal(verdict.ok,true,'wrong but syntactically permitted controls must reach real execution');
    const result=await executeSteps({
      steps:verdict.steps.map(s=>({stepIndex:s.stepIndex,operations:s.operations})),
      adapter:createPlaywrightAdapter({page,defaultTimeoutMs:1000}),
      resolver:createValueResolver({},{}), reporter:{stepStarted(){ /* No timeline needed. */ },stepFinished(){ /* Outcome read from result. */ }},
      clock:{now:()=>performance.now()},
    });
    assert.equal(result.ok,true,'mutation must demonstrate an executor PASS can be semantically wrong');
    const expected={namespace:entry.id,events:entry.assertion?[]:[{type:'form.saved',account:'target'}],
      state:entry.assertion?{saved:null}:{saved:'target'},executionStatus:entry.assertion?'FAILED':'PASSED',
      assertionFailureStep:entry.assertion?0:undefined,failureKind:entry.assertion?'ASSERTION':undefined,errorCode:null,revisionId:'current',configurationRevision:1};
    const observed={namespace:entry.id,events:structuredClone(events),state:structuredClone(state),
      executionStatus:result.ok?'PASSED':'FAILED',revisionId:'current',configurationRevision:1};
    const oracle=evaluateOracle(expected,observed);
    assert.equal(oracle.correct,entry.correct);
    if (!entry.correct) assert.equal(oracle.falseSuccess,true);
  } finally {await browser.close();}
});
