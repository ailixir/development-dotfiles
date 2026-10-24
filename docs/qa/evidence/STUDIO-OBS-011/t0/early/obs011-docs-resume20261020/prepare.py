"""Create off-tree doc previews and check exact unified patches in memory only."""
from pathlib import Path
import difflib,hashlib,json,os,re
D=Path(__file__).absolute().parent;R=D.parents[6]
assert (R/'AGENTS.md').is_file()
assert not D.is_symlink()
# Refuse every prior output, including partial output; never overwrite a sealed packet.
assert sorted(p.name for p in D.iterdir()) == ['prepare.py'], 'Existing output: preserve and inspect before resuming'
OWNED_INPUT_SHA256='c2d50b9a94d8c5348d9387942f49f50a5c8523019f350c819ac6696558c7fb65'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
rows=[];patches=[];pending=[]
TARGETS={'frontend/README.md','CLAUDE.md','AGENTS.md','ARCH.md','studio-runner/README.md','docs/runbooks/studio-runner.md'}
inputs={}
def read(path):
 raw=(R/path).read_bytes();inputs[path]=raw
 return raw.decode()
def replace(text,old,new):
 assert text.count(old)==1,old[:100]
 return text.replace(old,new)
def save(path,text,items):
 assert path in TARGETS and not (R/path).is_symlink()
 base=inputs[path];assert (R/path).read_bytes()==base
 out=text.encode();assert base!=out
 preview=D/'preview'/path
 patch=''.join(difflib.unified_diff(base.decode().splitlines(True),text.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
 target=D/'patches'/(path.replace('/','__')+'.patch')
 # Apply the exact patch to read-only target bytes in memory; never write targets.
 lines=base.decode().splitlines(True);result=[];cursor=0;delta=0
 chunks=patch.splitlines(True);i=2
 while i<len(chunks):
  h=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*\n',chunks[i]);assert h
  begin=int(h[1])-1;result.extend(lines[cursor:begin]);cursor=begin;i+=1;old_count=new_count=0
  while i<len(chunks) and not chunks[i].startswith('@@ '):
   line=chunks[i];tag=line[0];value=line[1:]
   if tag in (' ','-'):assert lines[cursor]==value;cursor+=1;old_count+=1
   if tag in (' ','+'):result.append(value);new_count+=1
   i+=1
  assert old_count==int(h[2] or 1) and new_count==int(h[4] or 1)
 result.extend(lines[cursor:]);assert ''.join(result).encode()==out
 assert (R/path).read_bytes()==base
 rows.append(dict(path=path,items=items,baseSha256=sha(base),outputSha256=sha(out),baseBytes=len(base),outputBytes=len(out),preview=str(preview.relative_to(D)),patch=str(target.relative_to(D)),patchSha256=sha(patch.encode()),patchApplicableToExactReadOnlyBase=True,sharedTargetUnchanged=True))
 patches.append(patch)
 pending.append((path,base,out,preview,target,patch))

# Bounded public-source checks only: no process, browser, build, test or network work.
source_checks={
 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md':['6. **AC-6','### Carried forward — lean execution decision (2026-10-19)','**C-OBS009-3, runner README and runbook'],
 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md':['| CLN-50 |','| CLN-51 |'],
 'docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f-merge/prep-devops/receipt.md':['- **F1.**','- **F2.**'],
 'frontend/vite.config.ts':['\'/api/v1\'',"env.VITE_API_URL || 'http://localhost:8080'"],
 'frontend/webpack.config.js':["context: ['/api/v1']","process.env.REACT_APP_API_BASE_URL?.replace('/api', '') || 'http://localhost:8080'"],
 'frontend/playwright.config.ts':['No browser service worker exists','real-backend'],
 'frontend/src/services/mocks/studio/server.ts':["from 'msw/node'",'setupServer(...studioHandlers)'],
 'frontend/e2e/mswProxy.ts':['There is no service worker and none is registered.'],
 'studio-runner/src/server/routes.ts':['POST   /v2/validate-observed','POST   /v2/runs','DELETE /v2/runs/{id}','controller-or-self'],
 'studio-runner/src/server/runCoordinator.ts':['validateObservedJob(observedJob,support.build,policy)','pool.tryAcquire()','openEvidenceWindow(ports)','observed.job.inputs','observed.job.secrets'],
 'studio-runner/src/validator/observedReferencePolicy.ts':['export const OBSERVED_LIMITS'],
 'studio-runner/src/validator/observedReplay.ts':['export function validateObservedJob','b.currentPolicyHash','b.replayGrant'],
 'studio-runner/src/run/observedReplayAdapter.ts':['secretRef','passwordControl','scope.allowedOrigins.includes(guard.origin)'],
 'studio-runner/src/executor/observedOperations.ts':['export interface ObservedJob','export interface ExecutionBinding','secretOrigins','currentPolicyHash'],
 'studio-runner/test/isolation.test.ts':['ALLOWED_PRODUCTION_PACKAGES',"'@aws-sdk/client-s3'"],
 'helm-chart/put-checks/templates/studio-runner-networkpolicy.yaml':['put-checks.worker.selectorLabels','put-checks.api.selectorLabels','.Values.backend.service.port','.Values.studioRunner.guided.tlsConnector.port'],
 'helm-chart/put-checks/templates/studio-runner-deployment.yaml':['name: local-object-store','name: guided-tmp','name: guided-journal','mountPath: /tmp'],
 'docs/specs/studio-observed-authoring/secret-login-design.md':['## 0. Decision record','R1–R3 in full (historical)'],
}
for source,anchors in source_checks.items():
 source_text=read(source)
 for anchor in anchors:assert anchor in source_text,(source,anchor)
assert not (R/'frontend/public/mockServiceWorker.js').exists()
assert not (R/'frontend/src/services/mocks/studio/browser.ts').exists()
for retired in ('studio-runner/src/validator/language.ts','studio-runner/fixtures/reference','studio-runner/fixtures/adversarial'):
 assert not (R/retired).exists(),retired

path='frontend/README.md';text=read(path)
text=replace(text,'- **VITE_ALLOW_INSECURE_MSW_FALLBACK**: Enables inline API mock fallback when Service Worker cannot run (for example, untrusted internal CA / insecure browser context).\n  - Default: `true`\n  - Example:\n  ```bash\n  VITE_ALLOW_INSECURE_MSW_FALLBACK=true pnpm start\n  ```\n\n','')
save(path,text,['CLN-50'])
old='''### Mock-First Development
**CRITICAL:** All API interactions use Mock Service Worker (MSW) during development. This enables:
- Independent frontend development without backend dependency
- Full functionality testing with realistic data
- Stakeholder demos before backend completion

Mock handlers are located in `frontend/src/services/mocks/` and provide realistic API responses for all check types, CSI data, and execution results.'''
new='''### API Development and Test Mocks
MSW handlers in `frontend/src/services/mocks/` run in Node: the Vitest server
(`frontend/src/services/mocks/studio/server.ts`) and the Playwright `msw` project proxy
(`frontend/e2e/mswProxy.ts`). The browser registers no mock service worker.

Development servers proxy `/api/v1` to the backend. Vite uses `VITE_API_URL`; Webpack
uses `REACT_APP_API_BASE_URL` with `/api` removed. Both default to `http://localhost:8080`.
The Playwright harness points Vite at its Node mock proxy or the selected real backend.'''
for path in ('CLAUDE.md','AGENTS.md'):
 text=read(path);text=replace(text,old,new)
 text=replace(text,'- Environment variables in `.env.development` control MSW enablement and API URLs','- Environment variables in `.env.development` configure API URLs; MSW runs in the Node test harnesses above.')
 save(path,text,['CLN-51'])
path='ARCH.md';text=read(path)
text=replace(text,'   - Browser-intercepted API layer providing realistic responses during development','   - Node-side API mocks in the Vitest server and Playwright `msw` project proxy; no browser service worker')
text=replace(text,'   - Enables full application functionality without backend dependency','   - Tests use realistic handlers without a backend; development servers proxy `/api/v1` to the configured backend')
text=replace(text,'   - Mock-first development using MSW for all API interactions','   - MSW runs in Node for unit/E2E tests; Vite uses `VITE_API_URL` and Webpack uses `REACT_APP_API_BASE_URL` with `/api` removed (both default to `http://localhost:8080`)')
plan='- **Implementation:** We will use **Mock Service Worker (MSW)**. MSW intercepts outgoing requests from the browser, allowing the UI to be fully developed without any dependency on a live backend.'
text=replace(text,plan,plan+'\n\n> **Current implementation note — 2026-10-20 (STUDIO-OBS-011, CLN-51).** The preceding browser-interception sentence is historical plan text. The current frontend registers no browser worker. MSW runs in Node through `frontend/src/services/mocks/studio/server.ts` (Vitest) and `frontend/e2e/mswProxy.ts` (Playwright). Development servers proxy `/api/v1` to the backend as described in §2.1.')
save(path,text,['CLN-51'])

path='studio-runner/README.md';text=read(path)
text=replace(text,'component that ever launches Chromium, and the only one that reads an LLM-proposed artifact.','component that launches Chromium and validates data-only observed artifacts against their retained evidence.')
text=replace(text,'## What ships today (stories 10.2, 10.3, 10.6)','## What ships today')
text=replace(text,'| `src/validator/` | Artifact envelope checks, default-deny AST validation, argument/reference schemas, bounds. Pure and browser-free. |','| `src/validator/` | Closed observed schemas, immutable evidence/history checks, policy and replay validation; pure and browser-free. |')
text=replace(text,'| `src/executor/` | Trusted executor over a `BrowserAdapter`, `StepReporter` and `ValueResolver`, with outbound redaction. |','| `src/executor/` | Trusted data-only observed replay operations, step reporting and outbound redaction. |')
text=replace(text,'| `src/server/` | The four internal HTTP routes, the capacity pool, the service-identity check, bounded bodies and structured redacted logging. |','| `src/server/` | Internal observed validation/run/cancel and health routes, the optional guided bridge, capacity, peer/service identity, bounded bodies and redacted logging. |')
text=replace(text,'Not yet present: `src/evidence/` (10.14). Uploading a recording, the durable result manifest and\nthe `STORED` evidence state are 10.14\'s; a recording still lives and dies in scratch.','Evidence upload and durable result manifests are implemented under `src/run/`\n(`evidenceUpload.ts`, `manifest.ts` and the object-store adapters). `STORED` follows an\nacknowledged write; scratch is cleared after the bounded evidence window.')
start=text.index('## What a resolved value may touch');end=text.index('## The real browser',start)
text=text[:start]+'''## What a resolved value may touch

An observed replay job carries authored `inputs`, resolved `secrets` and `secretOrigins` for
run-scoped use. Never persist resolved values in jobs, retry queues, manifests or diagnostics.

**Observed job validation comes before capacity and admission.** `runCoordinator` validates
the closed observed job against its build identity and policy before reserving a slot.
The child-output relay and report paths use the run's redactor. After the bounded evidence
phase, the coordinator clears scratch and wipes input and secret values before terminal
delivery. The former artifact-1 `resolvedVars` correspondence validator is retired.

'''+text[end:]
text=replace(text,'and drain. **The recording is deleted with it.** Until story 10.14 uploads it, no file survives the\nrun; the runner reports `PENDING` because the evidence is real and unstored, not because something\nis being kept.','and drain. The bounded evidence window uploads the recording and durable result manifest\nbefore scratch is cleared; an acknowledged object write earns `STORED`. Upload failure is\nreported without replacing a known assertion outcome.')
text=text.replace('/v1/validate','/v2/validate-observed').replace('/v1/runs','/v2/runs')
text=replace(text,'| `POST /v2/validate-observed` | Browser-free wrapper over `validateArtifact` with bounded work. Takes **no capacity slot**, so it answers while the pool is saturated. |','| `POST /v2/validate-observed` | Browser-free observed validation against immutable evidence and policy; takes no capacity slot. |')
text=replace(text,'| `POST /v2/runs` | Envelope → artifact → capacity slot → admission CAS → `202`. Nothing starts before the CAS succeeds. |','| `POST /v2/runs` | Closed observed job → capacity slot → observed admission → `202`; no browser starts before admission. |\n| `DELETE /v2/runs/{id}` | Cancels an admitted run through ordered stop, bounded grace and process-tree observation. |')
text=replace(text,'All four require a restricted service identity in an `Authorization: Bearer` header, checked on the\nrequest head before the body is read, compared in constant time over SHA-256 digests. There is no\ncredential in any URL or query string, inbound or outbound.','The TLS listener requires a CA-verified client certificate. Replay routes pin the backend peer\nbefore checking the service bearer on the request head; exec health probes accept the\ncontroller or self peer. The optional guided bridge has its own peer pin and JWT. There is\nno credential in a URL or query string.')
text=replace(text,'npm run test:fixtures  # fixture tier; the reference corpus against fixtures/pages/','npm run test:fixtures  # real-browser observed replay and controlled-page fixtures')
start=text.index('Generated source is **never evaluated**.');end=text.index('### Secrets',start)
text=text[:start]+'''Observed artifacts are data. Closed schemas and independent evidence/policy checks derive
the permitted replay plan; the trusted executor performs its typed operations. The retired
artifact-1 TypeScript AST language is no longer an execution path. Dynamic evaluation of
artifact content remains forbidden by the boundary lint and emitted-output checks.

Validation cannot establish an author's intent or replace destination and secret-use policy.
Those controls remain mandatory at their existing boundaries.

'''+text[end:]
start=text.index('A secret appears in an artifact only as');end=text.index('On the outbound path',start)
text=text[:start]+'''Observed login uses a `secretRef` in a `fill.value` operation and the trusted
password-control path. The adapter checks the origin and permitted operation before the
fill. Secret values are run-scoped, and outbound diagnostics pass through the redactor.
See [secret-login-design.md](../docs/specs/studio-observed-authoring/secret-login-design.md)
for the login boundary and residuals. Redaction covers known values; it is not proof that
arbitrary authored text contains no credential.

'''+text[end:]
text=replace(text,"equal an enumerated list — today `playwright`,\n   `playwright-core` and `typescript`. **Any** package not on the list fails, whatever it is.","equal the explicit list in `test/isolation.test.ts`, including Playwright, TypeScript and\n   the S3 SDK's allowed runtime dependencies. **Any** package not on the list fails, whatever it is.")
start=text.index('## Bounds (AC-10 defaults)');end=text.index('## Versions',start)
text=text[:start]+'''## Current validation bounds and fixtures

Observed byte limits are defined by `OBSERVED_LIMITS` in
`src/validator/observedReferencePolicy.ts`; the packaged closed schemas and trusted replay
policy provide the remaining validation bounds. The retired artifact-1 AST bounds,
accepted-language table and `fixtures/reference` / `fixtures/adversarial` corpora do not
apply to this path.

`fixtures/lint/` retains the boundary-rule proving inputs. `fixtures/pages/` supplies
controlled local pages for the real-browser tier. The observed schema/reference bundles
and replay fixtures are described under [Observed replay](#observed-replay-artifact-2).

'''+text[end:]
start=text.index('4. **Run both corpora**');end=text.index('5. **Compatibility',start)
text=text[:start]+'''4. **Run the current unit and real-browser tiers** — `npm test` and `npm run test:fixtures`
   inside the pinned image. Use the observed validation/replay and controlled-page fixtures;
   the deleted artifact-1 corpora cannot establish current compatibility.
'''+text[end:]
text=replace(text,'7. **Never rewrite approved source.** A revision is recompiled only by an explicit, reconfirmed\n   authoring action. An upgrade does not silently reinterpret an artifact under the new runtime,\n   and a vulnerable runtime is not kept alive to preserve replay.','7. **Never rewrite approved source.** A new observed revision requires explicit learning and\n   publication. An upgrade does not silently reinterpret an artifact under the new runtime;\n   the exact supported build tuple governs replay compatibility.')
text=replace(text,' Legacy artifact 1 validation, AST semantics and protocol 1 remain separate.',' Artifact-1 validation, AST execution and protocol-1 routes were removed by STUDIO-OBS-012A.')
save(path,text,['C-OBS009-3/F1'])

path='docs/runbooks/studio-runner.md';text=read(path)
marker='> ## Read this before anything else: what is still open'
note='''> **Documentation correction — 2026-10-20 (STUDIO-OBS-011, C-OBS009-3).** Current chart
> source confirms the writable mounts in §1 and the API/worker ingress plus guided callback
> connector in §2 below. This is a bounded source recheck, not deployed validation or a new
> full-system audit. The dated audit rows above and superseded §12(e) remain historical;
> §14's external prerequisites and unmeasured limits remain open.

'''
text=replace(text,marker,note+marker)
text=replace(text,'single-keyed `seccompProfile`, and exactly two writable mounts: an `emptyDir` covering the per-run\nscratch directory and an in-memory `/dev/shm`. There is **no chart path that renders a','single-keyed `seccompProfile`, and writable scratch plus in-memory `/dev/shm` mounts. The\n`local` evidence provider adds its shared object-store mount; guided mode adds `/tmp` and\nthe guided journal mount. TLS, trust and guided credential mounts are read-only. There is **no chart path that renders a')
text=replace(text,'| Ingress | the **worker** pods only, on the runner\'s Service port | §8.4: the internal routes are not public and the MFE never talks to the runner. Dispatch runs on the worker profile, not the API\'s |','| Ingress | the **API and worker** pods, on the runner\'s Service port | Internal validation, replay and guided calls; the MFE never talks to the runner |')
text=replace(text,'| Egress | the **API** pods, on the API Service port | `callback-api`: admission and progress. Without this the terminal report never arrives |','| Egress | the **API** pods, on `backend.service.port`, plus `studioRunner.guided.tlsConnector.port` while guided mode is on | `callback-api`: replay admission/progress use the ordinary API port; guided claim/callbacks use the separate TLS connector (§14.2) |')
text=replace(text,'''**Audit trail, ADR-002 O-6.** The **dispatch policy identity** story 10.7 records on the execution
is what joins *a run* to *the policy it ran under*. Whichever way SPK-05 rules, that is the field to
read when asked "what was this run allowed to reach?". **No approved-target or secret-use policy
field exists on the job envelope**, and adding one is ADR-002 **Class B** — @architect's ruling
first, a story implements after. A story that adds it without the ruling is the thing the runner's
gate-shut tripwire exists to catch.''','''**Current observed authorization.** The job's `binding` carries `scope`, `scopeHash`,
`currentPolicyHash` and `replayGrant`; `secretOrigins` accompanies the resolved secrets.
`validateObservedJob` checks these bindings against the artifact and trusted policy before
admission. The dispatch policy identity remains audit context; it does not replace these checks.
See `studio-runner/src/validator/observedReplay.ts` and `src/executor/observedOperations.ts`
under the same runner directory.''')
oldgap='''- §2 (egress) describes the `callback-api` destination class as the API's HTTP port. With guided
  mode on, the same class also covers the connector port (a second port on the same rule; the
  replay callback stays on the first). The runner NetworkPolicy and its test already say so; §2's
  prose was not rewritten.'''
text=replace(text,oldgap,'''- **2026-10-20 documentation correction:** §2 now includes the guided connector port in
  `callback-api`, with API and worker ingress matching the chart. This source recheck supplies
  no cluster/CNI enforcement evidence; the G-4/SPK-05 obligations remain.''')
save(path,text,['C-OBS009-3/F2'])

historical='docs/specs/studio-observed-authoring/account-provider-readiness-design.md'
read(historical);base=inputs[historical]
assert base.startswith(b'> **SUPERSEDED') and b'nothing below is normative' in base.splitlines()[0]
noop=dict(path=historical,item='AC-6 historical header',disposition='NO_OP_ALREADY_CORRECT',sha256=sha(base),reason='Existing2026-10-09 SUPERSEDED header links canonical secret-login-design.md and states R1-R3 are history/non-normative; §0 independently confirms full supersession.')
assert {row['path'] for row in rows}==TARGETS
# Source and target assertions all finish before any preview is written.
for path,raw in inputs.items():assert (R/path).read_bytes()==raw,('Input changed during preparation',path)
for path,base,out,preview,target,patch in pending:
 preview.parent.mkdir(parents=True,exist_ok=True)
 target.parent.mkdir(exist_ok=True)
 with preview.open('xb') as f:f.write(out)
 with target.open('x') as f:f.write(patch)
with (D/'all.patch').open('x') as f:f.writelines(patches)
with (D/'disposition.json').open('x') as f:json.dump(dict(kind='OBS011_DOCS_OFFTREE_PREVIEWS_ONLY',dated='2026-10-20',changes=rows,noops=[noop],excludedParallelPath='docs/runbooks/studio-guided-authoring.md',historicalPreservation='ARCH planned browser-interception sentence and runbook historical audit/§12e preserved with dated correction notes',leanDeferredItemsUntouched=['C-OBS008-2 Javadoc','C-OBS008-3 citation metadata'],sharedDocumentationApplied=False,generatedOutputsChanged=False,behaviorPolicyLifecycleChanged=False,buildsTestsNetworkRuntimeExecuted=False,integrationAndIndependentReviewOwed=True,perItemDisposition={'CLN-50':'PREPARED removal of obsolete fallback env-var prose only','CLN-51':'PREPARED Node-only MSW and dev proxy factual prose; preserve historical plan with dated note','C-OBS009-3/F1':'PREPARED retired artifact-1 README removal and current observed references','C-OBS009-3/F2':'PARTIAL_PREPARATION: source-checked writable mounts, ingress, callback connector and observed job policy facts; no full sections 1-3/5-13 audit or deployed validation claimed','AC-6 historical header':'NO_OP_ALREADY_CORRECT'},resumption={'priorOwnedGeneratorSha256':OWNED_INPUT_SHA256,'priorOutputsAtStart':['prepare.py'],'generatorRepairedBeforeExecution':True,'failuresBeforeResumption':'Unknown; no prior manifest, patch or preview was present','readOnlyDiscoveryMisses':['helm/ path does not exist; actual path is helm-chart/put-checks','observedPlaywright.ts and observedAdapter.ts do not exist; rg --files identifies observedReplayAdapter.ts','zsh glob docs/qa/evidence/STUDIO-OBS-011/t0/early/*.md matched no files'],'noFailedSourceAssertionInSuccessfulPreparation':True},inputs=[dict(path=path,sha256=sha(raw),bytes=len(raw),anchors=source_checks.get(path,[])) for path,raw in sorted(inputs.items())]),f,indent=2);f.write('\n')
with (D/'receipt.md').open('x') as f:f.write('''# STUDIO-OBS-011 documentation preparation

Six shared-file previews and exact-path unified patches are prepared off-tree only. Every
patch was applied in memory to its exact read-only base bytes and matched its preview hash.
No shared documentation was edited. No story credit, lifecycle change or QA verdict is claimed.

- AC-6 historical account/provider header: already correct; no-op.
- CLN-50: remove the unused frontend fallback-variable documentation.
- CLN-51: describe Node-only MSW and current dev proxies; retain ARCH plan history with a dated note.
- C-OBS009-3/F1: remove retired artifact-1 engine instructions and correct their current observed references.
- C-OBS009-3/F2: prepare factual mount, ingress, callback-port and observed-policy corrections.
  This bounded source recheck does not establish the requested full §§1–3/5–13 runbook audit.
  The older audit rows and superseded §12(e) remain historical, and §14 residuals stay open.

Root owns integration after resource/source release and independent review. The fresh backend
check plus JaCoCo prerequisite and final affected suites remain owed. No builds, tests, network,
runtime operations, private captures, protected baselines or resource operations were used.
The parallel `docs/runbooks/studio-guided-authoring.md` and source08b/010 packets were untouched.
Lean-deferred Javadoc and narrative extraction work was not performed.

`disposition.json` records exact base/output hashes, per-item status, read-only source hashes,
the recovered generator hash and harmless discovery misses. `manifest.json` seals this packet.
''')
for path,raw in inputs.items():assert (R/path).read_bytes()==raw,('Input changed before seal',path)
files=[dict(path=str(path.relative_to(D)),sha256=sha(path.read_bytes()),bytes=path.stat().st_size) for path in sorted(D.rglob('*')) if path.is_file()]
with (D/'manifest.json').open('x') as f:json.dump(dict(status='SEALED_PREPARATION_ONLY_NOT_APPLIED_OR_APPROVED',files=files,allExactPatchesApplicable=True,sharedTargetWrites=0),f,indent=2);f.write('\n')
print(json.dumps(dict(pid=os.getpid(),parentPid=os.getppid(),changedPreviews=len(rows),alreadyCorrectNoops=1,allExactPatchesApplicable=True,sharedTargetWrites=0)))
