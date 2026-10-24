"""Proposed one-off snapshot facts + optional correlation manifest. No current private release."""
from pathlib import Path,PurePosixPath
import argparse,datetime,hashlib,json,os,re,stat,sys,xml.etree.ElementTree as ET
from load_core import load
HERE=Path(__file__).resolve().parent;ROOT=next(p for p in HERE.parents if (p/'AGENTS.md').is_file())
P=load(HERE,ROOT);P.C['purpose']='ORDER11_SNAPSHOT_FACTS_MANIFEST_CAPTURE'
PURPOSE=P.C['purpose'];CONDITIONAL='SOURCE_ORDERED_MAP_FIXED_FILENAME_PUBLIC_ORDINALS_CONDITIONAL'
XML_PATH=f"docs/qa/evidence/STUDIO-OBS-011/execution/{P.C['executionLabel']}-task-outputs/test/xml/TEST-{P.FQCN}.xml"
SNAPSHOT=f"failed-test-state-test-12-{P.C['method']}-singleton-18-initial.json"
TARGET={'task':'test','class':P.FQCN,'method':P.C['method'],'invocationOrdinal':12,'variant':'singleton','variantOrdinal':0,'sessionOrdinal':18,'scopeOrdinal':4}
PINS={'freshInputsSha256':'115c1ef0907c0410f90a2b5c6c068a4c63f856c511aa17286fda19588115cdff','closedPublicAssessmentSha256':'cf837ad88eb9b5aa3a224155f6a9f99fcd6d91bc979d7eaa35e9923448d7daae','closedPublicSealSha256':'7272c954729f176f8b04e9a2831139065aa852039023c0eb509fc9380a5b5778','closedPublicAdoptionSha256':'105a50ecf9dfab04cd832021e77960a3478d7678170c598053c21d6d000a9d70','rawHarnessReceiptSha256':'091d93b782a45406413d132e2e5d8fb921e4d21e22f3c7579773f8378afc4ff0','closedRootTerminalProofSha256':'d8387a34113066c4e3bc2656bfe969df9b61779117fa48ac3e40bbc7d1a08def'}
BINDING_PATHS=frozenset({'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-order11-capture-preparation-fresh-inputs.json'})|P.SOURCE_PATHS|frozenset(['docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection/resume2/manifest.json', 'docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection/resume2/project_existing.py', 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/order11-existing-evidence-projection-resume2-review/review.md', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-order11-projector-static-root-adoption.json', 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fullcheck03-terminal-public/assessment.md', 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fullcheck03-terminal-public/final-seal.json', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-fullcheck03-public-assessment-root-adoption.json', 'docs/qa/evidence/STUDIO-OBS-011/t0/early/order11-existing-evidence-projection/resume2/source-contract.json'])
base_scope=P.scope_contract
def capture_scope(scope):
 P.require(type(scope) is dict and all(scope.get(k)==v for k,v in PINS.items()),'CLOSED_PUBLIC_OR_RAW_BINDING')
 P.require(type(scope.get('optionalCorrelation')) is bool and scope.get('journalAuthority')==('ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' if scope['optionalCorrelation'] else 'NONE'),'NEW_EXACT_JOURNAL_AUTHORITY_REQUIRED')
 base={k:v for k,v in scope.items() if k not in set(PINS)|{'optionalCorrelation','journalAuthority','captureControlSha256'}}
 P.require('privateManifestSha256' not in base and type(scope.get('captureControlSha256')) is str and P.SHA.fullmatch(scope['captureControlSha256']),'CAPTURE_CONTROL_PIN')
 base['privateManifestSha256']=scope['captureControlSha256'];base_scope(base)
P.scope_contract=capture_scope

def control(raw,permit):
 P.require(P.digest(raw)==permit['scope']['captureControlSha256'],'CAPTURE_CONTROL_CHANGED');c=P.decode(raw,65536)
 P.keys(c,{'schemaVersion','target','provenanceBasis','expectedRoot','expectedIds'})
 P.require(type(c['schemaVersion']) is int and c['schemaVersion']==1 and c['target']==TARGET and all(type(c['target'][k]) is type(v) for k,v in TARGET.items()) and c['provenanceBasis']==CONDITIONAL,'SOURCE_CAPTURE_LOCATOR_PROVENANCE')
 if c['expectedIds'] is not None:
  P.keys(c['expectedIds'],{'sessionId','testId'})
  for v in c['expectedIds'].values():P.uuid_text(v)
 if c['expectedRoot'] is not None:
  P.keys(c['expectedRoot'],{'dev','ino','uid','mode'})
  for v in c['expectedRoot'].values():P.integer(v,9223372036854775807)
  P.require(c['expectedRoot']['mode']==448,'EXPECTED_ROOT_MODE')
 return c

def source_temp(raw):
 P.require(len(raw)<=2097152 and P.digest(raw)==P.C['publicFacts']['xmlSha256'],'EXACT_CLOSED_XML_BINDING')
 try:tree=ET.fromstring(raw)
 except Exception:raise P.Refused('CLOSED_XML_MALFORMED') from None
 cases=[x for x in tree.iter('testcase') if x.attrib.get('classname')==P.FQCN and x.attrib.get('name')==P.C['method']+'()']
 P.require(len(cases)==1 and tree.attrib.get('tests')=='46' and tree.attrib.get('failures')=='1' and tree.attrib.get('errors')=='0','CLOSED_CASE_SCOPE')
 failures=cases[0].findall('failure')+cases[0].findall('error');P.require(len(failures)==1 and failures[0].attrib.get('type')=='org.opentest4j.AssertionFailedError','CLOSED_GUARD_FAILURE')
 text=failures[0].attrib.get('message','')+'\n'+(failures[0].text or '')
 paths=set(re.findall(r'\[second explicit learning; logs ([^\]\r\n]+)\]',text));P.require(len(paths)==1,'EXACT_SOURCE_TEMP_REFERENCE')
 value=next(iter(paths));path=PurePosixPath(value)
 P.require(path.is_absolute() and '..' not in path.parts and '\x00' not in value and len(value)<=4096 and re.fullmatch(r'obs007-joined-[A-Za-z0-9_-]{1,80}',path.name),'SOURCE_TEMP_LOCATOR')
 return value # No warning/system-out/startup inspection or identity join.

def snapshot_facts(raw,c):
 s=P.snapshot(raw)
 translation={'continuation','translationCounters','declarations','obligations'};P.require(not (set(s)&translation) or translation<=set(s),'COMPLETE_SOURCE_TRANSLATION_CAPTURE')
 if c['expectedIds'] is not None:P.require(all(s[k]==v for k,v in c['expectedIds'].items()),'OPTIONAL_KNOWN_IDENTITY_MISMATCH')
 return {'phase':'AFTER_P3_INNER_CLEANUP','state':s['state'],'errorCode':s['errorCode'],'bootstrapPhase':s['bootstrapPhase'],'identityProvenance':CONDITIONAL,'externalUuidJoinProved':False,'OTHERMeansNoError':False}

def select_generation(raw,temp):
 P.require(len(raw)<=8388608,'JOURNAL_BYTES');lines=raw.splitlines();P.require(0<len(lines)<=16384,'JOURNAL_ROWS')
 rows=[P.decode(line,1048576) for line in lines]
 for r in rows:
  P.keys(r,{'event','role','generation','pid','alive','wrapperSha256','commandSha256','started','configSha256','poolSize','readinessNonceHash','readyPort','ownedTemp'},{'descendant'});P.integer(r['generation'],9223372036854775807)
 spawns=[r for r in rows if r.get('role')=='guided' and r.get('event')=='SPAWN']
 P.require(spawns and all(r.get('ownedTemp')==temp for r in spawns),'JOURNAL_GUIDED_ROOT')
 ordered=sorted(spawns,key=lambda r:r['generation']);starts=[P.instant_ns(r['started']) for r in ordered]
 P.require(len({r['generation'] for r in ordered})==len(ordered) and all(a<b for a,b in zip(starts,starts[1:])),'JOURNAL_GENERATION_AMBIGUOUS')
 warning=P.instant_ns(P.C['publicFacts']['warningTimestampUtc']);chosen=[r for i,r in enumerate(ordered) if starts[i]<=warning and (i+1==len(ordered) or warning<starts[i+1])]
 P.require(len(chosen)==1,'JOURNAL_INTERVAL_UNPROVEN');r=chosen[0];g=r['generation'];P.integer(g,16384,1)
 path='guided.log' if g==max(x['generation'] for x in rows if x.get('role')=='guided') else f'owned-generations/generation-{g}/guided.log'
 P.owned_producer(raw,g,path,temp,r['wrapperSha256'],r['configSha256'])
 return g,path,r['wrapperSha256'],r['configSha256']

def fact(raw,st,role,path=None):
 result={'role':role,'sha256':P.digest(raw),'bytes':len(raw),'mode':stat.S_IMODE(st.st_mode),'dev':st.st_dev,'ino':st.st_ino,'uid':st.st_uid}
 if path is not None:result['path']=path
 return result

def public_binding(row):return {k:row[k] for k in ['role','sha256','bytes','mode']}

def validate_report(out):
 P.keys(out,{'schemaVersion','purpose','status','caseAlias','snapshot','firstWriter','chronology','cause','optionalCorrelation','inputBindings','rawCollectorExit','rawGradleExit','rawTaskCollectionComplete','rawReceiptSha256','rawHarnessReceiptSha256','observationGapSticky','privateRawExported','nativeOrLaneCredit'})
 P.require(type(out['schemaVersion']) is int and out['schemaVersion']==1 and out['purpose']==PURPOSE and out['status']=='SNAPSHOT_FACTS_VALID_CONDITIONAL_SOURCE_PROVENANCE' and out['caseAlias']=='ORDER11_INVOCATION12_SCOPE4_SESSION18','REPORT_CLOSED_SCOPE')
 s=out['snapshot'];P.keys(s,{'phase','state','errorCode','bootstrapPhase','identityProvenance','externalUuidJoinProved','OTHERMeansNoError'})
 P.require(s['phase']=='AFTER_P3_INNER_CLEANUP' and s['state'] in P.C['snapshotStates'] and s['errorCode'] in P.C['snapshotCodes'] and s['bootstrapPhase'] in P.C['bootstrapPhases'] and s['identityProvenance']==CONDITIONAL and s['externalUuidJoinProved'] is False and s['OTHERMeansNoError'] is False,'REPORT_SNAPSHOT_ENUMS')
 P.require(all(out[k]=='UNPROVEN' for k in ['firstWriter','chronology','cause']) and out['observationGapSticky'] is True and out['privateRawExported'] is False and out['nativeOrLaneCredit'] is False,'REPORT_NO_CREDIT')
 corr=out['optionalCorrelation'];P.keys(corr,{'status','reason','manifestSha256'})
 P.require(corr['status'] in {'NOT_REQUESTED','COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW','UNPROVEN'} and corr['reason'] in {'NONE','MISSING_OPTIONAL_SOURCE_ARTIFACT','OPTIONAL_PROVENANCE_OR_SHAPE_UNPROVEN','OPTIONAL_INSTRUMENTATION_FAILED'},'REPORT_CORRELATION')
 P.require(corr['reason']=='NONE' if corr['status']!='UNPROVEN' else corr['reason']!='NONE','REPORT_CORRELATION_REASON')
 P.require((corr['manifestSha256'] is None and corr['status']!='COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW') or type(corr['manifestSha256']) is str and P.SHA.fullmatch(corr['manifestSha256']) and corr['status']=='COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW','REPORT_MANIFEST_HASH')
 for k in ['rawCollectorExit','rawGradleExit']:P.integer(out[k],255,-255);P.require(out[k]!=0,'REPORT_RAW_RED')
 P.require(type(out['rawTaskCollectionComplete']) is bool and out['rawHarnessReceiptSha256']==PINS['rawHarnessReceiptSha256'] and type(out['rawReceiptSha256']) is str and P.SHA.fullmatch(out['rawReceiptSha256']),'REPORT_RAW_BINDINGS')
 P.require(type(out['inputBindings']) is list and 2<=len(out['inputBindings'])<=4 and len({x['role'] for x in out['inputBindings']})==len(out['inputBindings']) and {'default_xml','snapshot_initial18'}<={x['role'] for x in out['inputBindings']},'REPORT_BINDING_ROLES')
 for x in out['inputBindings']:
  P.keys(x,{'role','sha256','bytes','mode'});P.require(x['role'] in P.ROLES and type(x['sha256']) is str and P.SHA.fullmatch(x['sha256']) and x['mode'] in {384,416,420},'REPORT_BINDING_FIELDS');P.integer(x['bytes'],16777216)

def validate_document(out):
 if 'files' in out:P.validate_manifest(P.canonical(out),{'scope':{'privateManifestSha256':P.digest(P.canonical(out))}})
 else:validate_report(out)
P.validate_document=validate_document

class CaptureIO(P.ExactIO):
 def read_control(self,permit):return self._regular(HERE/'release/capture-control.json',65536,owner=P.os.getuid(),mode=384,private_parent=True)
 def read_child(self,chain,path,cap,role,required_mode=None):
  relative=PurePosixPath(path);P.require(relative.parts and not relative.is_absolute() and '..' not in relative.parts,'EXACT_RELATIVE_CAPTURE_PATH')
  child=list(chain)
  try:
   self._extend(child,relative.parts[:-1]);parent=next(x['fd'] for x in reversed(child) if 'fd' in x);before=P.os.stat(relative.name,dir_fd=parent,follow_symlinks=False)
   P.require(stat.S_ISREG(before.st_mode) and before.st_uid==P.os.getuid() and stat.S_IMODE(before.st_mode) in ({required_mode} if required_mode is not None else {384,416,420}) and before.st_size<=cap,'CAPTURE_LEAF_OWNER_MODE_SIZE')
   expected={'dev':before.st_dev,'ino':before.st_ino,'uid':before.st_uid,'mode':stat.S_IMODE(before.st_mode),'bytes':before.st_size}
   raw=self._read_at(child,relative.name,cap,expected=expected,owner=P.os.getuid());return raw,fact(raw,before,role,path)
  finally:self._close_chain(child[len(chain):])
 def read_xml(self,permit):
  path=PurePosixPath(str(ROOT/XML_PATH));chain=self._dirs(path.parent)
  try:
   raw,row=self.read_child(chain,path.name,2097152,'default_xml',384);row['path']=XML_PATH;P.require(P.digest(raw)==P.C['publicFacts']['xmlSha256'],'XML_HASH');return raw,row
  finally:self._close_chain(chain)
 def write_doc(self,out,filename):
  P.require(filename in {'snapshot-facts.json','correlation-input-manifest.json'},'FIXED_CAPTURE_OUTPUT_ONLY');P.write_document(self,out,filename)

def run(io,expected,local,now=None):
 auth=io.read_public('authorization');P.require(P.digest(auth)==expected.get('authorization'),'APPROVAL_HASH_MISMATCH');a=P.decode(auth,65536);P.require(a.get('released') is True,'NO_EXECUTION_RELEASE')
 public={'authorization':auth}
 for alias in ['root_approval','quinn_approval','terminal','assessment']:public[alias]=io.read_public(alias)
 P.preauthorize(public,expected,local,now)
 for alias in ['receipt','before','after']:public[alias]=io.read_public(alias)
 permit=P.authorize(public,expected,local,now);io.claim_output(permit);c=control(io.read_control(permit),permit)
 xml,xml_fact=io.read_xml(permit);temp=source_temp(xml);chain=io._dirs(temp)
 try:
  st=P.os.fstat(next(x['fd'] for x in reversed(chain) if 'fd' in x));root={'path':temp,'dev':st.st_dev,'ino':st.st_ino,'uid':st.st_uid,'mode':stat.S_IMODE(st.st_mode)}
  P.require(st.st_uid==P.os.getuid() and root['mode']==448 and (c['expectedRoot'] is None or all(root[k]==v for k,v in c['expectedRoot'].items())),'OWNED_SOURCE_TEMP_ROOT')
  raw,snapshot_fact=io.read_child(chain,SNAPSHOT,1048576,'snapshot_initial18');s=snapshot_facts(raw,c);bindings=[xml_fact,snapshot_fact];manifest=None;correlation={'status':'NOT_REQUESTED','reason':'NONE','manifestSha256':None};incomplete=False
  if permit['scope']['optionalCorrelation']:
   try:
    journal,journal_fact=io.read_child(chain,'owned-worker-generations.jsonl',8388608,'owned_events');bindings.append(journal_fact)
    g,path,wrapper,config=select_generation(journal,temp)
    log,log_fact=io.read_child(chain,path,16777216,'guided_log');bindings.append(log_fact)
    manifest={'schemaVersion':1,'executionLabel':P.C['executionLabel'],'root':root,'generation':g,'wrapperSha256':wrapper,'configSha256':config,'files':bindings}
    validate_document(manifest);correlation={'status':'COMPLETE_PROTECTED_MANIFEST_PENDING_SEPARATE_REVIEW','reason':'NONE','manifestSha256':P.digest(P.canonical(manifest))}
   except FileNotFoundError:manifest=None;correlation={'status':'UNPROVEN','reason':'MISSING_OPTIONAL_SOURCE_ARTIFACT','manifestSha256':None}
   except P.Refused as failure:
    manifest=None;incomplete=str(failure) in {'INPUT_CLOSE_FAILURE','DIRECTORY_CLOSE_FAILURE'};correlation={'status':'UNPROVEN','reason':'OPTIONAL_INSTRUMENTATION_FAILED' if incomplete else 'OPTIONAL_PROVENANCE_OR_SHAPE_UNPROVEN','manifestSha256':None}
   except OSError:manifest=None;correlation={'status':'UNPROVEN','reason':'OPTIONAL_INSTRUMENTATION_FAILED','manifestSha256':None};incomplete=True
   except Exception:manifest=None;correlation={'status':'UNPROVEN','reason':'OPTIONAL_INSTRUMENTATION_FAILED','manifestSha256':None};incomplete=True
  io._check_chain(chain)
 finally:io._close_chain(chain)
 out={'schemaVersion':1,'purpose':PURPOSE,'status':'SNAPSHOT_FACTS_VALID_CONDITIONAL_SOURCE_PROVENANCE','caseAlias':'ORDER11_INVOCATION12_SCOPE4_SESSION18','snapshot':s,'firstWriter':'UNPROVEN','chronology':'UNPROVEN','cause':'UNPROVEN','optionalCorrelation':correlation,'inputBindings':[public_binding(x) for x in bindings],**{k:permit[k] for k in ['rawCollectorExit','rawGradleExit','rawTaskCollectionComplete','rawReceiptSha256']},'rawHarnessReceiptSha256':PINS['rawHarnessReceiptSha256'],'observationGapSticky':True,'privateRawExported':False,'nativeOrLaneCredit':False}
 validate_report(out)
 if manifest is not None:io.write_doc(manifest,'correlation-input-manifest.json')
 io.write_doc(out,'snapshot-facts.json');return out,2 if incomplete else 0

def local_bindings():
 reader=P.ExactIO();raw=reader._regular(HERE/'bindings.json',1048576);bindings=P.decode(raw,1048576)
 P.require(type(bindings) is dict and set(bindings)==BINDING_PATHS,'EXACT_SOURCE_PUBLIC_BINDING_SET')
 for name,h in bindings.items():P.require(type(h) is str and P.SHA.fullmatch(h) and P.digest(reader._regular(ROOT/name,33554432))==h,'SOURCE_OR_PUBLIC_INPUT_CHANGED')
 mraw=reader._regular(HERE/'manifest.json',1048576);m=P.decode(mraw,1048576);P.keys(m,{'schemaVersion','files'})
 P.require(type(m['schemaVersion']) is int and m['schemaVersion']==1 and type(m['files']) is dict and 1<=len(m['files'])<=32,'PACKAGE_MANIFEST')
 for name,h in m['files'].items():
  path=PurePosixPath(name);P.require(not path.is_absolute() and '..' not in path.parts and len(path.parts)<=2 and path.parts[0] not in {'release','released-projection-01'},'PACKAGE_LOCATOR');P.require(P.digest(reader._regular(HERE/name,33554432))==h,'PACKAGE_CHANGED')
 return {'parserSha256':P.digest(reader._regular(Path(__file__),1048576)),'packageManifestSha256':P.digest(mraw),'sourceBindingsSha256':P.digest(raw)}

def main():
 parser=P.ClosedArgumentParser(description=__doc__)
 for role in ['authorization','root-approval','quinn-approval']:parser.add_argument('--expected-'+role+'-sha',required=True)
 args=parser.parse_args();expected={k.replace('-','_'):getattr(args,'expected_'+k.replace('-','_')+'_sha') for k in ['authorization','root-approval','quinn-approval']};io=CaptureIO()
 try:out,code=run(io,expected,local_bindings())
 finally:io.close()
 print(json.dumps({'status':out['status'],'optionalCorrelation':out['optionalCorrelation']['status'],'cause':'UNPROVEN','privateRawExported':False,'nativeOrLaneCredit':False}));return code
if __name__=='__main__':
 try:code=main()
 except P.Refused as error:print(json.dumps({'status':'CAPTURE_REFUSED','reason':str(error),'privateRawExported':False,'nativeOrLaneCredit':False}));sys.exit(2)
 except BaseException:print(json.dumps({'status':'CAPTURE_REFUSED','reason':'MISSING_CHANGED_OR_UNSUPPORTED_INPUT','privateRawExported':False,'nativeOrLaneCredit':False}));sys.exit(2)
 else:sys.exit(code)
