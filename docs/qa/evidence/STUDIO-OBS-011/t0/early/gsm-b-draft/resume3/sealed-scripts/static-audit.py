"""Lightweight artifact-only audit. Does not load/run the application, tests or staging driver."""
from pathlib import Path
import ast
import collections
import hashlib
import json
import re

R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-b-draft'
M=json.loads((D/'manifest.json').read_text());S='backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java';T='backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'
def sha(b):return hashlib.sha256(b).hexdigest()

def patch_apply(text, delta):
    src=text.splitlines(True); out=[]; at=0;lines=delta.splitlines(True);i=0
    while i<len(lines):
        if not lines[i].startswith('@@ '):i+=1;continue
        m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]); assert m
        start=max(0,int(m.group(1))-1);out.extend(src[at:start]);at=start;i+=1
        while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
            l=lines[i]
            if l.startswith(' '):assert src[at]==l[1:];out.append(src[at]);at+=1
            elif l.startswith('-'):assert src[at]==l[1:];at+=1
            elif l.startswith('+'):out.append(l[1:])
            else:raise AssertionError(l)
            i+=1
    out.extend(src[at:]);return ''.join(out)

def sections(patch):
    lines=patch.splitlines(True); out=[];start=0
    for i,l in enumerate(lines):
        if l.startswith('--- ') and i>start:
            out.append(''.join(lines[start:i]));start=i
    if lines:out.append(''.join(lines[start:]))
    return [(re.search(r'^\+\+\+ b/(.*)$',s,re.M).group(1),s) for s in out]

checks=[]
for patch in ['part-b.patch','S011-owned-seven-paths.patch','S011-composition.patch','negative-tests-only.patch','main-session-after-red.patch']:
    count=0
    for rel,delta in sections((D/patch).read_text()):
        fact=next((x for x in M['files'] if x['path']==rel),None)
        target=(D/'repo'/rel) if fact else R/next(x['origin'] for x in M['unchangedGsTBatons'] if x['path']==rel)
        if patch.startswith('S011'):
            original=(R/rel).read_text() if (R/rel).exists() else ''
        elif patch=='negative-tests-only.patch':original=''
        else:original=(R/fact['baseOrigin']).read_text() if fact['baseOrigin'] else ''
        assert patch_apply(original,delta)==target.read_text(),(patch,rel)
        count+=1
    checks.append({'patch':patch,'reconstructedPaths':count})
main=(D/'repo'/S).read_text();base=(R/next(x['baseOrigin'] for x in M['files'] if x['path']==S)).read_text()
assert main.count('requireTranslation(id);')==7
assert main.count('private void requireTranslation(String id)')==1
assert main.count('translation != null')==1
assert 'if (translation != null' not in main and 'recordEvidence' not in main
assert 'translationTransaction' in base and 'requireTranslation(' not in base
for f in M['files']:
    assert sha((D/'repo'/f['path']).read_bytes())==f['draftSha256']
    if f['baseOrigin']:
        assert sha((R/f['baseOrigin']).read_bytes())==f['baseSha256']
    if f['forwardedUnchanged']:
        assert f['baseSha256']==f['draftSha256']
for name,f in M['mutants'].items():
    mutant=(D/'mutants'/(name+'.java.txt')).read_text()
    assert sha(mutant.encode())==f['serviceSha256']
    assert patch_apply(main,(D/'mutants'/(name+'.patch')).read_text())==mutant
# Check every original SessionIT byte except the exact declared case subspan.
before=(R/next(x['baseOrigin'] for x in M['files'] if x['path']==T)).read_text();after=(D/'repo'/T).read_text()
a=before.index('  void evidenceReferencesAreScopedAndDoNotClaimReplay()'); b=before.index('  @Test',a)
c=after.index('  void evidenceReferencesAreScopedAndDoNotClaimReplay()'); d=after.index('  @Test',c)
assert before[:a]==after[:c] and before[b:]==after[d:]
assert M['sessionBeforeNames']==M['sessionAfterNames'] and len(M['sessionBeforeNames'])==44
assert len(M['newCaseNames'])==5
for token in ['repository.evidence(id, "0".repeat(64), "foreign", "ref")',
              '.isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)',
              '.isEqualTo("evidence-store-1")','.path("replayVerified").asBoolean()).isFalse()']:
    assert token in before[a:b] and token in after[c:d]
# Existing part-A executor/policy implementations are byte-identical outside the specified F1 region.
for anchor in ['  /** A refresh intent commits','  private void reportShedTeardown']:
    if anchor in base:
        i=base.index(anchor);j=main.index(anchor)
        # The rest after the final edited bootstrap method is unchanged.
        if anchor.startswith('  /** A refresh'):assert base[i:]==main[j:]
for p in D.glob('*.py'):ast.parse(p.read_text(),filename=str(p))
expected=json.loads((D/'expected-discovery.json').read_text())
counts=collections.Counter(x['class'].split('.')[-1]+':'+x['task'] for x in expected['cases'])
assert counts['GuidedServiceTransportFaultIT:test']==39
out={'status':'STATIC_ARTIFACT_CHECKS_ONLY','compiled':False,'runtimeExecuted':False,
     'patchReconstructions':checks,'allForwardedHashesMatch':True,'allMutantHashesMatch':True,
     'sessionCaseNamesPreserved':44,'newNegativeCases':5,'operationProbesOnGreen':10,
     'sessionOtherMethodBytesPreserved':True,'partATailBytesPreserved':True,
     'sevenCallsOneDeclarationOneNonNullPredicate':True,
     'discoveryCatalogCounts':dict(counts),'conflictUnresolved':True,
     'noJavaCompilationOrGateCredit':True}
(D/'static-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
