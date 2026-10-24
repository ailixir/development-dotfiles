"""Bound exact public seals and reused results; no target function or original2092 bodies."""
import ast,hashlib,json,stat
from pathlib import Path
R=Path.cwd(); B=Path('docs/qa/evidence/STUDIO-OBS-011/t0'); S=B/'early/gst-style-isolated-validation-prep/resume1'; A=B/'resume-architecture/resume2/gst-style-isolated-validation-source01-exact-review'; O=B/'qa/gst-style-isolated-validation-source01-exact-review'; D=B/'resume-architecture/resume2/gst-style-isolated-validation-design'
checks=[]; pins={}
def sha(b):return hashlib.sha256(b).hexdigest()
def check(name,ok):
 if ok is not True:raise AssertionError(name)
 checks.append({'id':name,'passed':True})
def bound(p,digest,size=None,mode=None):
 p=Path(p);p=p if p.is_absolute() else R/p;rel=p.relative_to(R).as_posix()
 assert '/runtime/' not in rel and '..' not in p.parts
 b=p.read_bytes();s=p.lstat();check('HASH_'+rel,sha(b)==digest);check('REGULAR_'+rel,stat.S_ISREG(s.st_mode))
 if size is not None:check('BYTES_'+rel,len(b)==size)
 if mode is not None:check('MODE_'+rel,stat.S_IMODE(s.st_mode)==mode)
 pins[rel]={'path':rel,'sha256':sha(b),'bytes':len(b),'mode':stat.S_IMODE(s.st_mode)}
 return b
subject=bound(S/'manifest.json','67ae068fc92006900082af0b1aca4cfc46c90737812d550392d9f5575f3aad26')
a=bound(A/'manifest.json','1b9a734119c87c43ec8282fa6146428bf94df0c0d9221b2545a9e3d5aa3a25e5')
for row in json.loads(a)['files']:bound(A/row['path'],row['sha256'],row['bytes'],row['mode'])
for row in json.loads((A/'pins.json').read_bytes()):bound(row['path'],row['sha256'],row['bytes'],row['mode'])
sm=json.loads(subject);check('SOURCE35',sm['payloadCount']==35)
for row in sm['files']:
 r=pins[(S/row['path']).as_posix()];check('SUBJECT_ROW_'+row['path'],all(r[k]==row[k] for k in ('sha256','bytes','mode')))
plan=json.loads((S/'unit-plan.json').read_bytes());design=json.loads((D/'design.json').read_bytes());check('PLAN_ENTIRE_SAME_DESIGN',(S/'unit-plan.json').read_bytes()==(D/'design.json').read_bytes())
rows=plan['finiteCopy']['members'];check('COMPLETE2092_TABLE_EQUAL',rows==design['finiteCopy']['members'] and len(rows)==2092 and len({r['path'] for r in rows})==2092)
check('UNKNOWN284_AND_KNOWN1808',sum(r['mode'] is None for r in rows)==284 and sum(r['mode'] is not None for r in rows)==1808)
check('SOURCE2092_ORIGINS',sum(r['origin']=='SOURCE1808' for r in rows)==1808)
over={r['path']:r['candidateSha256'] for r in plan['overlay']};virtual=[dict(r,sha256=over.get(r['path'],r['sha256'])) for r in rows if r['origin']=='SOURCE1808']
v=json.loads((S/'virtual-composition.json').read_bytes())
# Exact declared encoding uses path/sha256/mode only, as in finite design metadata.
compact=[{'path':r['path'],'sha256':r['sha256'],'mode':r['mode']} for r in virtual]
check('VIRTUAL_DIGEST_DISTINCT',sha(json.dumps(compact,sort_keys=True,separators=(',',':')).encode())==v['digest'] and v['digest']!=v['sharedExpectedF9'])
external=json.loads((S/'external-pins.json').read_bytes());check('PUBLIC39',len(external['publicInputs'])==39)
cv=json.loads((S/'candidate-verification.json').read_bytes());check('CANDIDATE25',len(cv['verifiedPayloads'])==25)
for row in cv['verifiedPayloads']:check('CANDIDATE_EXACT_'+row['path'],pins[row['path']]['sha256']==row['sha256'] and pins[row['path']]['bytes']==row['bytes'])
aria=json.loads((A/'verification-summary.json').read_bytes());archeck=json.loads((A/'checks.json').read_bytes());replay=json.loads((A/'replay43.stdout').read_bytes());check('ARIA4552_SEALED_REUSE',aria['static']['checks']==4552 and archeck['passed']==4552 and all(c['passed'] for c in archeck['checks']))
check('ARIA43_EXACT_REUSE',replay['passed']==43 and replay['failed']==0 and (A/'replay43.stdout').read_bytes()==(S/'fake-flow-attempt3.stdout').read_bytes() and (A/'replay43.stderr').read_bytes()==b'')
check('ARIA8_ATTRIBUTED',aria['independent']['checks']==8 and aria['independent']['cases']==6)
critical=json.loads((O/'critical.stdout').read_bytes());check('INDEPENDENT14_SEVEN',critical['checks']==14 and critical['cases']==7 and all(c['passed'] for c in critical['results']))
check('INDEPENDENT_FAKE_AUDIT',critical['actualTargetActions']==0 and critical['persistentAuditUnchanged'] and not critical['subjectSafetyCodeEdited'])
check('OWN_EMPTY_STDERR',(O/'critical.stderr').read_bytes()==b'')
source=(S/'pure_controller.py').read_text();tree=ast.parse(source);check('NO_IMPORT_MAIN',not any(isinstance(n,(ast.Import,ast.ImportFrom)) for n in ast.walk(tree)))
check('OWED_DEFAULT','self.port = port if port is not None else OwedPort()' in source and "raise Hold('ORDINARY_ADAPTER_OWED')" in source)
check('NO_COMPLETE_OPERATIONAL_CLAIM',sm['ordinaryRuntimeAdapterImplemented'] is False and sm['operationalCompletenessClaim'] is False and sm['sourceWindowLeaseApplyClosingCleanupCreditAuthority'] is False)
check('HISTORY2_UNKNOWN',sm['priorFailedFakeAttemptsRetained']==2 and 'first inner cause UNKNOWN' in (S/'execution-record.json').read_text())
check('FORMATTED_ADOPTION_NO_TRY',not any(isinstance(n,ast.Try) for n in ast.walk(next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='adopt_formatted'))))
check('FORMAT_REQUIRED_BINDINGS',len(over)==3 and plan['wrapper']['oldHoldReuse'] is False and plan['closure']['cleanupAuthorized'] is False)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(subject),'ariaManifestSha256':sha(a),'pinCount':len(pins),'pins':list(pins.values()),'exactPublicOnly':True,'original2092BodyOrRuntimeAcquisition':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'QUINN_SOURCE01_BOUNDED_SOURCE_AND_SEAL_CHECKS','checks':len(checks),'results':checks,'publicPins':len(pins),'subjectPayloads':35,'ariaPayloads':19,'reusedAriaFullFlow':43,'reusedAriaStatic':4552,'attributedAriaCritical':8,'independentCriticalChecks':14,'independentCriticalCases':7,'actualTargetActions':0,'ordinaryRuntimeAdapterImplemented':False,'mandatoryCategories':3},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'publicPins':len(pins),'independentCriticalChecks':14,'independentCriticalCases':7,'reuse43':True,'reuse4552':True,'actualTargetActions':0,'mandatoryCategories':3}))
