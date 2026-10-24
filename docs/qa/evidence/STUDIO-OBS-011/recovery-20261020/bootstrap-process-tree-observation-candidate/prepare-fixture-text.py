from pathlib import Path
import json
O=Path(__file__).resolve().parent;rel=Path('studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts');old=(O/'before'/rel).read_text();s=old;edits=[]
def change(before,after,why):
 global s
 assert s.count(before)==1,(why,s.count(before));s=s.replace(before,after,1);edits.append({'before':before,'after':after,'reason':why})
change("// eslint-disable-next-line no-restricted-imports -- Actual PID labels and native decode in the fixture oracle; fixed binaries only.\nimport {execFileSync} from 'node:child_process';\n",'', 'Move only fixed process acquisition to new fixture-owned helper')
change("import {descendantsOf,isAlive} from '../../src/run/tree.js';", "import {isAlive} from '../../src/run/tree.js';\nimport {captureBootstrapTree,confirmBootstrapTreeSuspended,bootstrapTreeGone} from '../helpers/bootstrapProcessTreeObservation.js';\nimport type {BootstrapProcessTree} from '../helpers/bootstrapProcessTreeObservation.js';", 'Keep original production cleanup isAlive; use strict fixture observation helper only at observation sites')
anchor="const suspended:number[]=[],quiescenceFacts:Record<string,unknown>={},nativeFacts:Record<string,unknown>={};"
change(anchor,anchor+"\n let confirmedSuspended:readonly number[]=[];let readyTree:BootstrapProcessTree|undefined,inventoryWrite:Promise<void>|undefined;let inventoryWriteFailed=false;",'Separate confirmed suspension from original cleanup-attempt list; promise handoff has immediate rejection handler')
ready="const pids=handle?.pid?descendantsOf(handle.pid):[],labels=pids.map(pid=>({pid,command:execFileSync('ps',['-p',String(pid),'-o','comm='],{encoding:'utf8',timeout:1000}).trim()}));writeFileSync(marker,JSON.stringify({phase,actualReadyAccepted:true,pids,labels}));app.coordinator.cancel(job.binding.executionId);"
newready="if(!handle?.pid)throw Error('CHILD_PID');readyTree=captureBootstrapTree(handle.pid);const pids=readyTree.observedPids,labels=readyTree.labels;inventoryWrite=nativeJson(diagnostics,'bootstrap-owned-inventory.json',{phase,childPid:readyTree.childPid,observedDescendantPids:[...readyTree.observedPids]}).catch(()=>{inventoryWriteFailed=true;});writeFileSync(marker,JSON.stringify({phase,actualReadyAccepted:true,pids,labels}));app.coordinator.cancel(job.binding.executionId);"
change(ready,newready,'One coherent capture before unchanged ready marker/cancel; no await in callback; nativeJson promise guarded immediately')
ordinary="const pid=handle?.pid;if(!pid)throw Error('CHILD_PID');const pids=phase==='ready-received-stop'?captureFacts.pids as number[]:descendantsOf(pid),labels=phase==='ready-received-stop'?captureFacts.labels as {pid:number;command:string}[]:pids.map(p=>({pid:p,command:execFileSync('ps',['-p',String(p),'-o','comm='],{encoding:'utf8',timeout:1000}).trim()}));"
newordinary="const pid=handle?.pid;if(!pid)throw Error('CHILD_PID');const observation=phase==='ready-received-stop'?readyTree:captureBootstrapTree(pid);if(!observation)throw Error('BOOTSTRAP_READY_INVENTORY_MISSING');if(phase==='ready-received-stop'){if(!inventoryWrite)throw Error('BOOTSTRAP_INVENTORY_WRITE_MISSING');await inventoryWrite;if(inventoryWriteFailed)throw Error('BOOTSTRAP_INVENTORY_WRITE');}else await nativeJson(diagnostics,'bootstrap-owned-inventory.json',{phase,childPid:observation.childPid,observedDescendantPids:[...observation.observedPids]});const pids=observation.observedPids,labels=observation.labels;"
change(ordinary,newordinary,'Reuse ready captured inventory without re-enumeration; ordinary capture once; finish existing nativeJson persistence before role/signal assertions')
stop="if(phase!=='committed-before-ready-orderly'&&phase!=='ready-received-stop')for(const p of pids){try{process.kill(p,'SIGSTOP');suspended.push(p);}catch{throw Error('LIVE_TREE_CHANGED');}}"
change(stop,stop+"\n   if(phase!=='committed-before-ready-orderly'&&phase!=='ready-received-stop')confirmedSuspended=confirmBootstrapTreeSuspended(observation);",'Original strict SIGSTOP and immediate cleanup recording byte-identical; one fresh T/live confirmation afterward')
change("await untilMs(()=>[pid,...pids].every(p=>!isAlive(p)),5000);","await untilMs(()=>bootstrapTreeGone(observation),5000);",'Same complete child-plus-observed population/5000ms wait; only ESRCH now means gone')
change("actualSuspendedDescendantPids:pids,pidLabels:labels", "actualSuspendedDescendantPids:confirmedSuspended,actualObservedDescendantPids:pids,pidLabels:labels",'Correct suspended provenance; retain complete observed set and labels separately, including unsuspended modes')
p=O/'after'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s);(O/'fixture-edit-ledger.json').write_text(json.dumps(edits,indent=2)+'\n')
helper=O/'after/studio-runner/test/helpers/bootstrapProcessTreeObservation.ts';candidate=helper.read_text();capture=candidate[candidate.index('export function captureBootstrapTree('):candidate.index('/** One fresh confirmation only;')]
legacy='''export function captureBootstrapTree(childPid: number): BootstrapProcessTree {
  // Same strict preflight/API as candidate; the following acquisition remains the original fixture algorithm.
  readSnapshot(childPid);
  const pids = descendantsOf(childPid), labels = pids.map(pid => ({
    pid, command: execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8', timeout: 1000 }).trim(),
  }));
  return freezeObservation(childPid, pids, labels);
}
'''
legacyHelper=candidate.replace(capture,legacy,1);p=O/'old-algorithm/studio-runner/test/helpers/bootstrapProcessTreeObservation.ts';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(legacyHelper)
(O/'capture-algorithm-bindings.json').write_text(json.dumps({'sameCompleteApi':True,'onlyCaptureFunctionDiffers':candidate.replace(capture,'<CAPTURE>')==legacyHelper.replace(legacy,'<CAPTURE>'),'candidateCapture':capture,'oldCapture':legacy,'oldOriginalReadySpan':ready,'oldOriginalOrdinarySpan':ordinary,'sharedStrictPreflightAddition':'Both buffers validate the same strict observer/expected child table and root liveness before their scoped algorithm. This is not asserted neutral for a whole old native run.','legacyAcquisition':'Unchanged production descendantsOf(childPid) default table then original per-PID ps comm/trim, no swallowed legacy query error','primaryRedOnly':'Old lookup for transient throws mocked ESRCH; same explicit complete-inventory assertion fails, not missing export/setup.','allOtherHelperBytesIdentical':True},indent=2)+'\n')
print('Prepared exact eight-hunk fixture edit and same-API old algorithm as text only.')
