"""Static text transformation only: never imports or executes product code."""
import ast, difflib, hashlib, json, pathlib, re, subprocess
ROOT=pathlib.Path.cwd()
OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft'
REPO=OUT/'repo'
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=[]
def emit(path,text,scope='11-FE v4'):
    src=ROOT/path; before=src.read_text() if src.exists() else ''
    dst=REPO/path; dst.parent.mkdir(parents=True,exist_ok=True); dst.write_text(text)
    patch=''.join(difflib.unified_diff(before.splitlines(True),text.splitlines(True),fromfile='a/'+path if src.exists() else '/dev/null',tofile='b/'+path))
    pp=OUT/'patches'/(path+'.patch'); pp.parent.mkdir(parents=True,exist_ok=True); pp.write_text(patch)
    manifest.append(dict(path=path,scope=scope,operation='edit' if src.exists() else 'add',sourceSha256=sha(src.read_bytes()) if src.exists() else None,draftSha256=sha(dst.read_bytes()),patch=str(pp.relative_to(OUT)),patchSha256=sha(pp.read_bytes())))
    return text
G='frontend/src/components/studio/guided/'
original=(ROOT/G/'guidedNarratives.ts').read_text()
start=original.index('export const GUIDED_COPY = {')
end=original.index('} as const satisfies Readonly<Record<string, GuidedCopy>>;',start)
body=original[start:end]
# Each entry's first field is a single quoted template expression. Preserve its exact token bytes.
pat=re.compile(r"(?m)^  (\w+): \{\n(    template:\s*((?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")),\n)")
entries=list(pat.finditer(body))
assert len(entries)==len(re.findall(r'(?m)^  \w+: \{',body))
templates={m[1]:m[3] for m in entries}
keys=list(templates)
registry_body=body.replace('export const GUIDED_COPY = {','export const GUIDED_COPY_SOURCES = {',1)
registry_body=pat.sub(lambda m:'  '+m[1]+': {\n',registry_body)
# Everything from the citation paths through the delegated citation is copied without values changing.
metadata_prefix=original[original.index('/** Repository-relative paths'):start]
metadata_prefix=re.sub(r'export interface GuidedCopy \{\n  /\*\* The text,.*?readonly template: string;\n', 'export interface GuidedCopySource {\n', metadata_prefix, flags=re.S)
assert 'readonly template:' not in metadata_prefix
registry="""import type { GuidedCopyKey } from './guidedNarratives';

/**
 * Test-only citation registry for the guided copy table (C-OBS008-3).
 * Runtime templates and fill-ins remain in guidedNarratives.ts. Each source quote, adaptation,
 * delegation and fact is preserved here for the existing copy-table tests to verify from disk.
 * Keep authoredLiteralTargetNotFound here and at runtime until the separate AE-01 owner removes
 * the pair together (R-08-3). Production modules must never import this test support module.
 */

"""+metadata_prefix+registry_body+'} as const satisfies Readonly<Record<GuidedCopyKey, GuidedCopySource>>;\n'
emit(G+'guidedCopySources.test-support.ts',registry)
runtime=original[:original.index('/**\n * Every sentence')]+"""/** Runtime guided copy templates; citation metadata is held in test support (C-OBS008-3). */
export interface GuidedCopy {
  /** The text, with `{token}` where a value is filled in. Backticks mark inline code. */
  readonly template: string;
}

export const GUIDED_COPY = {
"""+''.join('  '+m[1]+': {\n'+m[2]+'  },\n' for m in entries)+original[end:]
emit(G+'guidedNarratives.ts',runtime)
test=(ROOT/G/'guided.test.tsx').read_text()
test=test.replace('  type GuidedCopy,\n','  type GuidedCopy,\n  type GuidedCopyKey,\n')
test=test.replace("} from './guidedNarratives';", "} from './guidedNarratives';\nimport { GUIDED_COPY_SOURCES, type GuidedCopySource } from './guidedCopySources.test-support';",1)
test=test.replace('const ENTRIES = Object.entries(GUIDED_COPY) as Array<[string, GuidedCopy]>;',"""const ENTRIES = (Object.entries(GUIDED_COPY) as Array<[GuidedCopyKey, GuidedCopy]>).map(
  ([key, entry]): [string, GuidedCopy & GuidedCopySource] => [key, { ...entry, ...GUIDED_COPY_SOURCES[key] }],
);""")
test=test.replace("describe('copy table: every guided string traces to a quoted source', () => {", """describe('copy table: every guided string traces to a quoted source', () => {
  it('citation registry has exactly the runtime copy keys', () => {
    expect(Object.keys(GUIDED_COPY_SOURCES).sort()).toEqual(Object.keys(GUIDED_COPY).sort());
  });
""",1)
emit(G+'guided.test.tsx',test)
p='frontend/src/components/studio/evidence/pinnedVideoEvidenceFacts.ts';s=(ROOT/p).read_text(); s=s[:s.index('/**\n * The stopped-run line')];emit(p,s)
p='frontend/src/services/mocks/studio/handlers.ts';s=(ROOT/p).read_text().replace('`secretId`, falling back to its name); only a supplied value\'s presence is read and no value is','`secretId` only); only a supplied value\'s presence is read and no value is').replace('const id = variable.secretId ?? variable.name;','const id = variable.secretId;');emit(p,s)
p='frontend/src/services/mocks/studio/studioHandlers.test.ts';s=(ROOT/p).read_text();anchor="  it('validate-variables refuses an id the caller cannot read with the same 403 as the read', async () => {"; assert anchor in s
addition='''  it('validate-variables reports a secretRef matched only by name as undeclared when secretId is absent', async () => {
    const created = await studioApi.createTest({
      ...baseRequestFor('Name-only secret declaration'),
      steps: authored('Type <secret PW> into "Password"'),
      variables: [{ name: 'PW', kind: 'secretRef' }],
    });

    const report = await studioApi.validateVariables(created.id, {});
    expect(report).toEqual({
      testId: created.id,
      isValid: false,
      valid: false,
      hasVariables: true,
      missing: ['<secret PW>'],
      undeclared: ['<secret PW>'],
      unvalued: [],
      conflicting: [],
      unused: [],
    });
    const after = await studioApi.getTest(created.id);
    expect(after.sourceRevision).toBe(created.sourceRevision);
    expect(after.variables).toEqual(created.variables);
  });

  it('validate-variables matches a secretRef by its actual secretId when its name differs', async () => {
    const created = await studioApi.createTest({
      ...baseRequestFor('Actual secretId declaration'),
      steps: authored('Type <secret PW> into "Password"'),
      variables: [{ name: 'PASSWORD_ALIAS', kind: 'secretRef', secretId: 'PW' }],
    });

    const report = await studioApi.validateVariables(created.id, {});
    expect(report).toEqual({
      testId: created.id,
      isValid: true,
      valid: true,
      hasVariables: true,
      missing: [],
      undeclared: [],
      unvalued: [],
      conflicting: [],
      unused: [],
    });
    const after = await studioApi.getTest(created.id);
    expect(after.sourceRevision).toBe(created.sourceRevision);
    expect(after.variables).toEqual(created.variables);
  });

'''
s=s.replace(anchor,addition+anchor,1);emit(p,s)
p='frontend/src/test/a11y/studioWcagAudit.test.tsx';s=(ROOT/p).read_text().replace('readyDraft, unlearnedDraft','readyDraft');s=s.replace("  'ChecksStudioPage/compile-review': {},\n",'').replace("  'ChecksStudioPage/confirm': {},\n",'');start=s.index('  // Regression guard only (STUDIO-OBS-012B');end=s.index("  it('surface 6",start);s=s[:start]+'''  // CLN-11 / R-11: duplicate pair, unlearned state no longer scanned, accepted under ADR-SC-006.

'''+s[end:];emit(p,s)
p='frontend/README.md';s=(ROOT/p).read_text();start=s.index('- **VITE_ALLOW_INSECURE_MSW_FALLBACK**:');end=s.index('Notes:',start);s=s[:start]+s[end:];emit(p,s)
p='frontend/src/components/studio/runs/RunDetailsDrawer.tsx';s=(ROOT/p).read_text();assert s.count('Confirmed revision:')==1;emit(p,s.replace('Confirmed revision:','Learned revision:'))
p='frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx';s=(ROOT/p).read_text();assert s.count('Confirmed revision:')==1;emit(p,s.replace('Confirmed revision:','Learned revision:'))
# Root approved the exact four-line barrel deletion in v5; no other barrel change.
p=G+'index.ts';s=(ROOT/p).read_text();before=s
for name in ['COPY_SOURCE_FILES','CopyBasis','CopySource','CopySourceFile']:
    s=s.replace('  '+name+',\n','')
companion=''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile='a/'+p,tofile='b/'+p))
(OUT/'required-barrel-companion.patch').write_text(companion)
emit(p,s,scope='11-FE v5 rootFEBarrelAmendment; exact four metadata re-exports only')
(OUT/'copy-back-manifest.json').write_text(json.dumps(dict(status='UNAPPLIED_DRAFT_NOT_EXIT_SUCCESS',actualSourceWrites=False,entries=manifest,approvedBarrelCompanion=dict(path=p,patch='required-barrel-companion.patch',patchSha256=sha(companion.encode()),reason='remove four metadata re-exports; root approved v5',planSha256='5a6984fe988ef75392dfe152be8a8b1509ea3a6ef782e69c8edf17e268149cc2')),indent=2)+'\n')
# Literal expressions compare before/after without evaluating product code.
after_templates={m[1]:m[3] for m in pat.finditer(runtime[runtime.index('export const GUIDED_COPY = {'):])}
assert templates==after_templates
(OUT/'templates-before.json').write_text(json.dumps(templates,ensure_ascii=False,indent=2)+'\n')
(OUT/'templates-after.json').write_text(json.dumps(after_templates,ensure_ascii=False,indent=2)+'\n')
# Static row accounting: each key has source + exactly one basis-specific row; delegated also facts.
base_rows=[]
for i,m in enumerate(entries):
    block=body[m.start():entries[i+1].start() if i+1<len(entries) else len(body)]
    basis=re.search(r"    basis: '(\w+)'",block)[1]
    base_rows.append(dict(key=m[1],basis=basis,names=[m[1]+': its quote is in the cited file',m[1]+(': verbatim, so the template without its braces is the quote' if basis=='verbatim' else ': adapted or delegated, so the change or the delegation is stated')]+([m[1]+': delegated, so the fact it states is quoted from its own source'] if basis=='delegated' else [])))
static_copy_checks=['A2: the struck secret-fill copy is absent from guidedNarratives.ts and from every entry','no entry offers sign-in, account choice, selectors, capture tokens or DOM upload (AC-3)','a token without a value throws instead of rendering a hole']
(OUT/'copy-table-rows.json').write_text(json.dumps(dict(status='STATIC_ONLY_not_Vitest_results',keys=len(keys),generatedRows=sum(len(r['names']) for r in base_rows),copyTableTotalBefore=185,copyTableTotalAfter=186,staticChecksPreserved=static_copy_checks,staticChecksAdded=['citation registry has exactly the runtime copy keys'],before=base_rows,after=base_rows,drops=[],additions=[]),ensure_ascii=False,indent=2)+'\n')
(OUT/'test-drop-addition-map.json').write_text(json.dumps(dict(status='STATIC_ONLY_baseline_B7_and_named_runtime_reconciliation_owed',drops=[dict(file='frontend/src/test/a11y/studioWcagAudit.test.tsx',name=n,reason='duplicate pair, unlearned state no longer scanned, accepted under ADR-SC-006') for n in ['surface 4 — ChecksStudioPage, compile-review state','surface 5 — ChecksStudioPage, confirm state']],additions=[dict(file=G+'guided.test.tsx',name='citation registry has exactly the runtime copy keys'),dict(file='frontend/src/services/mocks/studio/studioHandlers.test.ts',name='validate-variables reports a secretRef matched only by name as undeclared when secretId is absent'),dict(file='frontend/src/services/mocks/studio/studioHandlers.test.ts',name='validate-variables matches a secretRef by its actual secretId when its name differs')],copyTableGeneratedRowsPreserved=sum(len(r['names']) for r in base_rows),expectedAggregateDelta=1,schedulingTestNames='unchanged; one approved assertion literal only'),ensure_ascii=False,indent=2)+'\n')
# Read-only patch validation: no actual patch application or source mutation.
checks=[]
for entry in manifest:
    result=subprocess.run(['patch','--dry-run','-p1','--batch','--forward','-i',str(OUT/entry['patch'])],cwd=ROOT,text=True,capture_output=True)
    checks.append(dict(path=entry['path'],returncode=result.returncode,stdout=result.stdout,stderr=result.stderr))
(OUT/'patch-applicability.json').write_text(json.dumps(dict(method='patch --dry-run -p1 --batch --forward',sourceWrites=False,checks=checks),indent=2)+'\n')
assert all(c['returncode']==0 for c in checks)
combined=''.join((OUT/m['patch']).read_text() for m in manifest)
(OUT/'frontend-draft.patch').write_text(combined)
verification=dict(status='STATIC_ONLY_not_compile_test_or_runtime_proof',keyCount=len(keys),templateTokenBytesExact=templates==after_templates,templateDumpSha256=sha((OUT/'templates-before.json').read_bytes()),copyRows=sum(len(r['names']) for r in base_rows),metadataNoTemplateField='    template:' not in registry,metadataTokenBytesExact=registry_body.replace('export const GUIDED_COPY_SOURCES = {','export const GUIDED_COPY = {',1)==pat.sub(lambda m:'  '+m[1]+': {\n',body),authoredLiteralKeyRetainedBoth='authoredLiteralTargetNotFound' in templates and 'authoredLiteralTargetNotFound:' in registry,runtimeNoEvidencePaths='docs/qa/evidence/' not in runtime,sourceFilesStillOriginal=all(m['sourceSha256'] is None or sha((ROOT/m['path']).read_bytes())==m['sourceSha256'] for m in manifest),barrelCompanionRootApprovedV5=True,patchesApplyReadOnly=True,runtimeBuildLintTypecheck='UNVERIFIED')
(OUT/'static-verification.json').write_text(json.dumps(verification,indent=2)+'\n')
print(json.dumps(verification,indent=2))
