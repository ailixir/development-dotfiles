"""Read-only future evidence reconciliation. Never launches/stages a test or grants QA credit."""
from pathlib import Path
from collections import Counter
import argparse,json,hashlib,sys
import xml.etree.ElementTree as ET

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt',type=Path)
    parser.add_argument('--stage',required=True)
    parser.add_argument('--mutation-id',help='Only an exact reviewed source-mutant identity from mutation-plan.json')
    args=parser.parse_args()
    here=Path(__file__).resolve().parent
    root=next(p for p in here.parents if (p/'backend/gradlew').is_file())
    stages={r['stage']:r for r in json.loads((here/'stages.json').read_text())}
    stage=stages[args.stage]
    expected_source=stage['candidateSha256']
    if args.mutation_id:
        mutant=next(row for row in json.loads((here/'mutation-plan.json').read_text())['mutants'] if row['id']==args.mutation_id)
        assert mutant['baseSha256']==expected_source
        expected_source=mutant['mutantSha256']
    wanted=json.loads((here/'expected-cases.json').read_text())
    data=json.loads(args.receipt.read_text())
    assert data['exit']==0 and data['gradleExit']==0
    assert all(data.get(key) is True for key in ('sourceStable','distStable','testInputStable','taskCollectionComplete'))
    assert data['explicitTestTasks']==['test','guidedIncrementalTest']
    assert set(data['requiredFreshExecTasks'])=={'test','guidedIncrementalTest'}
    assert not data['expectedHistoricalSkips'] and data['historicalSkipSource'] is None
    actual=Counter((r['task'],r['class'],r['name']) for r in data['testcases'])
    expected=Counter((r['task'],r['class'],r['name']) for r in wanted['cases'])
    assert actual==expected and all(r['status']=='PASS' for r in data['testcases'])
    xml_cases=[]
    for row in data['xmlFiles']:
        path=root/row['path'];assert not path.is_symlink() and path.is_file() and path.resolve().is_relative_to(root)
        raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256']
        for case in ET.fromstring(raw).iter('testcase'):
            assert case.find('failure') is None and case.find('error') is None and case.find('skipped') is None
            xml_cases.append((row['task'],case.attrib['classname'],case.attrib['name']))
    assert Counter(xml_cases)==expected
    before_path=args.receipt.with_name(args.receipt.name.replace('-results.json','-before.json'))
    before=json.loads(before_path.read_text())
    source=next(r for r in before['files'] if r['path']==wanted['sourcePath'])
    if source['sha256']!=expected_source:raise ValueError('EXPECTED_STAGED_SOURCE_HASH_MISMATCH')
    finals={};cohorts={}
    for row in data['guidedCohortFiles']:
        path=root/row['path']
        if path.name in ('audit-final.json','cohort.json'):
            assert not path.is_symlink() and path.is_file()
            raw=path.read_bytes();assert hashlib.sha256(raw).hexdigest()==row['sha256']
            if path.name=='cohort.json':
                cohort=json.loads(raw);task=row['task'];assert task not in cohorts
                assert all(cohort.get(key) is True for key in ('auditComplete','privacyComplete','producersDrained',
                    'finalScansAttempted','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete'))
                assert cohort['retentionFailures']==0
                actual_invocations=Counter((r['method'],r['variant'],r['variantOrdinal']) for r in cohort['invocations'])
                expected_invocations=Counter((r['method'],r['variant'],r['variantOrdinal']) for r in wanted['cases'] if r['task']==task)
                assert actual_invocations==expected_invocations
                assert all(r['passed'] is True and r['afterEachComplete'] is True for r in cohort['invocations'])
                cohorts[task]=hashlib.sha256(raw).hexdigest()
                continue
            audit=json.loads(raw);task=row['task'];assert task not in finals
            assert all(audit.get(key) is True for key in ('auditComplete','producersDrained','contextClosed'))
            if audit.get('exactLaneObserved') is not True:raise ValueError('EXACT_FULL_PROFILE_CONTROL_NOT_OBSERVED')
            assert audit['expectedInvocations']==wanted['counts'][task]
            assert audit['observedInvocations']==wanted['counts'][task]
            if audit['finalCorpusControlChecks']<2:raise ValueError('FINAL_CORPUS_CONTROL_BOUNDARIES_MISSING')
            assert audit['corpusControlChecks']>=2
            assert audit['contentScans']>=2
            finals[task]=hashlib.sha256(raw).hexdigest()
    assert set(finals)==set(cohorts)=={'test','guidedIncrementalTest'}
    assert all(data['taskResults'][task]['freshExec'] is True for task in finals)
    print(json.dumps({'candidateSha256':expected_source,'exactCaseCount':sum(actual.values()),
        'auditFinalHashes':finals,'cohortHashes':cohorts,'reconciled':True,'notQaVerdict':True,
        'batonRequiresSecondConsecutiveIdenticalGreen':True}))

if __name__=='__main__':
    try:main()
    except Exception as error:
        closed={'EXPECTED_STAGED_SOURCE_HASH_MISMATCH','EXACT_FULL_PROFILE_CONTROL_NOT_OBSERVED','FINAL_CORPUS_CONTROL_BOUNDARIES_MISSING'}
        reason=error.args[0] if error.args and isinstance(error.args[0],str) and error.args[0] in closed else 'REQUIRED_EXACT_FULL_CLASS_EVIDENCE_MISSING_OR_INVALID'
        print(json.dumps({'reconciled':False,'reason':reason,'notQaVerdict':True}))
        sys.exit(2)
