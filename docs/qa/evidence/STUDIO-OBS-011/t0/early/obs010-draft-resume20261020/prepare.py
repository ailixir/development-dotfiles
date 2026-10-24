from pathlib import Path
import json, hashlib, difflib, re, datetime, csv
ROOT=Path.cwd()
OUT=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft-resume20261020')
OLD=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft')
SELECT=OLD/'resume4'
assert OUT.exists() and not (OUT/'manifest.json').exists(), 'new output only'
inputs={}
def sha(b): return hashlib.sha256(b).hexdigest()
def read(p):
 p=Path(p); b=p.read_bytes(); inputs[str(p)]={'path':str(p),'sha256':sha(b),'bytes':len(b)};return b
def text(p):return read(p).decode()
def write(p,s):
 p=OUT/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def jwrite(p,d):write(p,json.dumps(d,indent=2,ensure_ascii=False)+'\n')
def load(p):return json.loads(read(p))
def remap(s):return s.replace(str(SELECT),str(OUT)).replace('../qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft/resume4/', '../qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft-resume20261020/')
# Preserve every original draft byte; this snapshot is limited to the named original package.
original={str(p):sha(p.read_bytes()) for p in OLD.rglob('*') if p.is_file()}
for p in [OLD/'CHECKPOINT-PAUSED.md',OLD/'design.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md','docs/stories/STUDIO-OBSERVED/README.md','docs/qa/evidence/STUDIO-OBSERVED-NEXT/RESUME-HANDOFF-20261019-CODEX.md','.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/resume-20261020/coordinator-plan.json','docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/session-reconnect-20261020.md']:read(p)
write(Path('design.md'),'''# STUDIO-OBS-010 separate documentation continuation — 2026-10-20 UTC

Atlas / aiox-analyst. Scope: complete checkpoint items 2–6 as new off-tree documentation, based on the original checkpoint/design and selectively revised resume4 previews. The earlier drafts stay unchanged. This packet does not inherit a prior package's acceptance or claim current independent review.

Produce five eventual-target previews and exact unified patches: single-path runbook; gated pilot; pending release ledger; unsubmitted devops handoff; append-only 10.34 proposal. Extract all 21 story-010 architecture obligation objects unchanged, and map those and RBR-01–19 to sections, implementing evidence and remaining owners/inputs. Keep five UNASSIGNED slots, header-only attempt/focus forms and NOT_RUN denominators.

The original wrapper/shell liveness is relayed historical metadata. The current original Gateway handle is unavailable; no actual completion or supported reconnect is established. Freeze persists. Base hashes check freshness only and confer no source-window or application authority. Root owns integration and later independent PM/QA review. No story/runbook/live-source application, network/provider work, participant contact, process/resource action, builds/tests, lifecycle/QA verdict or release grant is part of this preparation.

F01–F04 conditions, E1–E8, all U/ED gates, post-009-Done re-date/PM acceptance, NTP bound owed to Platform/SRE, blank first-learn p95 pending T4, and all existing user deferrals remain. Source08 and prior packets stay immutable; C8/GST infrastructure stays parked. Fresh backend check plus JaCoCo before 011 credit and final affected suites remain owed. Shared USD 500 ceiling remains; aggregate spend is unavailable. No accessibility expansion.
''')
# Copy selected current documents, preserving earlier decisions but making provenance explicit.
targets=[('runbook','docs/runbooks/studio-guided-authoring.md'),('pilot','docs/qa/evidence/studio-observed-authoring/usability-pilot.md'),('readiness','docs/qa/evidence/studio-observed-authoring/release-readiness.md'),('handoff','docs/qa/evidence/studio-observed-authoring/devops-handoff.md')]
for key,target in targets:
 s=remap(text(SELECT/'preview'/target))
 s=s.replace('GAblo cking','GA blocking').replace('post-GAcandidate','post-GA candidate').replace('stays100','stays 100').replace('T6derivedlimit','T6 derived limit').replace('After009 Done','After 009 Done').replace('After009','After 009').replace('exact009','exact 009').replace('carrying009','carrying 009').replace('runbook§','runbook §').replace('×1.85','× 1.85').replace('edits009','edits 009')
 # Selected metadata remains dated; add an accurate current continuation note.
 lines=s.splitlines();lines.insert(2,'Continuation prepared 2026-10-20 UTC by Atlas from the preserved resume4 draft. **UNAPPLIED; current independent PM/QA review pending.** Earlier author/date lines identify the selected draft provenance.');s='\n'.join(lines)+'\n'
 if key=='runbook':
  s=s.replace('The application defaults enable `studio.guided-authoring.translation.enabled`, authored nonsecret input,','The application defaults enable `studio.guided-authoring.translation.enabled`, `studio.guided-authoring.translation.allow-authored-nonsecret`,')
  s=s.replace('Observed is enabled in UAT values; that does not prove deployability.','UAT sets `studioObserved.validationEnabled: true` and `studioObserved.replayEnabled: true`; catalog and trusted-policy inputs remain required. `GuidedTranslationProperties.applications` and `.environments` default to empty lists, so enabled translation flags alone do not authorize any scope. These defaults do not prove deployability.')
 if key=='pilot':
  # Double-backtick code spans retain embedded single backticks without HTML-token parsing.
  bad='``This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again``'
  good='``This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again``'
  assert bad in s
  s=s.replace(bad,good)
 if key=='readiness':
  s=s.replace("Original B1 was live at the root resume probe; this package does not assert its current process state or credit a terminal result. Source/dist stability, all executed partitions and fresh coverage tasks must be checked at completion.","Historical process liveness does not prove completion. The original Gateway handle is unavailable; root relays wrapper 3720 and shell 3749 alive with the recorded start, without restored I/O or qualification. Freeze persists. Fresh backend check plus JaCoCo before any 011 credit, final affected suites and independent closure remain owed.")
 if key=='readiness':
  s='\n'.join(l.rsplit('|2026-10-18 |',1)[0]+'|2026-10-20 UTC |' if l.startswith('| B1 fresh backend') else l for l in s.splitlines())+'\n'
 if key=='handoff':
  s=s.replace('`architecture-obligations.json` and `external-obligations-all-stories.json` in the resume4 package','`architecture-obligations.json` and `traceability.json` in this package')
  s=s.replace('Before any push, rule on the roughly 314 MB of evidence already in `4f9e451a0`; ignore rules cannot remove existing objects.','Repository delivery and evidence-size policy remain devops/user decisions; this packet supplies no push authority.')
  s=s.replace('External inputs remain precisely as recorded in `release-readiness.md`, `architecture-obligations.json` and `traceability.json` in this package:', 'External inputs remain pending as recorded in `release-readiness.md`, `architecture-obligations.json` and `traceability.json` in this package:')
  s += '\nCurrent freeze: original Gateway handle unavailable; wrapper/shell liveness is a relayed metadata observation only. No supported reconnect, completion, source-window or runtime authority follows. Actual held closure, fresh backend check plus JaCoCo before 011 credit and final affected suites remain owed. C8/GST auxiliary infrastructure stays parked. Shared USD 500 ceiling remains; actual aggregate spend is unavailable.\n'
 write(Path('preview')/target,s)
# Preserve PM placement record as evidence of the earlier bounded decision, never as new analyst authority.
for n in ['pm-ac24-carrier-decision.json','pm-ac24-carrier-decision.md','video-logging-current-disposition.json','10.34-dispositions.json']:
 write(Path(n),remap(text(SELECT/n)))
append=remap(text(SELECT/'10.34-appendix.md'))
append=append.replace('## STUDIO-OBS-010 single-path re-registration proposal — 2026-10-18','## STUDIO-OBS-010 single-path re-registration proposal — continuation 2026-10-20 UTC')
append=append.replace('Prepared off-tree by Morgan (@pm).','Prepared from the preserved Morgan (@pm) 2026-10-18 proposal, continued off-tree by Atlas on 2026-10-20 UTC. Earlier bounded PM placement evidence is preserved in this packet; current independent PM/QA review remains pending.')
write(Path('10.34-appendix.md'),append)
base=read('docs/stories/10.34.story.md')
assert base.endswith(b'\n'), 'append must preserve base exactly'
write(Path('preview/docs/stories/10.34.story.md'),base.decode()+'\n'+append)
for n in ['participant-slots.csv','pilot-attempts.csv','pilot-focus-targets.csv','pilot-denominators.csv']:
 write(Path('sheets')/n,text(SELECT/'sheets'/n))
arch_path='docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/review.json'
a=[r for r in load(arch_path)['obligations'] if r['story']=='010'];assert len(a)==21
jwrite(Path('architecture-obligations.json'),{'source':arch_path,'sourceSha256':inputs[arch_path]['sha256'],'scope':'all 21 story-010 obligation objects, strings and field values verbatim; JSON formatting only','count':21,'isVerdict':False,'obligations':a})
tr=load(SELECT/'traceability.json');tr=json.loads(remap(json.dumps(tr,ensure_ascii=False)))
assert len(tr['RBR'])==19 and len(tr['story010Obligations'])==21
heads=dict(re.findall(r'^### (RBR-\d{2}) — (.+)$', (OUT/'preview/docs/runbooks/studio-guided-authoring.md').read_text(),re.M))
owner=['PUT Core/BFF ED-02; user/application owner','PUT Core/BFF ED-02','Platform/SRE; devops','Platform/SRE; Security & Compliance','Implementing owner; ED-02','U8 named human reviewer; Platform/SRE','Platform/SRE; devops','PUT Core/BFF ED-02; Vault owner','Platform/SRE; devops; token issuer','User/database owner; Platform/SRE','User; PM; Security & Compliance; approver owner to name','Analyst/dev/QA; 009 executor','Platform/SRE; PUT Core/BFF ED-02','Platform/SRE','Platform/SRE; devops','User; Platform/SRE; devops; 009 QA','Platform/SRE storage/ingress; QA','Analyst; architect; PO; PM','009 T4 executor; PM']
for i,r in enumerate(tr['RBR']):
 r['section']=heads[r['id']];r['remainingOwner']=owner[i]
 r['sourceEvidenceState']='Existing implementation/source records; no deployed/pilot proof inferred'
for r,orig in zip(tr['story010Obligations'],a):
 assert r['id']==orig['id'];r['implementingEvidence']=orig['evidence'];r['remainingOwner']=orig['owner'];r['remainingInput']=orig['missingInput']
# Exact section headings replace old shorthand; all paths are current-packet paths.
section_map=[['Entry sheet — complete before booking or using a real credential'],['Task card preparation','Facilitator script','Shipped008 copy freeze'],['FOCUS-MUTATION-01 preflight form'],['Observation and denominator rules'],['Remediation and closeout'],['RBR-01…RBR-19'],['RBR-14 — Cross-host clocks'],['RBR-19 — First-learn limit, pending T4'],['RBR-18 — Dated Live surface boundary'],['Gate table; 10.34 single-path staging re-registration'],['Gate table; OBS007…OBS008, OBS009, usability, compatibility and retention'],['Gate table; G1, G2, G3, GA C2, GA C3'],['Gate table; OBS014 approvals, F01, F02, CACHE-REAUTH, AUDIT-LABEL-PRIVACY'],['Gate table; F04 and E1…E8'],['Gate table; D-B, DevDB and Host clock skew/NTP U11'],['Gate table; KL-015-R1, KL-015-D5'],['Gate table; AUTHORED-ECHO-01, RS1/F03, FOCUS-MUTATION-01, TF5/U14'],['Gate table; four ED-05 rows'],['Gate table; MODEL-SIZING, SEC-AUDIT-PREREADY-01, RUN-ORPHAN-01'],['Gate table; U24 and GA tracked rows'],['Handoff gate table; Application order']]
for r,sec in zip(tr['story010Obligations'],section_map):r['sections']=sec
jwrite(Path('traceability.json'),tr)
md=['# Documentation traceability — preparation only','','All 21 architecture objects are preserved unchanged in architecture-obligations.json. The maps below identify prepared sections and remaining work; no execution or closure is credited. Source line numbers in the verbatim extraction are historical locators; current paths and named sections are authoritative for navigation.','','| RBR | Prepared section | Implementing source/evidence | Remaining owner and input |','|---|---|---|---|']
for r in tr['RBR']:md.append('| '+r['id']+' | '+r['section']+' | '+'; '.join('`'+x+'`' for x in r['sourcePaths'])+' | '+r['remainingOwner']+': '+r['remainingInput']+' |')
md+=['','| Architecture obligation | Prepared artifact / section | Implementing evidence | Remaining owner and input |','|---|---|---|---|']
for r in tr['story010Obligations']:md.append('| '+r['id']+' | '+'; '.join('`'+x+'`' for x in r['artifacts'])+' — '+'; '.join(r['sections'])+' | '+'; '.join('`'+x+'`' for x in r['implementingEvidence'])+' | '+r['remainingOwner']+': '+r['remainingInput']+' |')
md+=['','Current documentary carries remain in traceability.json: VIDEO-LOGGING local proof resolved by 013 with disclosure application owed; CACHE-REAUTH and AUDIT-LABEL-PRIVACY remain open; EXTERNAL-READINESS preserves F01–F04; RECORDING-RUNBOOK-COPY keeps neutral operator wording while shipped UI copy remains unchanged. Earlier PM AC-24 carrier choice is recorded only; PO application remains pending.','','Current scope keeps F05–F09 and pending R5 decisions as the README records them, without expanding this wave. The 015 row-85 Option C waiver covers only the actual-run positive equal full-key timing-tie clause; all other timing/video/seek obligations stay required. The 009 C8 waiver never transfers to 011 fresh backend check plus JaCoCo. No tests/assertions/skips/timeouts/default4000/Order17 are changed. ADR-SC-006 applies. Pilot results stay NOT_RUN and unassigned. No new process, runtime, source-window or release authority follows.']
write(Path('traceability.md'),'\n'.join(md)+'\n')
# Capture narrowly named implementing evidence only; no runtime/protected capture paths.
evidence_paths=[
'backend/src/main/resources/application.yml',
'backend/src/main/java/com/citi/put/checks/scheduling/partitioning/RetentionPruner.java',
'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationProperties.java',
'backend/src/main/java/com/citi/put/checks/studio/secrets/StudioSecretsService.java',
'backend/src/main/java/com/citi/put/checks/studio/secrets/HashicorpStudioVaultProvider.java',
'frontend/src/components/studio/guided/guidedNarratives.ts',
'helm-chart/put-checks/values.yaml','helm-chart/put-checks/values-uat.yaml','studio-runner/Dockerfile',
'docs/specs/studio-observed-authoring/guided-data-flow.md',
'docs/qa/evidence/STUDIO-OBS-009/execution-20261018/d2/rotation-and-cert-inputs.md',
'docs/qa/evidence/STUDIO-OBS-009/prep-20261016/prerequisite-register.json',
'docs/runbooks/studio-runner.md',
'docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json',
'docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/finalize-record.md']
for p in evidence_paths:read(p)
release=load(SELECT/'release-evidence-map.json');release=json.loads(remap(json.dumps(release,ensure_ascii=False)))
for r in release:
 for p in r['sourcePaths']:
  if p.startswith(str(OUT)): continue
  if p.startswith('docs/qa/gates/'):read(p)
jwrite(Path('release-evidence-map.json'),release)
write(Path('source-checks.md'),'''# Selective public-source checks — 2026-10-20 UTC

This is documentary verification only. Input hashes bind the selected source bytes; neither them nor earlier QA records grant a source window or current runtime credit.

| Claim | Source checked | Result / limit |
|---|---|---|
| Translation and authored nonsecret switches | `GuidedTranslationProperties.java` | Both default true; application/environment lists default empty, so flags alone do not grant a scope. Runbook now names the exact allow-authored-nonsecret key. |
| Publication / replay / kill switch | `backend/src/main/resources/application.yml` | `studio.guided.publication.enabled`, `studio.observed-replay.enabled` and `studio.execution.enabled` default true. Guided chart enablement remains separate. |
| UAT render defaults | `helm-chart/put-checks/values-uat.yaml` and D2 rotation record | Observed validation/replay true; guided false; two runner replicas; trusted catalog/policy and TLS pin/Secrets still required. No render/deployment was performed. |
| Q3 audit | `application.yml`; `RetentionPruner.java` | 12-month partition-retention default and `studio_secret_use_audit` membership. Monthly pruning is not exact per-row expiry or SIEM evidence. |
| Observation/video retention / F01 | `application.yml`; `guided-data-flow.md` §3.3 | Separate 30-day defaults, qualified terminal/expiry pruning, indefinite non-AC3 stores and conditional S&C follow-up. No physical deletion proof. |
| Secret bound / create | `StudioSecretsService.java`; `HashicorpStudioVaultProvider.java` | 4096 UTF-16 units, exact create fields and create-only `cas=0`. Actual scoped platform Vault policy remains unrun. |
| Dump controls | `values.yaml`; `studio-runner/Dockerfile` | Explicit JVM no-heap/core flags and runner `ulimit -c 0`. Backend process core rlimit, operator/host restrictions and deployed effect remain owed. |
| TLS / certificate / issuer rotation | D2 `rotation-and-cert-inputs.md`; runner runbook §14 | Inputs and restart/drain requirements are recorded source/render evidence. Shared certificates, pins, token propagation, EKU/SAN/CA and actual authenticated-hop proof remain owed. Historical U21 issuer label is mapped to current U23. |
| Policy interim | `guided-data-flow.md` §§4–5; README F02 | Governed learning narrows TrustedPolicy, never widens; replay remains bounded by configured TrustedPolicy. Published replay can outlive governed-origin removal. No policy unification or external acceptance inferred. |
| Shipped008 copy | `guidedNarratives.ts` | Missing-login literal retained including internal backticks; double-backtick Markdown span renders it safely. No struck POLICY_DENIED/pre-Ready drift copy or new UI wording. |
| 012A / 014 gate names | Current exact gate files in manifest | Correct backend-runner-contracts-and-migration-re-baseline and action-safety-and-governance-for-the-learning-run names. Existing gate classifications are historical scoped evidence. |
| AC-24 carrier | Preserved PM decision; actual 10.34 and single-path disposition | Prior PM choice names existing OBS-008 AC-6 only. PO/register application and independent current review remain pending; original checkbox stays unchanged. |

Pending T4 first-learn blank, NTP bound owed to Platform/SRE, U/ED gates, F01–F04 and E1–E8 remain unchanged. This packet supplies no current process state, external approval, benchmark, participant outcome or QA verdict.
''')
# Generate diffs against actual current target bytes; absent targets start at /dev/null.
entries=[];allpatch=[]
for key,target in targets+[('staging-disposition','docs/stories/10.34.story.md')]:
 p=Path(target);exists=p.exists();b=read(p) if exists else b'';out=read(OUT/'preview'/target)
 patch=''.join(difflib.unified_diff(b.decode().splitlines(keepends=True),out.decode().splitlines(keepends=True),fromfile='a/'+target if exists else '/dev/null',tofile='b/'+target))
 write(Path('patches')/(key+'.patch'),patch);allpatch.append(patch)
 entries.append({'target':target,'baseExists':exists,'baseSha256':sha(b) if exists else None,'baseBytes':len(b),'missingBaseRecorded':not exists,'diffFrom':'a/'+target if exists else '/dev/null','preview':str(OUT/'preview'/target),'outputSha256':sha(out),'outputBytes':len(out),'patch':str(OUT/'patches'/(key+'.patch')),'patchSha256':sha(patch.encode()),'applied':False})
write(Path('patches/all-documentation.patch'),''.join(allpatch))
# In-memory reconstruction checks, not application to working tree or project tests.
def reconstruct(base,patch):
 old=base.decode().splitlines(keepends=True); result=[];pos=0;lines=patch.splitlines(keepends=True);i=2
 while i<len(lines):
  m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]);assert m,lines[i]
  start=int(m[1]);count=int(m[2]) if m[2] is not None else 1;anchor=start-1 if count else start
  result.extend(old[pos:anchor]);pos=anchor;i+=1
  while i<len(lines) and not lines[i].startswith('@@ '):
   l=lines[i];tag=l[0];payload=l[1:]
   if tag in ' -':assert old[pos]==payload;pos+=1
   if tag in ' +':result.append(payload)
   i+=1
 result.extend(old[pos:]);return ''.join(result).encode()
checks=[]
for e in entries:
 b=Path(e['target']).read_bytes() if e['baseExists'] else b'';o=(OUT/'preview'/e['target']).read_bytes();p=Path(e['patch']).read_text();assert reconstruct(b,p)==o
 assert (sha(Path(e['target']).read_bytes())==e['baseSha256']) if e['baseExists'] else not Path(e['target']).exists()
 checks.append({'target':e['target'],'inMemoryExactReconstruction':True,'baseFreshAndUnmodified':True,'applicationPerformed':False})
assert (OUT/'preview/docs/stories/10.34.story.md').read_bytes().startswith(base)
assert [r for r in load(arch_path)['obligations'] if r['story']=='010']==load(OUT/'architecture-obligations.json')['obligations']
assert original=={str(p):sha(p.read_bytes()) for p in OLD.rglob('*') if p.is_file()}
jwrite(Path('applicability.json'),{'method':'Parse generated exact-path unified hunks and reconstruct outputs in memory; no target writes or git apply','targets':checks,'originalDraftTreeFilesCompared':len(original),'originalDraftTreeUnchanged':True,'architectureRowsUnchanged':21,'RBRRowsMapped':19,'storyAppendPreservesEntireCurrentBasePrefix':True,'projectTestsRun':False})
write(Path('receipt.md'),'''# STUDIO-OBS-010 documentation receipt — 2026-10-20 UTC

Prepared five unapplied eventual-target previews and five exact-path patches plus a combined patch. The 10.34 preview preserves the entire actual current story as its byte-identical prefix and appends a dated proposal. Missing intended targets use `/dev/null`; manifest rows record each absence explicitly.

All 21 architecture obligation objects were freshly extracted unchanged from the named review JSON and mapped with owners, inputs and evidence; all RBR-01–19 have section/evidence/owner/input mappings. Editorial spacing and the temporary typo are corrected. Exact 012A/014 gate paths and render-safe shipped login copy are retained. Selective public-source checks distinguish defaults and local configuration from deployed proof. Five participant slots remain UNASSIGNED, observations/denominators NOT_RUN, attempt/focus forms header-only, and measured p95 blank with pending T4. Earlier bounded PM carrier placement is evidence only; PO application remains pending.

Documentary integrity verification reconstructed each output from its actual base and patch entirely in memory and checked actual bases stayed unchanged. The original draft tree stayed byte-identical. These checks establish patch applicability to the captured bytes only. No project tests/builds, target application, runtime/resource operations, contacts, network calls, lifecycle/QA verdict or external grant occurred. Independent PM/QA review remains for the coordinator.

Base hashes are freshness checks, never source-window authorization. Current original Gateway handle remains unavailable; original wrapper/shell liveness is relayed metadata, not restored I/O or completion. Freeze persists. Pending 009 benchmark/deployment, real pilot, post-009-Done list re-date/PM acceptance, F01–F04/U/ED gates, NTP bound, actual held closure, fresh backend check+JaCoCo before 011 credit and final affected suites all remain owed. C8/GST stays parked, all user deferrals stand, and no accessibility work is added.

`manifest.json` records base/output/patch/input hashes. `SHA256SUMS` seals every packet payload including the manifest and this receipt; the checksum file excludes itself. This seal is integrity evidence and supplies no review acceptance or execution authority.
''')
# No manifest self-reference: inputs omit own package outputs; output table seals payloads except manifest/checksum.
inputs={k:v for k,v in inputs.items() if not k.startswith(str(OUT))}
outputs=[{'path':str(p),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in sorted(OUT.rglob('*')) if p.is_file() and p.name not in ['manifest.json','SHA256SUMS']]
jwrite(Path('manifest.json'),{'kind':'STUDIO_OBS_010_DOCUMENTATION_PREPARATION','createdAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'author':'Atlas / aiox-analyst','exclusiveWriteRoot':str(OUT),'selectedDraft':str(SELECT),'applied':False,'isVerdict':False,'independentCurrentReview':'PENDING root routes PM and QA','hashesAuthorizeSourceWindow':False,'targets':entries,'inputs':list(inputs.values()),'outputs':outputs,'checksumSelfExclusion':'SHA256SUMS excludes only itself; manifest excludes itself and checksum from its output table','originalDraftFilesCompared':len(original),'originalDraftUnchanged':True})
write(Path('SHA256SUMS'),''.join(sha(p.read_bytes())+'  '+str(p.relative_to(OUT))+'\n' for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='SHA256SUMS'))
print(json.dumps({'output':str(OUT),'targets':len(entries),'architectureRows':21,'RBRRows':19,'outputsSealed':len(outputs)+1,'originalDraftFilesUnchanged':len(original),'manifestSha256':sha((OUT/'manifest.json').read_bytes()),'checksumSha256':sha((OUT/'SHA256SUMS').read_bytes())},indent=2))
