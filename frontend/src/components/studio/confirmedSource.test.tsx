import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CodeTab, { ConfirmedSource, CODE_VIEW_UNAVAILABLE_TITLE } from './CodeTab';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { mockTests } from '@/services/mocks/studio/fixtures';
import studioApi from '@/services/api/studioApi';
import { studioInferenceApi } from '@/services/api/studioInferenceApi';
import { defaultConfiguration } from '@/types/studio/studioTypes';

beforeAll(()=>studioMockServer.listen({onUnhandledRequest:'error'}));
afterAll(()=>studioMockServer.close());
afterEach(()=>{studioMockServer.resetHandlers();resetStudioMocks();});
describe('readable confirmed revision source',()=>{
  it('renders the confirmed artifact when candidate and draft both disagree',()=>{
    const test={...mockTests[0],compileStatus:'NEEDS_REVISION' as const,steps:['unconfirmed draft text'],
      currentCandidateRevisionId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',currentCandidateArtifactHash:'e'.repeat(64),
      currentCandidateArtifact:{version:1,steps:[{stepIndex:0,originalText:'unconfirmed candidate',code:'await page.goto("https://candidate.invalid");'}]}};
    render(<ConfirmedSource test={test}/>);
    expect(screen.getByText("await page.goto('https://www.citi.com');")).toBeInTheDocument();
    expect(screen.getByText(/Previously confirmed source/)).toBeInTheDocument();
    expect(screen.queryByText(/candidate.invalid/)).not.toBeInTheDocument();
    expect(screen.queryByText('unconfirmed draft text')).not.toBeInTheDocument();
  });
  it('does not substitute candidate source when the confirmed pair is missing',()=>{
    render(<ConfirmedSource test={{...mockTests[0],confirmedRevisionArtifact:null,
      currentCandidateArtifact:{version:1,steps:[{stepIndex:0,originalText:'candidate only',code:'await page.goto("https://candidate.invalid");'}]}}}/>);
    expect(screen.getByRole('note',{name:CODE_VIEW_UNAVAILABLE_TITLE})).toBeInTheDocument();
    expect(screen.queryByText(/candidate.invalid/)).not.toBeInTheDocument();
  });
  it('loads the detail projection and never exposes confirmed source in list summaries',async()=>{
    const list=await studioApi.listTests();
    expect(list.data.every(test=>test.confirmedRevisionArtifact===null&&test.confirmedRevisionArtifactHash===null)).toBe(true);
    render(<CodeTab testId={mockTests[1].id}/>);
    await screen.findByText("await page.goto('https://www.citi.com/previous-statements');");
    expect(screen.queryByText('Go to "https://www.citi.com/statements"')).not.toBeInTheDocument();
  });
  it('confirmation advances the pair together and later edits preserve it independently',async()=>{
    let view=await studioInferenceApi.create({name:'Confirmed pair flow',csiId:'60406',environment:'Staging',steps:[{id:null,text:'Check title'}],variables:[],configuration:defaultConfiguration(),scope:{policyVersion:'1.0.0',declaration:'UNKNOWN'}});
    expect(view.test.confirmedRevisionArtifact??null).toBeNull();
    await studioInferenceApi.compile(view.test.id,{mode:'FULL',sourceRevision:view.test.sourceRevision,configurationRevision:view.test.configurationRevision,authoringHash:view.authoringHash!});
    view=await studioInferenceApi.get(view.test.id);const attempt=view.compileAttempt!;
    view=await studioInferenceApi.confirm(view.test.id,{compileRequestId:attempt.compileRequestId,revisionId:attempt.revisionId!,artifactHash:attempt.artifactHash!,sourceRevision:attempt.sourceRevision,configurationRevision:attempt.configurationRevision,authoringHash:view.authoringHash!});
    const confirmed=view.test.confirmedRevisionArtifact;
    expect(confirmed).toEqual(view.test.currentCandidateArtifact);
    expect(view.test.confirmedRevisionArtifactHash).toBe(attempt.artifactHash);
    const edited=await studioInferenceApi.update(view.test.id,{name:view.test.name,csiId:view.test.csiId,environment:view.test.environment,
      steps:[{id:view.authoring!.steps[0].id,text:'Different draft'}],scope:{policyVersion:'1.0.0',declaration:'UNKNOWN'},
      variables:view.test.variables,configuration:view.test.configuration,sourceRevision:view.test.sourceRevision,configurationRevision:view.test.configurationRevision});
    expect(edited.test.compileStatus).toBe('STALE');expect(edited.test.currentCandidateArtifact).toBeNull();
    expect(edited.test.confirmedRevisionArtifact).toEqual(confirmed);
    expect(edited.test.confirmedRevisionArtifactHash).toBe(attempt.artifactHash);
  });
});
