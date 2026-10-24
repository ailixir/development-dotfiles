"""Read exact source/public artifact pins only. Never enumerates or reads any release/private output."""
from pathlib import Path
import ast,hashlib,json,re
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';B=T/'early/order11-snapshot-manifest-capture';D=B/'resume2';O=T/'qa/order11-manifest-io-fix-review';C=T/'early/order11-existing-evidence-projection/resume2'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-manifest-io-fix-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',context.read_text(),re.M);assert len(pins)==30
for path,digest in pins:assert h(R/path)==digest
assert h(D/'manifest.json')=='0aeb9c6549d7ca4e0eff3466866e8a0e97e06256dab3bcc015a53b7ecd65db9d' and h(D/'capture_snapshot.py')=='6a0156cc2de6a163420fab0d1db4ee2a1150665d18107263694c88bb2f46fec2'
assert h(D/'receipt.json')=='ac14fb6b9fd9572fc9d7b40b994f5f215eea21945e1d4d3868a9618441c08440'
assert h(B/'manifest.json')=='420c18cee7778be2b41738df0dafa12d6c13a7ae91140b12a53e0e8b111bda4a' and h(B/'capture_snapshot.py')=='a619c4463f6e7f1aa4bcbb0ee8ca21a90b3d01e1de193f1f61029c9473d325cc'
old=json.loads((B/'manifest.json').read_text());new=json.loads((D/'manifest.json').read_text());assert len(old['files'])==24 and len(new['files'])==28
for directory,manifest in [(B,old),(D,new)]:
 for name,digest in manifest['files'].items():assert '/release/' not in '/'+name and '/released-projection-01/' not in '/'+name;assert h(directory/name)==digest
 for line in (directory/'SHA256SUMS').read_text().splitlines():digest,name=line.split(None,1);assert '/release/' not in '/'+name and '/released-projection-01/' not in '/'+name;assert h(directory/name.strip())==digest
assert h(T/'qa/order11-snapshot-manifest-review/review.md')=='11e65ff4c025f10f2f3bd5478890e1819407e6a97cd799ec6863c468e7e05ca8'
assert h(T/'qa/order11-existing-evidence-projection-resume2-review/review.md')=='398831068f4d09c2be34f04c0e517f8239d5ff1bb21792ff6f4e21518e396dfe'
source=(D/'capture_snapshot.py').read_text();prior=(B/'capture_snapshot.py').read_text();tree=ast.parse(source);pt=ast.parse(prior)
constant=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='OPTIONAL_IO_FAILURES' for t in n.targets))
lines=source.splitlines(keepends=True);inverse=''.join(lines[:constant.lineno-2]+lines[constant.end_lineno:]) # Remove exact added constant + its preceding comment.
inverse=inverse.replace("incomplete=str(failure) in OPTIONAL_IO_FAILURES","incomplete=str(failure) in {'INPUT_CLOSE_FAILURE','DIRECTORY_CLOSE_FAILURE'}",1)
assert inverse==prior
oldnodes={n.name:n for n in pt.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))};nodes={n.name:n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
assert set(oldnodes)==set(nodes) and all(ast.get_source_segment(prior,n)==ast.get_source_segment(source,nodes[name]) for name,n in oldnodes.items() if name!='run')
for name in ['bindings.json','load_core.py','public-output-schema.json','allowed-fields-and-locators.md']:
 if name!='allowed-fields-and-locators.md':assert (B/name).read_bytes()==(D/name).read_bytes()
bindings=json.loads((D/'bindings.json').read_text());assert len(bindings)==36
for path,digest in bindings.items():assert '/release/' not in path and '/released-projection-01/' not in path;assert h(R/path)==digest
coremanifest=json.loads((C/'manifest.json').read_text());assert h(C/'manifest.json')=='f015cd9e3c0cca41af3668dd5a5ef67cd00f7a5afe22d0bdc5d56e2edf3b5fad'
for name,digest in coremanifest['files'].items():assert h(C/name)==digest
assert h(C/'project_existing.py')=='dc9dd58361c17f2efd4e298a925b3b6e891991963072dcdca5a01cf81d0f39f5'
for name,field in [('root-authorization.example.json','released'),('root-approval.example.json','approved'),('quinn-approval.example.json','approved')]:assert json.loads((D/'examples'/name).read_text())[field] is False
scope=json.loads((D/'examples/scope.example.json').read_text());assert scope['optionalCorrelation'] is True and scope['journalAuthority']=='ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' and scope['purpose']=='ORDER11_SNAPSHOT_FACTS_MANIFEST_CAPTURE'
control=json.loads((D/'examples/capture-control.example.json').read_text());assert control['expectedRoot'] is control['expectedIds'] is None
packet=(D/'PACKET-CONSTRUCTION.md').read_text()
steps=['1. Construct `capture-control.json`','3. Construct terminal-proof.json','4. Construct public-assessment.json','5. Construct scope','6. Hash the canonical scope','7. Only after exact independent actual-scope approval']
positions=[packet.index(step) for step in steps];assert positions==sorted(positions)
assert all(x in packet for x in ['captureControlSha256','terminalProofSha256','publicAssessmentSha256','scopeSha256','rootApprovalSha256','quinnApprovalSha256','SIX exact approved0600','No actual new read/release is authorized','never reuse of the consumed first snapshot-only scope'])
assert 'resume2/capture_snapshot.py' in (D/'launch.txt').read_text()
# Only fixed source label-set membership changed inside optional catch; IO/enums/caps/guard definitions exact.
assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in {'glob','rglob','listdir','scandir','walk','system','popen','kill'} for n in ast.walk(tree))
out=dict(scope='NARROW_SNAP_MANIFEST_IO_01_SOURCE_AND_PURE_CONTROL_REVIEW',manifestSha256=h(D/'manifest.json'),helperSha256=h(D/'capture_snapshot.py'),receiptSha256=h(D/'receipt.json'),currentArtifactEntries=28,original24SourceArtifactsUnchanged=True,originalHelperSha256=h(B/'capture_snapshot.py'),originalManifestSha256=h(B/'manifest.json'),sourcePublicBindingsUnchanged=36,retainedCoreManifestSha256=h(C/'manifest.json'),retainedCoreHelperSha256=h(C/'project_existing.py'),inverseExactTwoChangesRecoversOriginalHelper=True,allOtherNamedSourceDefinitionsByteExact=len(oldnodes)-1,ioEnumsSchemaPathsCapsGuardsUnchanged=True,examplesRemainFalse=True,futureOptionalScopeNewAndSeparate=True,packetOrderNonCircularSourceReviewed=True,originalReleaseOrConsumedOutputEnumeratedStattedRead=False,actualPrivateIO=0,helperMainLoaderOrNativeExecuted=False,actualPacketReviewed=False,actualOptionalScopeApproved=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
