import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { seedInferenceMock } from '@/services/mocks/studio/inferenceHandlers';
import { MOCK_READABLE_CSIS } from '@/services/mocks/studio/fixtures';
import { studioInferenceApi } from '@/services/api/studioInferenceApi';
import studioApi from '@/services/api/studioApi';
import { defaultConfiguration } from '@/types/studio/studioTypes';
import type { InferenceView } from '@/types/studio/inferenceTypes';
import { InferenceStudio } from './InferenceStudio';

vi.setConfig({ testTimeout: 15000 });
const scopeLabel = 'Each step depends only on its own wording, earlier steps, and declared inputs.';
let baseline: InferenceView;
beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => studioMockServer.close());
afterEach(() => { studioMockServer.resetHandlers(); resetStudioMocks(); vi.restoreAllMocks(); });
beforeEach(async () => {
  baseline = await studioInferenceApi.create({name:'Inference test',csiId:MOCK_READABLE_CSIS[0],environment:'development',
    steps:[{id:null,text:'Open form'},{id:null,text:'Fill name'},{id:null,text:'Check result'}],
    scope:{policyVersion:'1.0.0',declaration:'STEP_SCOPED'},configuration:defaultConfiguration(),variables:[],description:'Keep description'});
  await studioInferenceApi.compile(baseline.test.id,{mode:'FULL',sourceRevision:baseline.test.sourceRevision,
    configurationRevision:baseline.test.configurationRevision,authoringHash:baseline.authoringHash!});
  baseline = await studioInferenceApi.get(baseline.test.id);
  const attempt=baseline.compileAttempt!;
  baseline=await studioInferenceApi.confirm(baseline.test.id,{compileRequestId:attempt.compileRequestId,revisionId:attempt.revisionId!,
    artifactHash:attempt.artifactHash!,sourceRevision:attempt.sourceRevision,configurationRevision:attempt.configurationRevision,authoringHash:baseline.authoringHash!});
  baseline.test.lastRunStatus='PASSED'; baseline.test.lastRunAt='2026-09-16T12:00:00Z';
  seedInferenceMock(baseline);
});
async function click(element: Element) { await act(async()=>{ await userEvent.click(element); }); }
async function open() {
  render(<InferenceStudio/>);
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'Open test'})).toBeEnabled());
  await click(screen.getByRole('combobox',{name:'Open test'}));
  await click(await screen.findByRole('option',{name:'Inference test'}));
  await waitFor(()=>expect(screen.getByRole('textbox',{name:'Step 3'})).toHaveValue('Check result'));
}
async function edit(index:number, scoped=true) {
  fireEvent.change(screen.getByRole('textbox',{name:`Step ${index}`}),{target:{value:'Check changed result'}});
  expect(screen.getByRole('checkbox',{name:scopeLabel})).not.toBeChecked();
  if(scoped) await click(screen.getByRole('checkbox',{name:scopeLabel}));
  await click(screen.getByRole('button',{name:'Save steps'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Compile changes'})).toBeEnabled());
}
async function compile(full=false) {
  await click(screen.getByRole('button',{name:full?'Rebuild all steps':'Compile changes'}));
  await waitFor(()=>expect(screen.getByRole('checkbox',{name:'I reviewed these actions.'})).toBeEnabled());
}
describe('versioned inference authoring',()=>{
  it('retains step IDs, reaffirms each edit, confirms all six fields and executes only on explicit Run',async()=>{
    const execute=vi.spyOn(studioApi,'executeTest'); const confirm=vi.spyOn(studioInferenceApi,'confirm');
    await open(); await edit(3);
    const saved=await studioInferenceApi.get(baseline.test.id);
    expect(saved.authoring?.steps.map(step=>step.id)).toEqual(baseline.authoring?.steps.map(step=>step.id));
    expect(saved.test.description).toBe('Keep description'); expect(saved.test.configuration).toEqual(baseline.test.configuration);
    await compile();
    expect(screen.getByText('Step 1: Reused')).toBeInTheDocument();
    expect(screen.getByText('Step 3: Recompiled')).toBeInTheDocument();
    expect(screen.getByText('Code changes')).toBeInTheDocument();
    expect(screen.getByText('Not run for this revision')).toBeInTheDocument();
    expect(screen.getByText(/Previous result: PASSED/)).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    await click(screen.getByRole('checkbox',{name:'I reviewed these actions.'}));
    await click(screen.getByRole('button',{name:'Confirm these actions'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeEnabled());
    const candidate=(await studioInferenceApi.get(baseline.test.id)).compileAttempt!;
    expect(confirm).toHaveBeenCalledWith(baseline.test.id,{compileRequestId:candidate.compileRequestId,revisionId:candidate.revisionId,
      artifactHash:candidate.artifactHash,sourceRevision:candidate.sourceRevision,configurationRevision:candidate.configurationRevision,authoringHash:saved.authoringHash});
    expect(execute).not.toHaveBeenCalled();
    await click(screen.getByRole('button',{name:'Run all 3 steps'}));
    await waitFor(()=>expect(execute).toHaveBeenCalledTimes(1));
    await screen.findByText('This revision: PENDING');
  });
  it('regenerates the middle suffix and preserves only the earlier step',async()=>{
    await open(); await edit(2); await compile();
    expect(screen.getByText('Step 1: Reused')).toBeInTheDocument();
    expect(screen.getByText('Step 2: Recompiled')).toBeInTheDocument();
    expect(screen.getByText('Step 3: Recompiled')).toBeInTheDocument();
  });
  it('unknown/global scope rebuilds fully and never runs the historical revision',async()=>{
    await open(); await edit(2,false); await compile();
    expect(screen.queryByText(/Step \d: Reused/)).not.toBeInTheDocument();
    expect(screen.getByText('All steps rebuilt because step dependencies are unknown.')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeDisabled();
  });
  it('explicit full rebuild overrides eligible incremental work',async()=>{
    const request=vi.spyOn(studioInferenceApi,'compile');
    await open(); await edit(3); await compile(true);
    expect(request.mock.calls[0][1].mode).toBe('FULL');
    expect(screen.queryByText(/Step \d: Reused/)).not.toBeInTheDocument();
  });
  it('scope-only edits invalidate confirmation; a no-op save preserves it',async()=>{
    await open(); await click(screen.getByRole('button',{name:'Save steps'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeEnabled());
    expect((await studioInferenceApi.get(baseline.test.id)).test.confirmedRevisionId).toBe(baseline.test.confirmedRevisionId);
    await click(screen.getByRole('checkbox',{name:scopeLabel}));
    await click(screen.getByRole('button',{name:'Save steps'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Compile changes'})).toBeEnabled());
    expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeDisabled();
    expect((await studioInferenceApi.get(baseline.test.id)).test.sourceRevision).toBe(baseline.test.sourceRevision+1);
  });
  it('reloads stale confirmation and clears acknowledgement',async()=>{
    await open(); await edit(3); await compile();
    studioMockServer.use(http.post('*/api/v2/studio/tests/:id/confirm-compile',()=>HttpResponse.json({code:'STALE_CANDIDATE'},{status:409})));
    await click(screen.getByRole('checkbox',{name:'I reviewed these actions.'}));
    await click(screen.getByRole('button',{name:'Confirm these actions'}));
    await screen.findByText('The test changed. Review the reloaded steps and actions before confirming again.');
    expect(screen.getByRole('checkbox',{name:'I reviewed these actions.'})).not.toBeChecked();
    expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeDisabled();
  });
  it('allocates a new ID for insert without changing existing identities',async()=>{
    await open(); await click(screen.getByRole('button',{name:'Add step'}));
    fireEvent.change(screen.getByRole('textbox',{name:'Step 4'}),{target:{value:'Check final state'}});
    await click(screen.getByRole('button',{name:'Save steps'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Compile changes'})).toBeEnabled());
    const saved=await studioInferenceApi.get(baseline.test.id);
    expect(saved.authoring?.steps.slice(0,3).map(step=>step.id)).toEqual(baseline.authoring?.steps.map(step=>step.id));
    expect(saved.authoring?.steps[3].id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('config-only edits reuse code but require new confirmation and full execution',async()=>{
    await open(); fireEvent.change(screen.getByRole('textbox',{name:'Environment'}),{target:{value:'staging'}});
    await click(screen.getByRole('button',{name:'Save steps'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Compile changes'})).toBeEnabled());
    await compile(); expect(screen.getByText(/Reused all code/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeDisabled();
  });
  it('unsupported output cannot expose a partial candidate or run',async()=>{
    await open(); await edit(3);
    studioMockServer.use(http.post('*/api/v2/studio/tests/:id/compile',()=>{
      const failed=structuredClone(baseline); failed.test.compileStatus='NEEDS_REVISION';failed.test.currentCandidateArtifact=null;
      failed.test.compileDiagnostics={validatorSchemaVersion:'1.0.0',artifact:[],steps:[{stepIndex:2,ok:false,truncated:false,diagnostics:[{code:'UNSUPPORTED_INTENT',stepIndex:2,node:null,excerpt:null,message:'This step requires clarification.'}]}],truncated:false,attempts:1,exhausted:false};
      seedInferenceMock(failed);return HttpResponse.json({compileStatus:'COMPILING'},{status:202});
    }));
    await click(screen.getByRole('button',{name:'Compile changes'}));
    await screen.findByText(/This step requires clarification/);
    expect(screen.getByRole('button',{name:'Confirm these actions'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Run all 3 steps'})).toBeDisabled();
    await click(screen.getByRole('button',{name:'Edit step 3'}));
    expect(screen.getByRole('textbox',{name:'Step 3'})).toHaveFocus();
  });
  it('missing passing evidence falls back to a full rebuild',async()=>{
    resetStudioMocks(); baseline.test.lastRunStatus=null;seedInferenceMock(baseline);
    await open(); await edit(3); await compile();
    expect(screen.queryByText(/Step \d: Reused/)).not.toBeInTheDocument();
  });
  it('identical regenerated code is labeled regenerated and never a reused step',async()=>{
    await open(); await compile(true);
    expect(screen.getAllByText('Code is identical; this step was regenerated. Review the updated wording.')).toHaveLength(3);
    expect(screen.getByText('Step 3: Recompiled')).toBeInTheDocument();
    expect(screen.queryByText(/Step \d: Reused/)).not.toBeInTheDocument();
  });
  it('reordering retains identity and clears scope',async()=>{
    await open(); await click(screen.getByRole('button',{name:'Move step 3 up'}));
    expect(screen.getByRole('checkbox',{name:scopeLabel})).not.toBeChecked();
    await click(screen.getByRole('button',{name:'Save steps'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Compile changes'})).toBeEnabled());
    const ids=(await studioInferenceApi.get(baseline.test.id)).authoring!.steps.map(step=>step.id);
    expect(ids).toEqual([baseline.authoring!.steps[0].id,baseline.authoring!.steps[2].id,baseline.authoring!.steps[1].id]);
  });

  it('retries accepted execution status without starting another browser',async()=>{
    const execute=vi.spyOn(studioApi,'executeTest');
    vi.spyOn(studioApi,'getExecution').mockRejectedValueOnce(new Error('Status unavailable'));
    await open(); await click(screen.getByRole('button',{name:'Run all 3 steps'}));
    await screen.findByText('The request could not complete. Your edits are kept; retry or reload the test.');
    await click(screen.getByRole('button',{name:'Run all 3 steps'}));
    await screen.findByText('This revision: PENDING');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('cannot confirm a response whose candidate identity disagrees with its attempt',async()=>{
    baseline.test.compileStatus='AWAITING_CONFIRMATION';baseline.test.currentCandidateArtifactHash='f'.repeat(64);seedInferenceMock(baseline);
    await open();
    expect(screen.getByText('Candidate details are incomplete or changed. Reload the test before reviewing it.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox',{name:'I reviewed these actions.'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Confirm these actions'})).toBeDisabled();
  });

});
