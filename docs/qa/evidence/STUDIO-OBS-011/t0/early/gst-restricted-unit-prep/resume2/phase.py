"""Fixed-three SOURCE phase checker for the reviewed recipe. NEVER RUN DURING PREPARATION.
Root invokes individual phases inside one interactive immutable-lock shell after exact release.
This does not launch formatter/tests, authorize a writer, or certify owned-process termination.
"""
from pathlib import Path
from collections import Counter
import hashlib,json,os,re,stat,subprocess,sys
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft';U=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-restricted-unit02'
B=R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03-before.json';L=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/plan.json'
PROPOSAL=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal02/proposal.json'
CAPTURE=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'
def hold(ok,label):
 if not ok:raise RuntimeError('GST_HOLD_'+label)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_text())
def record(name,obj):
 p=U/name
 with p.open('x') as f:json.dump(obj,f,indent=2);f.write('\n')
 os.chmod(p,0o600)
def inputs():
 p=read(PROPOSAL);writers={x['file'] for x in p['writerBindings']}
 for name,h in read(O/'bindings.json').items():
  if name not in writers:hold(sha(Path(name) if name.startswith('/') else R/name)==h,'INPUT_CHANGED')
 return p,read(B),read(L)
def check_source(name,overrides):
 proposal,base,plan=inputs();dest=U/name
 subprocess.run([sys.executable,str(CAPTURE),str(dest)],cwd=R,check=True)
 actual=read(dest);expected={x['path']:x['sha256'] for x in base['files']};expected.update(overrides)
 hold(len(actual['files'])==1808 and {x['path']:x['sha256'] for x in actual['files']}==expected,'SOURCE_MEMBERSHIP_OR_BYTES')
 hold(actual['dist']==base['dist'] and len(actual['dist']['files'])==238,'DIST')
 for group in ['helm','quotedCurrent','immutableHelpers']:
  for path,h in plan[group].items():hold(sha(R/path)==h,'HELM_QUOTES_HELPERS')
 if (U/'original-modes.json').is_file():
  for path,mode in read(U/'original-modes.json').items():hold(stat.S_IMODE((R/path).stat().st_mode)==mode,'SOURCE_MODE')
 return actual
TOKEN=re.compile(r'//[^\n]*|/\*.*?\*/|"""(?:\\.|(?!""").)*"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_$][\w$]*|[0-9][\w.]*|>>>?=?|<<=?|==|!=|<=|>=|&&|\|\||\+\+|--|->|::|\+=|-=|\*=|/=|%=|&=|\|=|\^=|[^\s]',re.S)
def java_tokens(raw):return [m.group() for m in TOKEN.finditer(raw.decode('utf-8')) if not m.group().startswith(('//','/*'))]
def split_imports(tokens):
 imports=[];body=[];i=0
 while i<len(tokens):
  if tokens[i]=='import':
   start=i
   while tokens[i]!=';':i+=1
   imports.append(tuple(tokens[start:i+1]))
  else:body.append(tokens[i])
  i+=1
 return imports,body
def format_only(before,after):
 old,oldbody=split_imports(java_tokens(before));new,newbody=split_imports(java_tokens(after))
 hold(oldbody==newbody,'NON_FORMATTING_TOKEN_OR_LITERAL_DELTA')
 hold(set(new)<=set(old),'ADDED_IMPORT')
 removed=set(old)-set(new)
 for imp in removed:hold('*' not in imp and imp[-2] not in newbody,'UNPROVED_IMPORT_REMOVAL')
 return [''.join(x) for x in sorted(removed)]
def main():
 phase=sys.argv[1];proposal,base,plan=inputs();rows=proposal['writerBindings']
 if phase=='backup':
  U.mkdir(mode=0o700)
  label=proposal['proposedNativeCommandUnderImmutableLock'][2];execution=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
  hold(not any(execution.glob(label+'*')),'LABEL_NOT_FRESH')
  check_source('before.json',{})
  record('original-modes.json',{x['path']:stat.S_IMODE((R/x['path']).stat().st_mode) for x in base['files']})
  (U/'original').mkdir(mode=0o700)
  for row in rows:
   path=R/row['file'];hold(sha(path)==row['beforeSha256'],'PREIMAGE');backup=U/'original'/path.name;backup.write_bytes(path.read_bytes());os.chmod(backup,0o600)
 elif phase=='stage':
  for row in rows:hold(not (R/row['file']).is_symlink() and (R/row['file']).resolve()==R/row['file'] and sha(R/row['file'])==row['beforeSha256'] and sha(D/'repo'/row['file'])==row['afterSha256'],'STAGE_BINDING')
  for row in rows:
   path=R/row['file'];path.write_bytes((D/'repo'/row['file']).read_bytes());os.chmod(path,read(U/'original-modes.json')[row['file']])
  check_source('staged.json',{x['file']:x['afterSha256'] for x in rows})
 elif phase=='check-format':
  current={x['file']:sha(R/x['file']) for x in rows};record('owned-formatted-bytes.json',current)
  removed={}
  for row in rows:
   path=R/row['file'];os.chmod(path,read(U/'original-modes.json')[row['file']]);removed[row['file']]=format_only((D/'repo'/row['file']).read_bytes(),path.read_bytes())
  record('format-successor.json',{'acceptedUnformattedPatchSha256':proposal['patchSha256'],'formattedSha256':current,'unusedExplicitImportsRemoved':removed,'literalTokensExact':True,'otherJavaTokensExact':True,'commentsAndOutsideLiteralWhitespaceMayReflow':True})
  check_source('formatted.json',current)
 elif phase in {'format-exit','native-exit','restore-compile-exit'}:
  code=int(sys.argv[2]);log=U/{'format-exit':'format.log','native-exit':'native-collector.stdout.log','restore-compile-exit':'restore-compile.log'}[phase];record(phase+'.json',{'exit':code,'logSha256':sha(log),'proofCredit':False})
 elif phase=='result':
  label=proposal['proposedNativeCommandUnderImmutableLock'][2];actual=read(R/'docs/qa/evidence/STUDIO-OBS-011/execution'/f'{label}-results.json')
  identity=lambda x:(x['task'],x['class'],x['name']);expected=Counter(identity(x) for x in proposal['expectedCases']);got=Counter(identity(x) for x in actual['testcases'])
  record('case-proof.json',{'expected':99,'actual':len(actual['testcases']),'identityMultisetExact':got==expected,'counts':actual['counts'],'collectorExit':actual['exit'],'gradleExit':actual['gradleExit'],'C8OrLaneCredit':False})
  hold(read(U/'native-exit.json')['exit']==0 and read(U/'format-exit.json')['exit']==0 and got==expected and len(actual['testcases'])==99 and all(x['status']=='PASS' for x in actual['testcases']) and actual['exit']==actual['gradleExit']==0 and actual['counts']['skipped']==0 and actual['sourceStable'] and actual['distStable'] and actual['testInputStable'] and actual['taskCollectionComplete'],'FULL_99_NATIVE_PROOF')
  check_source('after-native.json',read(U/'format-successor.json')['formattedSha256'])
 elif phase=='claim-owned':
  # Only after the exclusive Root lease and actual foreground formatter/test termination; never to bless user edits.
  record('restoration-owned-bytes.json',{x['file']:sha(R/x['file']) for x in rows})
 elif phase=='restore':
  owned=read(U/'restoration-owned-bytes.json')
  for row in rows:hold(not (R/row['file']).is_symlink() and (R/row['file']).resolve()==R/row['file'] and sha(R/row['file'])==owned[row['file']],'UNEXPECTED_EDIT_DO_NOT_OVERWRITE')
  for row in rows:hold(sha(U/'original'/(R/row['file']).name)==row['beforeSha256'],'BACKUP')
  for row in rows:
   path=R/row['file'];backup=U/'original'/path.name;path.write_bytes(backup.read_bytes());os.chmod(path,read(U/'original-modes.json')[row['file']])
  check_source('restored.json',{})
 elif phase=='check-restored':
  check_source('after-restore-compile.json',{});hold(read(U/'restore-compile-exit.json')['exit']==0,'RESTORE_BUILD_STATE_INCOMPLETE')
 else:raise RuntimeError('GST_HOLD_UNKNOWN_PHASE')
 print(json.dumps({'phase':phase,'status':'SOURCE_PHASE_COMPLETE','nativeCredit':False}))
if __name__=='__main__':main()
