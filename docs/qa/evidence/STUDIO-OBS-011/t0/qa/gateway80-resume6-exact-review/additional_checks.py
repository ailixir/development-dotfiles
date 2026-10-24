"""Additional finite immutable-source checks. No imports of operational source."""
from pathlib import Path
import ast,hashlib,json
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6');P=D.parent/'resume5';O=Path(__file__).parent
checks=[]
def check(name,ok):assert ok,name;checks.append({'check':name,'passed':True})
for name in ['boundary-control-results.json','revision-control-results.json','report-admission-control-results.json','admission-control-results.json']:
 old=json.loads((P/name).read_bytes())['checks'];new=json.loads((D/name).read_bytes())['checks']
 # Keep exact declared case identity order; generation fixtures may change honest result metadata.
 def identities(rows):return [(r.get('case',r.get('check',r.get('name',r.get('id')))),r.get('expected')) for r in rows]
 check('retained semantic identity '+name,identities(old)==identities(new))
leaf=(D/'verified-inputs.py').read_bytes();leafsha=hashlib.sha256(leaf).hexdigest()
for name,kind in [('run-private.py','phase'),('verify-final.py','final'),('exit-gate.py','gate'),('postclose.py','postclose')]:
 text=(D/name).read_text();tree=ast.parse(text)
 check('exact same-buffer leaf bootstrap '+name,leafsha in text and 'exec(compile(raw,' in text and "hashlib.sha256(raw).hexdigest()" in text)
 check('explicit current generation '+name,'gateway80-proof-prep/resume6' in text and 'gateway80-proof-prep/resume5' not in text)
 check('correct entry role '+name,"bootstrap_entry('"+kind+"')" in text)
entry=ast.parse(leaf);fn=next(n for n in entry.body if isinstance(n,ast.FunctionDef) and n.name=='entry');text=ast.unparse(fn)
for phrase in ['FINAL_REQUIRES_RELEASESHA_ACTUALREVIEWADOPTIONSHA','EXACT_PERMIT_SHA_REQUIRED','POSTCLOSE_REQUIRES_RELEASESHA_WRAPPERRESULTSHA','bind_controls(d, decision[\'immutableInputPins\'])','bind_controls(d, review[\'immutableInputPins\'])','bind_controls(d, permit[\'immutableInputPins\'])','bind_controls(d, result[\'immutableInputPins\'])']:
 check('entry control boundary '+phrase,phrase in text)
sites=json.loads((D/'interpretation-sites.json').read_bytes());check('84 reached interpretation sites',sites['siteCount']==len(sites['interpretationSites'])==84)
for site in sites['interpretationSites']:check('exact mapped interpretation source '+site['file']+':'+str(site['line']),hashlib.sha256((D/site['file']).read_bytes()).hexdigest()==site['sourceSha256'])
scope=json.loads((D/'scope.json').read_bytes());check('generation06 prior05 current H-only state',scope['preparationGeneration']=='resume6' and scope['successorOfManifestSha256']=='607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab' and scope['admissionState']['existingRuntimeHoldOnly'] is True and scope['admissionState']['workspaceAbsent'] is True and scope['admissionState']['nativePhases']==0)
(O/'additional-checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'allExpected':True,'actualRuntimeBaselineOsNativeActions':0},indent=2)+'\n')
print(json.dumps({'additionalSourceChecks':len(checks),'allExpected':True,'actualActions':0}))
