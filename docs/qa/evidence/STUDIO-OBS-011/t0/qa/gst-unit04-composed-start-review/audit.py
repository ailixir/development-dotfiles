from pathlib import Path
import hashlib,json,re,subprocess,ast
R=Path(__file__).resolve().parents[7]
T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
O=Path(__file__).resolve().parent
D=T/'early/gs-t-draft/resume5-wording-peer'
E=T/'early/gst-restricted-unit-prep/resume4'
G=T/'early/gst-lock-release-guard-prep'
U=T/'runtime/obs011-gst-provisional-04'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text())
def main():
 c=read(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gst-unit04-independent-qa-review-context.json')
 for x in c['pins']:assert sha(R/x['path'])==x['sha256'],x['path']
 manifest_count=0
 for directory in (D,E,G,T/'runtime/gst-limited-start-proposal04'):
  for row in read(directory/'manifest.json')['files']:
   assert sha(directory/row['path'])==row['sha256'],row['path'];manifest_count+=1
 results=[]
 for directory in (D,E):
  result=subprocess.run(['python3',str(directory/'verify.py')],capture_output=True,text=True)
  assert result.returncode==0,(str(directory),result.stderr)
  results.append({'path':str((directory/'verify.py').relative_to(R)),'exit':0,'result':json.loads(result.stdout)})
 rows=read(D/'candidate-bindings.json')
 source={Path(row['file']).stem:(D/'repo'/row['file']).read_text() for row in rows}
 old=T/'runtime/obs011-gst-provisional-03/formatted-candidate-archive'
 for row in rows:
  before=(old/row['file']).read_text();after=source[Path(row['file']).stem]
  if Path(row['file']).stem!='GuidedServiceTransportFaultIT':
   assert before.count('Click Order reference.')==2
   assert before.replace('Click Order reference.','Click Order number.')==after
 transport=source['GuidedServiceTransportFaultIT'];before=(old/rows[2]['file']).read_text() if Path(rows[2]['file']).stem=='GuidedServiceTransportFaultIT' else (old/next(x['file'] for x in rows if Path(x['file']).stem=='GuidedServiceTransportFaultIT')).read_text()
 modes=lambda s:re.search(r'enum Mode \{(.*?)\n  \}',s,re.S).group(1)
 assert modes(before)==modes(transport)
 assert transport[transport.index('private static void observeGstCutPrimary'):transport.index('private static void observeGstFailure')].count('scenario.peerFailure.get()')==1
 assert 'mode == Mode.CALLER_EXPIRY_AFTER_CONSUME ? 3 : 600' in transport
 filter=(D/'filtered-output.init.gradle').read_text();oldfilter=(T/'early/gs-t-draft/resume4-finite-observation/filtered-output.init.gradle').read_text()
 assert filter.replace('|CUT_PEER','').replace('|PEER_CALLBACK|PEER_RELAY','')==oldfilter
 regex=re.search(r'record ==~ /(.*)/\)',filter).group(1)
 valid=['GST_DIAG|site=CUT_PEER|route=NONE|status=NONE|family=OTHER|code=UNPROVEN|frame=NONE|line=0','GST_DIAG|site=CUT_PEER|route=NONE|status=409|family=GUIDED_SESSION|code=UNKNOWN_OUTCOME|frame=PEER_CALLBACK|line=12','GST_DIAG|site=CUT_PRIMARY|route=NONE|status=OTHER|family=IO|code=UNPROVEN|frame=PEER_RELAY|line=99999']
 bad=[valid[0]+'\n'+valid[1],valid[0]+'|secret=x',valid[0].replace('CUT_PEER','RAW'),valid[0].replace('UNPROVEN','SECRET'),valid[0].replace('NONE|line=0','RAW|line=0'),valid[0].replace('line=0','line=100000'),valid[0][:-1],'x'*769]
 assert all(re.fullmatch(regex,x) for x in valid)
 assert not any(len(x)<=768 and re.fullmatch(regex,x) for x in bad)
 plan=read(T/'early/fullcheck-harness/resume3/plan.json');mainrows=[x for x in plan['source']['files'] if x['path'].startswith('backend/src/main/')]
 assert len(mainrows)==506
 assert {str(p.relative_to(R)) for p in (R/'backend/src/main').rglob('*') if p.is_file()}=={x['path'] for x in mainrows}
 for row in mainrows:assert sha(R/row['path'])==row['sha256']
 proposal=read(T/'runtime/gst-limited-start-proposal04/proposal.json')
 assert len(proposal['nativeTestClasses'])==5 and len(proposal['expectedCases'])==99
 assert '--rerun-tasks' in proposal['proposedNativeCommandUnderImmutableLock'] and '--no-daemon' in proposal['proposedNativeCommandUnderImmutableLock']
 guard=(U/'guard-exit.bash').read_text()
 assert guard.count('builtin exit')==1 and 'if command python3' in guard and 'readonly -f exit' in guard
 assert guard.index('exit()')<guard.index('SETUP_BINDING') and guard.count('set +e')==2
 for f in ('unlock_gate.py','guard-exit.bash','policy.json'):assert (U/f).read_bytes()==(G/f).read_bytes()
 result={'staticOnly':True,'taskPins':len(c['pins']),'manifestArtifacts':manifest_count,'existingPureVerifiers':results,'literalCorrections':{'Session':2,'Lifecycle':2},'mainMembershipAndBytes':506,'peerReadCount':1,'filterValidAccepted':len(valid),'filterInvalidRejected':len(bad),'guardOnlyBuiltinExitSuccessBranch':True,'actualGuardOrShellOrLockOrProcessOrJavaOrNativeExecuted':False,'runtimeCauseRecovered':False}
 print(json.dumps(result,indent=2))
if __name__=='__main__':main()
