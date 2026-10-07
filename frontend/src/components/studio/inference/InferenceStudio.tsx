import { useEffect, useRef, useState } from 'react';
import { VideoEvidencePanel } from '../evidence/VideoEvidencePanel';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import studioApi from '@/services/api/studioApi';
import { studioInferenceApi } from '@/services/api/studioInferenceApi';
import { defaultConfiguration, isTerminalExecutionStatus } from '@/types/studio/studioTypes';
import type { ExecutionSnapshot, SourceArtifact, TestDto } from '@/types/studio/studioTypes';
import type { AuthoringStep, InferenceView, InferenceWrite } from '@/types/studio/inferenceTypes';

const fullRebuildReasons: Record<string, string> = {
  EXPLICIT_FULL: 'All steps rebuilt at your request.',
  INCREMENTAL_DISABLED: 'Code reuse is unavailable in this environment.',
  NO_ELIGIBLE_BASELINE: 'No previous passing revision is eligible for code reuse.',
  LEGACY_MAPPING: 'The earlier test does not have reusable step identities.',
  STRUCTURAL_CHANGE: 'Step order or identities changed, so all steps were rebuilt.',
  FINGERPRINT_CHANGE: 'Compilation settings changed, so all steps were rebuilt.',
  SCOPE_UNKNOWN: 'All steps rebuilt because step dependencies are unknown.',
  GLOBAL_OR_FORWARD_SCOPE: 'A step changes the meaning of earlier steps or the whole test.',
  ALL_STEPS_AFFECTED: 'The edit affects all steps.',
};

export function InferenceStudio() {
  const [tests, setTests] = useState<TestDto[]>([]);
  const [view, setView] = useState<InferenceView | null>(null);
  const [steps, setSteps] = useState<AuthoringStep[]>([{ id: null, text: '' }]);
  const [name, setName] = useState('');
  const [csi, setCsi] = useState('');
  const [environment, setEnvironment] = useState('development');
  const [scoped, setScoped] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<ExecutionSnapshot | null>(null);
  const previous = useRef<{ revision: string; artifact: SourceArtifact; stepIds: (string | null)[] } | null>(null);
  const currentId = useRef<string | null>(null);
  const executionAttempt = useRef<{revisionId:string;key:string;executionId:string|null} | null>(null);
  const compiling = view?.test.compileStatus === 'COMPILING';

  useEffect(() => { void studioApi.listTests().then(page => setTests(page.data)).catch(() => setError('Tests could not be loaded.')); }, []);
  const install = (next: InferenceView) => {
    currentId.current = next.test.id;
    setView(next); setName(next.test.name); setCsi(next.test.csiId ?? ''); setEnvironment(next.test.environment);
    setSteps(next.authoring?.steps ?? next.test.steps.map(text => ({ id: null, text })));
    setScoped(next.authoring?.scope.declaration === 'STEP_SCOPED'); setDirty(false); setAcknowledged(false);
  };
  const semanticEdit = (next: AuthoringStep[]) => { setSteps(next); setScoped(false); setDirty(true); setAcknowledged(false); setRun(null); };
  const guarded = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (failure) {
      setAcknowledged(false);
      if (typeof failure === 'object' && failure !== null && 'response' in failure && (failure.response as { status?: number } | undefined)?.status === 409 && currentId.current) {
        try { install(await studioInferenceApi.get(currentId.current)); setRun(null); }
        catch { /* Keep the prior snapshot disabled until the author reloads. */ setDirty(true); }
        setError('The test changed. Review the reloaded steps and actions before confirming again.');
      } else setError('The request could not complete. Your edits are kept; retry or reload the test.');
    }
    finally { setBusy(false); }
  };
  const load = async (id: string) => guarded(async () => {
    const next = await studioInferenceApi.get(id);
    previous.current = next.test.currentCandidateRevisionId && next.test.currentCandidateArtifact
      ? { revision: next.test.currentCandidateRevisionId, artifact: next.test.currentCandidateArtifact, stepIds: next.authoring?.steps.map(step=>step.id) ?? [] } : null;
    install(next); setRun(null);
  });

  const compilingId = compiling ? view?.test.id : null;
  useEffect(() => {
    if (!compilingId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;
    const id = compilingId;
    const poll = async () => {
      try {
        const next = await studioInferenceApi.get(id);
        if (stopped || currentId.current !== id) return;
        setView(next);
        if (next.test.compileStatus === 'COMPILING' && ++count < 150) timer = setTimeout(() => { void poll(); }, 2000);
        else if (next.test.compileStatus === 'COMPILING') setError('Compilation is still pending. Reload to check its status.');
      } catch { if (!stopped) setError('Compilation status is unavailable. Reload to check it.'); }
    };
    timer = setTimeout(() => { void poll(); }, 500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [compilingId]);

  const runningId = run && !isTerminalExecutionStatus(run.status) ? run.executionId : null;
  useEffect(() => {
    if (!runningId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;
    const id = runningId;
    const poll = async () => {
      try {
        const next = await studioApi.getExecution(id);
        if (stopped) return;
        setRun(next);
        if (isTerminalExecutionStatus(next.status) && executionAttempt.current?.executionId === next.executionId) executionAttempt.current=null;
        if (!isTerminalExecutionStatus(next.status) && ++count < 180) timer = setTimeout(() => { void poll(); }, 2000);
        else if (!isTerminalExecutionStatus(next.status)) setError('Run status is still pending. Reload to check it.');
      } catch { if (!stopped) setError('Run status is unavailable.'); }
    };
    timer = setTimeout(() => { void poll(); }, 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [runningId]);

  const save = async () => guarded(async () => {
    const body: InferenceWrite = {
      name, csiId: csi, environment, steps, scope: { policyVersion: '1.0.0', declaration: scoped ? 'STEP_SCOPED' : 'UNKNOWN' },
      description: view?.test.description ?? null, variables: view?.test.variables ?? [],
      configuration: view?.test.configuration ?? defaultConfiguration(),
      ...(view ? { sourceRevision: view.test.sourceRevision, configurationRevision: view.test.configurationRevision } : {}),
    };
    const next = view ? await studioInferenceApi.update(view.test.id, body) : await studioInferenceApi.create(body);
    install(next); setRun(null); setTests(items => [...items.filter(item => item.id !== next.test.id), next.test]);
  });
  const compile = async (mode: 'AUTO' | 'FULL') => guarded(async () => {
    if (!view?.authoringHash) return;
    if (view.test.currentCandidateRevisionId && view.test.currentCandidateArtifact) previous.current = {revision:view.test.currentCandidateRevisionId,artifact:view.test.currentCandidateArtifact,stepIds:view.authoring?.steps.map(step=>step.id) ?? []};
    await studioInferenceApi.compile(view.test.id, { mode, sourceRevision:view.test.sourceRevision, configurationRevision:view.test.configurationRevision, authoringHash:view.authoringHash });
    setView(await studioInferenceApi.get(view.test.id)); setAcknowledged(false); setRun(null);
  });
  const attempt = view?.compileAttempt;
  const confirm = async () => guarded(async () => {
    if (!view?.authoringHash || !attempt?.revisionId || !attempt.artifactHash) return;
    install(await studioInferenceApi.confirm(view.test.id, {compileRequestId:attempt.compileRequestId,
      revisionId:attempt.revisionId,artifactHash:attempt.artifactHash,sourceRevision:attempt.sourceRevision,
      configurationRevision:attempt.configurationRevision,authoringHash:view.authoringHash}));
  });
  const candidateCurrent = !!view?.test.currentCandidateArtifact && view.test.currentCandidateArtifact.steps.length === view.authoring?.steps.length && !!attempt && !!attempt.revisionId && !!attempt.artifactHash && attempt.state === 'CANDIDATE' &&
    attempt.revisionId === view?.test.currentCandidateRevisionId && attempt.artifactHash === view?.test.currentCandidateArtifactHash &&
    attempt.sourceRevision === view?.test.sourceRevision && attempt.configurationRevision === view?.test.configurationRevision && attempt.authoringHash === view?.authoringHash;
  const ready = candidateCurrent && !dirty && view?.test.compileStatus === 'READY' && view.test.confirmedRevisionId === attempt?.revisionId;
  const currentRun = ready && run?.testId === view?.test.id && run?.revisionId === attempt?.revisionId ? run : null;
  const readonly = busy || compiling;

  return <Stack spacing={2} sx={{ p: 3 }}>
    <Typography variant="h4">Checks Studio</Typography>
    {error && <Alert severity="error" role="alert">{error}</Alert>}
    <Stack direction="row" spacing={2}>
      <TextField select label="Open test" value={view?.test.id ?? ''} onChange={event => { void load(event.target.value); }} disabled={readonly} sx={{ minWidth: 240 }}>
        <MenuItem value="" disabled>Select a test</MenuItem>
        {tests.map(test => <MenuItem key={test.id} value={test.id}>{test.name}</MenuItem>)}
      </TextField>
      <Button disabled={readonly} onClick={() => { currentId.current=null; setView(null); setName(''); setCsi(''); setEnvironment('development'); setAcknowledged(false); setSteps([{id:null,text:''}]); setScoped(false); setDirty(true); setRun(null); previous.current=null; }}>New test</Button>
      {view && <Button disabled={readonly} onClick={() => { void load(view.test.id); }}>Reload test</Button>}
    </Stack>
    <Box sx={{ display:'grid', gridTemplateColumns:{xs:'1fr',lg:'1fr 1fr 1fr'}, gap:2 }}>
      <Paper sx={{p:2}}><Stack spacing={2}>
        <TextField label="Test name" value={name} disabled={readonly} onChange={e=>{setName(e.target.value);setDirty(true);}} />
        <TextField label="CSI" value={csi} disabled={readonly || !!view} onChange={e=>{setCsi(e.target.value);setDirty(true);}} />
        <TextField label="Environment" value={environment} disabled={readonly} onChange={e=>{setEnvironment(e.target.value);setDirty(true);setRun(null);}} />
        {steps.map((step,index)=><Stack key={step.id ?? `new-${index}`} direction={{xs:'column',md:'row'}} spacing={1}>
          <TextField id={`authoring-step-${index}`} inputProps={{maxLength:500}} fullWidth multiline label={`Step ${index+1}`} value={step.text} disabled={readonly} onChange={e=>semanticEdit(steps.map((s,i)=>i===index?{...s,text:e.target.value}:s))}/>
          <Button aria-label={`Move step ${index+1} up`} disabled={readonly || index===0} onClick={()=>{const next=[...steps];[next[index-1],next[index]]=[next[index],next[index-1]];semanticEdit(next);}}>Up</Button>
          <Button aria-label={`Duplicate step ${index+1}`} disabled={readonly || steps.length>=100} onClick={()=>semanticEdit([...steps.slice(0,index+1),{id:null,text:step.text},...steps.slice(index+1)])}>Duplicate</Button>
          <Button aria-label={`Remove step ${index+1}`} disabled={readonly || steps.length===1} onClick={()=>semanticEdit(steps.filter((_,i)=>i!==index))}>Remove</Button>
        </Stack>)}
        <Button disabled={readonly || steps.length>=100} onClick={()=>semanticEdit([...steps,{id:null,text:''}])}>Add step</Button>
        <FormControlLabel control={<Checkbox inputProps={{ 'aria-describedby': 'scope-help' }} checked={scoped} disabled={readonly} onChange={e=>{setScoped(e.target.checked);setDirty(true);setAcknowledged(false);setRun(null);}}/>} label="Each step depends only on its own wording, earlier steps, and declared inputs."/>
        <Typography id="scope-help" variant="body2">If a step refers to a later step or changes the meaning of the whole test, leave this unchecked. All steps will be rebuilt.</Typography>
        <Button variant="contained" disabled={readonly || !name.trim() || !csi.trim() || steps.some(s=>!s.text.trim() || s.text.length>500)} onClick={()=>{void save();}}>Save steps</Button>
      </Stack></Paper>
      <Paper sx={{p:2}}><Stack spacing={2} aria-live="polite">
        <Typography variant="h6">Review actions</Typography>
        <Button disabled={readonly || dirty || !view?.authoringHash} onClick={()=>{void compile('AUTO');}}>Compile changes</Button>
        <Button disabled={readonly || dirty || !view?.authoringHash} onClick={()=>{void compile('FULL');}}>Rebuild all steps</Button>
        {compiling && <Typography>Compiling steps…</Typography>}
        {view?.test.compileStatus === 'AWAITING_CONFIRMATION' && !candidateCurrent && <Alert severity="warning">Candidate details are incomplete or changed. Reload the test before reviewing it.</Alert>}
        {attempt?.state === 'CANDIDATE' && !dirty && <Typography>{attempt.plan.selectedMode === 'INCREMENTAL' ? `Recompiled ${attempt.plan.writableStepIds.length} steps; reused ${attempt.plan.reusedStepIds.length} steps.` : attempt.plan.selectedMode === 'REUSE' ? 'Reused all code; validated the complete test again.' : 'Rebuilt all steps.'} Review changes, then run all {steps.length} steps.</Typography>}
        {attempt?.state === 'CANDIDATE' && attempt.plan.selectedMode === 'FULL' && fullRebuildReasons[attempt.plan.reason] && <Typography>{fullRebuildReasons[attempt.plan.reason]}</Typography>}
        {view?.test.compileError && <Alert severity="error">Compilation failed. Edit the steps or retry.</Alert>}
        {view?.test.compileDiagnostics?.artifact.map((diagnostic,i)=><Alert severity="warning" key={`artifact-${i}`}>{diagnostic.message}</Alert>)}
        {view?.test.compileDiagnostics?.steps.flatMap(step=>step.diagnostics.map((diagnostic,i)=><Alert severity="warning" key={`${step.stepIndex}-${i}`}>Step {step.stepIndex+1}: {diagnostic.message}<Button onClick={()=>document.getElementById(`authoring-step-${step.stepIndex}`)?.focus()}>Edit step {step.stepIndex+1}</Button></Alert>))}
        {view?.test.currentCandidateArtifact?.steps.map((step,index)=> {
          const id=view.authoring?.steps[index]?.id;
          const reused=id && attempt?.plan.reusedStepIds.includes(id);
          const prior=previous.current;
          const before=prior && prior.revision===attempt?.plan.baselineRevisionId ? prior.artifact.steps[prior.stepIds.indexOf(id ?? null)]?.code ?? null : null;
          return <Box key={index}><Typography>Step {index+1}: {reused?'Reused':'Recompiled'}</Typography><Typography>{step.originalText}</Typography>
            {!reused && before !== null && <details><summary>Code changes</summary><Typography variant="body2">Removed lines start with −; added lines start with +.</Typography><Box component="pre" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{before === step.code ? 'Code is identical; this step was regenerated. Review the updated wording.' : `${before.split('\n').map(line => `− ${line}`).join('\n')}\n${step.code.split('\n').map(line => `+ ${line}`).join('\n')}`}</Box></details>}
            <details><summary>{reused?'Reused code':'Current code'}</summary><Box component="pre" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{step.code}</Box></details></Box>;
        })}
        <FormControlLabel control={<Checkbox checked={acknowledged} disabled={readonly || dirty || !candidateCurrent || view?.test.compileStatus!=='AWAITING_CONFIRMATION'} onChange={e=>setAcknowledged(e.target.checked)}/>} label="I reviewed these actions."/>
        <Button variant="contained" disabled={readonly || dirty || !candidateCurrent || !acknowledged || view?.test.compileStatus!=='AWAITING_CONFIRMATION'} onClick={()=>{void confirm();}}>Confirm these actions</Button>
      </Stack></Paper>
      <Paper sx={{p:2}}><Stack spacing={2} aria-live="polite">
        <Typography variant="h6">Run and evidence</Typography>
        <Typography>{currentRun ? `This revision: ${currentRun.status}` : 'Not run for this revision'}</Typography>
        {view?.test.lastRunStatus && !currentRun && <Typography>Previous result: {view.test.lastRunStatus}{view.test.lastRunAt ? ` (${new Date(view.test.lastRunAt).toLocaleString()})` : ''}. It does not verify these changes.</Typography>}
        <Button variant="contained" disabled={readonly || !ready || (!!run && !isTerminalExecutionStatus(run.status))} onClick={()=>{void guarded(async()=>{
          if (!view || !attempt?.revisionId) return;
          if (!executionAttempt.current || executionAttempt.current.revisionId !== attempt.revisionId || (run && isTerminalExecutionStatus(run.status))) {
            executionAttempt.current={revisionId:attempt.revisionId,key:crypto.randomUUID(),executionId:null};
          }
          const intent=executionAttempt.current;
          if (!intent.executionId) {
            const accepted=await studioApi.executeTest(view.test.id,intent.key);
            intent.executionId=accepted.executionId;
          }
          const snapshot=await studioApi.getExecution(intent.executionId);
          setRun(snapshot);
          if (isTerminalExecutionStatus(snapshot.status)) executionAttempt.current=null;
        });}}>Run all {steps.length} steps</Button>
        {currentRun?.stepResults.map(step=><Typography key={step.stepIndex}>Step {step.stepIndex+1}: {step.status}</Typography>)}
        <VideoEvidencePanel snapshot={currentRun}/>
      </Stack></Paper>
    </Box>
  </Stack>;
}
