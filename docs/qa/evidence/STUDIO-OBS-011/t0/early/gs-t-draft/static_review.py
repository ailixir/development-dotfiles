#!/usr/bin/env python3
"""Lightweight textual draft checks only: no Java compiler, test runner or formatter."""
from pathlib import Path
import hashlib
import json
import re
import runpy

HERE = Path(__file__).parent
module = runpy.run_path(str(HERE / 'draft_migration.py'))
ROOT, BASE = module['ROOT'], module['BASE']
mask = module['masked']
method_span = module['method_span']


def methods(source):
    out = []
    for annotation in re.finditer(r'^\s*@(Test|ParameterizedTest)\b', source, re.M):
        match = re.search(r'\bvoid\s+(\w+)\s*\(', source[annotation.end():])
        name = match.group(1)
        a,b = method_span(source,name)
        body = source[a:b]
        flat = mask(body)
        assertions = []
        for call in re.finditer(r'\bassertThat(?:ThrownBy|ExceptionOfType|Code)?\s*\(',flat):
            # Ignore semicolons inside lambda bodies until the assertion's nested scopes close.
            parentheses = 0
            braces = 0
            for end in range(call.start(),len(flat)):
                if flat[end]=='(': parentheses+=1
                elif flat[end]==')':parentheses-=1
                elif flat[end]=='{':braces+=1
                elif flat[end]=='}':braces-=1
                elif flat[end]==';' and parentheses==0 and braces==0:
                    assertions.append(re.sub(r'\s+','',body[call.start():end+1]))
                    break
        out.append({'name':name,'annotation':annotation.group(1),'body':body,'assertions':assertions})
    return out


rows=[]
findings=[]
for name in ['GuidedSessionIT','GuidedServiceTransportFaultIT','GuidedLifecycleReasonIT']:
    rel=BASE/(name+'.java')
    before=(ROOT/rel).read_text()
    after=(HERE/'repo'/rel).read_text()
    old=methods(before);new=methods(after)
    old_names=[m['name'] for m in old];new_names=[m['name'] for m in new]
    assert old_names==new_names,(name,'method-name drift')
    reconciled=[]
    for left,right in zip(old,new):
        missing=[s for s in left['assertions'] if s not in right['assertions']]
        assert not missing,(name,left['name'],'assertion removed or changed',missing)
        reconciled.append({'name':left['name'],'annotation':left['annotation'],
            'originalAssertions':len(left['assertions']),'draftAssertions':len(right['assertions']),
            'originalAssertionsPreserved':True})
    # Verify structural brace balance after strings/comments are masked, without claiming syntax validity.
    flat=mask(after)
    balance=0
    for ch in flat:
        if ch=='{':balance+=1
        elif ch=='}':balance-=1
        assert balance>=0,(name,'negative brace balance')
    assert balance==0,(name,'unbalanced braces')
    forbidden=re.findall(r'\.(?:acceptPlan|reserveObligation|attachAdmission)\s*\(',flat)
    assert not forbidden,(name,forbidden)
    assert not re.search(r'\.(?:initialize)\s*\([^;]*manifest',flat,re.S),(name,'manifest initialization remains')
    # Direct authority SQL writes are forbidden; ordinary source and existing negative duplicates differ.
    forbidden_sql=re.findall(r'(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+studio_guided_(?:translation_plans|obligation_admissions|source_manifests|translation_state)\b',after,re.I)
    assert not forbidden_sql,(name,forbidden_sql)
    rows.append({'file':str(rel),'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),
        'afterSha256':hashlib.sha256(after.encode()).hexdigest(),
        'sourceMethodsBefore':len(old),'sourceMethodsAfter':len(new),'orderedNamesIdentical':True,
        'allOriginalAssertionExpressionsPreserved':True,'braceBalance':balance,
        'forbiddenAuthorityCalls':forbidden,'forbiddenAuthoritySqlWrites':forbidden_sql,
        'methods':reconciled})

result={'isQaVerdict':False,'scope':'textual only; not compilation or runtime proof',
    'files':rows,'sourceMethodsBefore':sum(x['sourceMethodsBefore'] for x in rows),
    'sourceMethodsAfter':sum(x['sourceMethodsAfter'] for x in rows),
    'compileVerified':False,'runtimeVerified':False,'findings':findings}
(HERE/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'files':len(rows),'sourceMethods':result['sourceMethodsAfter'],
    'originalAssertionExpressionsPreserved':True,'compileOrTestsRun':False}))
