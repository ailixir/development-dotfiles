"""Update current metadata and guarded test fixtures; no runtime execution."""
from pathlib import Path
import json,hashlib
D=Path(__file__).parent;root='448b1896730f77740e52561c12065ec315e85d336089be1097be72fe1e89fd4d';prior='607859e3f5e43ab4dad52afdcf1f1842801f2abacc197527b819e11668ccf1ab'
for name in ('README.md','RECIPE.md','scope.json','provenance.json','CHECKPOINT.json','preservation.json','archive-and-close.json','check-map.json'):
 p=D/'history/resume5'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((D/name).read_bytes())
s=json.loads((D/'scope.json').read_text());s['historicalPreparationAuthority']={k:s[k] for k in ('expectedRootPreparationAdoptionSha256','rootFindingsAdoptionSha256','successorOfManifestSha256')};s.update(preparationGeneration='resume6',successorOfManifestSha256=prior,rootFindingsAdoptionSha256=root,expectedRootPreparationAdoptionSha256=root,prospectiveOnly='Source06 only: native offTree03 label/W/E unchanged. Supplied current E exists H-only following failed admission01; W absent, native0. Source05 rejected, no continuation authority; require fresh qualification.');(D/'scope.json').write_text(json.dumps(s,indent=2)+'\n')
p=json.loads((D/'provenance.json').read_text());p.update(currentPreparationGeneration='resume6',supersedesWithoutMutating=prior,rootFindingAdoptionSha256=root,currentAdmissionState='SUPPLIED_E_CREATED_HONLY_WABSENT_FAILED_ADMISSION01_NATIVE0_SOURCE05_REJECTED');(D/'provenance.json').write_text(json.dumps(p,indent=2)+'\n')
c=json.loads((D/'CHECKPOINT.json').read_text());c.update(status='PREPARED_RESUME6_ALL_FIVE_FINDINGS_PENDING_EXACT_REVIEWS',rootAdoptionSha256=root,sourceGeneration='resume6',subjectPreserved=prior,currentState='SUPPLIED_SAME_HELD_H_ONLY_FAILED_ADMISSION_NO_NATIVE',remaining=['exact06 architecture and QA whole affected-source review','separate root continuation scope and readonly SAME-shell one-shot launch binding','actual capture/status/inspection/new root authorization','new guard negative/status/SAME holder; separate phases/archive/actual QA/final/permit/close/postclose']);c['adoptedFindings']={k:'IMPLEMENTED_SOURCE_ONLY_PENDING_EXACT_REVIEW' for k in ['C4-before-any-output','strict-returned-PID-FD-inode','same-verified-buffer-closure','no-signal-observation-lifecycle','current06-prior05-Honly-provenance']};(D/'CHECKPOINT.json').write_text(json.dumps(c,indent=2)+'\n')
p=json.loads((D/'preservation.json').read_text());p['sourceGeneration']='resume6';p['currentPriorManifestSha256']=prior;p['currentRootFindingsAdoptionSha256']=root;(D/'preservation.json').write_text(json.dumps(p,indent=2)+'\n')
p=json.loads((D/'archive-and-close.json').read_text());p['historicalAdoptedScopes']={k:p.pop(k) for k in list(p) if k.startswith('resume')};p['currentSourcePreparation']='resume6/root448b; all five rejected05 findings; native/phase/archive/closing semantics unchanged';(D/'archive-and-close.json').write_text(json.dumps(p,indent=2)+'\n')
p=json.loads((D/'check-map.json').read_text());p['currentPreparationGeneration']='resume6';p['currentFiveFindings']='IMPLEMENTATION-DESIGN.md and interpretation-sites.json; all248 controls plus new guarded actual-function cases';(D/'check-map.json').write_text(json.dumps(p,indent=2)+'\n')
# Retained fake-world source hashes must represent real in-memory bytes for same-buffer checks.
p=D/'boundary-controls.py';s=p.read_text()
s=s.replace("f.put('/R/BASELINE',h='BASELINE');f.put('/E/hold.json',self.H)","f.put('/R/BASELINE',{'identities':[]});self.H['baselineSha256']=f.nodes['/R/BASELINE']['sha'];f.put('/E/hold.json',self.H)")
s=s.replace("return 'i'+str(self.H['lock']['ino'])+'\\n'", "return 'p'+str(self.H['wrapper']['pid'])+'\\nf3\\ni'+str(self.H['lock']['ino'])+'\\nn'+self.H['lock']['path']+'\\n'")
s=s.replace("'sha':lambda p:f.nodes[str(p)]['sha']", "'types':SimpleNamespace(SimpleNamespace=SimpleNamespace),'sys':SimpleNamespace(orig_argv=['python3','FAKE_GUARDED_CLIENT']),'sha':lambda p:f.nodes[str(p)]['sha']")
s=s.replace("    def facts(self):return self.final", "    def reset_inputs(self):self.ns['IMMUTABLE_BYTES']={};self.ns['IMMUTABLE_DIGESTS']={}\n    def facts(self):\n        self.reset_inputs();return self.final")
s=s.replace("    def produce(self):return self.final", "    def produce(self):\n        self.reset_inputs();return self.final")
s=s.replace("    def close(self,p=None,now=1002):return self.final", "    def close(self,p=None,now=1002):\n        self.reset_inputs();return self.final")
p.write_text(s)
p=D/'revision-controls.py';s=p.read_text().replace("w.fs.put('/R/BASELINE',{'identities':[]},h='BASELINE')", "w.fs.put('/R/BASELINE',{'identities':[]})")
# Adapter boundary is now explicit no-signal Popen lifecycle; retained controls fake this
# boundary (new controls exercise actual lifecycle separately). Every timeout/status case stays.
s=s.replace("    w.ns['ast']=ast;w.ns['subprocess']=SimpleNamespace(run=runner)", "    w.ns['ast']=ast;w.ns['subprocess']=SimpleNamespace(run=runner)\n    w.ns['observation_binary']=lambda command:(command,'FAKE_BOUND_BINARY')\n    w.ns['no_signal_process']=lambda command,binary_sha:runner(command,timeout=10)")
p.write_text(s)
p=D/'admission-controls.py';s=p.read_text()
s=s.replace("stdout='p'+str(wrapper)+'\\ni'+str(w.H['lock']['ino'])+'\\n'", "stdout='p'+str(wrapper)+'\\nf3\\ni'+str(w.H['lock']['ino'])+'\\nn'+lock+'\\n'")
s=s.replace("    w.ns['subprocess']=types.SimpleNamespace(run=command)", "    w.ns['subprocess']=types.SimpleNamespace(run=command)\n    w.ns['observation_binary']=lambda argv:(argv,'FAKE_BOUND_BINARY')\n    w.ns['no_signal_process']=lambda argv,binary_sha:command(argv)")
s=s.replace("    def core(self):return {'synthetic':True}", "    def core(self):return {'synthetic':True,'table':lambda:{}}\n    def bind_observation_client(self,rows):self.events.append('client-anchor')\n    def enable_observation_writes(self):self.events.append('enable-records')\n    def no_signal_process(self,command,sha,kind):\n        self.w.ns['subprocess']=self.n['subprocess']\n        return self.w.ns['no_signal_process'](command,sha,kind=kind)")
s=s.replace("    def read(self,path):return self.fs.obj(str(path))", "    def read(self,path):\n        raw=self.__dict__.get('IMMUTABLE_BYTES',{}).get(str(path))\n        return json.loads(raw) if raw is not None else self.fs.obj(str(path))")
s=s.replace("n=definitions();d=Mini(n);d.n_digest=n['digest'];return n,d", "n=definitions();d=Mini(n);d.n=n;d.n_digest=n['digest'];return n,d")
s=s.replace("d.events.count('held')==2", "d.events.count('held')==3")
s=s.replace("gateway80-proof-prep/resume5' in text and 'gateway80-proof-prep/resume4' not in text", "gateway80-proof-prep/resume6' in text and 'gateway80-proof-prep/resume5' not in text")
p.write_text(s)
print('Current metadata and fake fixtures updated to06; banks/native scope untouched.')
