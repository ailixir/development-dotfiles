"""UNEXECUTED future read-only mutation evidence checker; never launches/stages anything.
Raw XML/failure stacks remain private. Output contains only closed facts/hashes/reasons.
Independent QA still owns mutation sufficiency and native cleanup/privacy disposition.
"""
from pathlib import Path
from collections import Counter
import argparse,json,re,hashlib,sys
import xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'AGENTS.md').is_file())
sha=lambda b:hashlib.sha256(b).hexdigest()
def read_bound(row):
    p=ROOT/row['path'];assert p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(ROOT)
    raw=p.read_bytes();assert sha(raw)==row['sha256'];return raw

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('receipt',type=Path)
    parser.add_argument('--mutation-id',required=True);args=parser.parse_args()
    mutant=next(m for m in json.loads((HERE/'mutation-plan.json').read_text())['mutants'] if m['id']==args.mutation_id)
    data=json.loads(args.receipt.read_text())
    before=json.loads(args.receipt.with_name(args.receipt.name.replace('-results.json','-before.json')).read_text())
    source=next(r for r in before['files'] if r['path'].endswith('/GuidedPublicationReplayIT.java'))
    if source['sha256']!=mutant['mutantSha256']:raise ValueError('MUTANT_SOURCE_NOT_ACTUALLY_STAGED')
    assert all(data.get(k) is True for k in ['sourceStable','distStable','testInputStable'])
    assert not data['expectedHistoricalSkips'] and data['historicalSkipSource'] is None
    subset=args.mutation_id=='M-gate-true-subset';tasks=['test'] if subset else ['test','guidedIncrementalTest']
    assert data['explicitTestTasks']==tasks and set(data['requiredFreshExecTasks'])==set(tasks)
    assert all(data['taskResults'][task]['freshExec'] is True for task in tasks)
    wanted=json.loads((HERE/'expected-cases.json').read_text())
    controls={'M-gate-false','M-omit-variant','M-duplicate-variant'}
    if args.mutation_id in controls:
        assert data['taskCollectionComplete'] is True and not data['taskCollectionErrors']
    else:
        # The unchanged final boundary refuses before audit-final.json by design. Do not alter the collector.
        expected_absences=Counter((task,'MISSING_FRESH_COHORT_FILE','audit-final.json') for task in tasks)
        assert Counter((r.get('task'),r.get('reason'),r.get('file')) for r in data['taskCollectionErrors'])==expected_absences
        assert all(set(r)=={'task','reason','file'} for r in data['taskCollectionErrors'])
        assert data['taskCollectionComplete'] is False
    actual=Counter((r['task'],r['class'],r['name']) for r in data['testcases'] if r['status']=='PASS')
    if subset:
        name='syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls'
        expected=Counter((r['task'],r['class'],r['name']) for r in wanted['cases'] if r['task']=='test' and r['method']==name)
        assert sum(expected.values())==1
    else:expected=Counter((r['task'],r['class'],r['name']) for r in wanted['cases'])
    # Native case failures/setup/no-tests/source mismatch cannot satisfy a boundary/gate mutant.
    assert actual==expected
    for row in data['testcases']:
        if row['status']!='PASS':assert (row['task'],row['class'],row['name']) not in expected
    if args.mutation_id in controls:
        # Canonical verifier's source acceptance must happen first; then reject exact corpus evidence.
        assert data['exit']==0 and data['gradleExit']==0
        xml_cases=Counter()
        for row in data['xmlFiles']:
            for case in ET.fromstring(read_bound(row)).iter('testcase'):
                assert case.find('failure') is None and case.find('error') is None and case.find('skipped') is None
                xml_cases[(row['task'],case.attrib['classname'],case.attrib['name'])]+=1
        assert xml_cases==expected
        seen=set()
        for row in data['guidedCohortFiles']:
            if Path(row['path']).name=='cohort.json':
                cohort=json.loads(read_bound(row));task=row['task'];assert task not in seen;seen.add(task)
                assert all(cohort.get(k) is True for k in ['auditComplete','privacyComplete','producersDrained','finalScansAttempted'])
                expected_invocations=Counter((r['method'],r['variant'],r['variantOrdinal']) for r in wanted['cases'] if r['task']==task)
                assert Counter((r['method'],r['variant'],r['variantOrdinal']) for r in cohort['invocations'])==expected_invocations
                assert all(r['passed'] is True and r['afterEachComplete'] is True for r in cohort['invocations'])
        assert seen==set(tasks)
        rejection=None
        for row in data['guidedCohortFiles']:
            if Path(row['path']).name=='audit-final.json':
                audit=json.loads(read_bound(row))
                if not audit.get('exactLaneObserved') or audit.get('finalCorpusControlChecks',0)<2:rejection=True
        if not rejection:raise ValueError('GATE_CONTROL_DID_NOT_REJECT_EXACT_FINAL_EVIDENCE')
        result=dict(mutation=args.mutation_id,acceptedMutantSha256=mutant['mutantSha256'],gateEvidenceRejected=True)
    else:
        assert data['exit']!=0 and data['gradleExit']!=0
        activations={};cohorts={}
        for row in data['guidedCohortFiles']:
            name=Path(row['path']).name
            if name.startswith('privacy-itr-final-fault-') and name.endswith('.json'):
                receipt=json.loads(read_bound(row));assert receipt['fault']==args.mutation_id
                assert receipt['boundary'] in ['OWNED_SINKS','CONTEXT_CLOSED']
                task=row['task'];assert task in tasks
                assert receipt['observedInvocations']==(1 if subset else wanted['counts'][task])
                assert receipt['expectedInvocations']==wanted['counts'][task]
                assert receipt['actualMultiplicityComplete'] is (not subset)
                schema=json.loads((HERE/'boundary-activation.schema.json').read_text());assert set(receipt)==set(schema['required'])
                assert receipt['lane']==task
                if subset:assert receipt['realCanaryCount']==0
                else:assert all(receipt[key]>0 for key in ['realCanaryCount','realAdmittedCount','realDispatchedCount'])
                if not subset:assert receipt['bodyCorpusChecksBeforeActivation']>=1 # Order39 genuine body completed first.
                assert receipt['producersDrained'] is True
                if receipt['boundary']=='CONTEXT_CLOSED':assert receipt['contextClosed'] is True
                activations.setdefault(task,{})[receipt['boundary']]=row['sha256']
            elif name=='cohort.json':
                cohort=json.loads(read_bound(row));task=row['task'];assert task not in cohorts
                assert cohort['producersDrained'] is True and cohort['finalScansAttempted'] is True
                assert all(r['passed'] is True and r['afterEachComplete'] is True for r in cohort['invocations'])
                cohorts[task]=row['sha256']
        # Both final boundaries should still be attempted under original failure aggregation/cleanup.
        assert set(activations)==set(tasks)==set(cohorts)
        assert all(set(v)=={'OWNED_SINKS','CONTEXT_CLOSED'} for v in activations.values())
        mutant_source=(HERE/'mutations'/args.mutation_id/'repo'/wanted['sourcePath']).read_text()
        helper_start=mutant_source.index('  private static void itrAssertAuditCorpus()')
        helper_end=mutant_source.index('  private static void scanAuditContent()',helper_start)
        first_line=mutant_source[:helper_start].count('\n')+1;last_line=mutant_source[:helper_end].count('\n')+1
        failures={task:False for task in tasks};xml_pass=Counter()
        for row in data['xmlFiles']:
            task=row['task'];tree=ET.fromstring(read_bound(row))
            for case in tree.iter('testcase'):
                failed=case.find('failure');error=case.find('error')
                failure=failed if failed is not None else error
                if failure is None:
                    assert case.find('skipped') is None
                    xml_pass[(task,case.attrib['classname'],case.attrib['name'])]+=1
                    continue
                private_text=(failure.text or '')+' '+failure.attrib.get('message','')
                # Inspect privately; never export throwable messages/stacks or IDs.
                lines=[int(m) for m in re.findall(r'GuidedPublicationReplayIT\.itrAssertAuditCorpus\(GuidedPublicationReplayIT\.java:(\d+)\)',private_text)]
                actual_assert=any(first_line<=line<last_line for line in lines)
                assert actual_assert and 'scanCompleteAuditStream' in private_text and 'AssertionError' in private_text
                assert 'the OBS-007 case registered its canaries' in private_text if args.mutation_id in ['M-empty-canaries','M-gate-true-subset'] else 'the joined runs emitted admitted-action and replay-dispatch events' in private_text
                failures[task]=True
        assert xml_pass==expected and all(failures.values())
        result=dict(mutation=args.mutation_id,acceptedMutantSha256=mutant['mutantSha256'],
          actualOriginalBoundaryAssertionRejected=True,activationReceiptHashes=activations,
          realBodyPassedCaseCount=sum(expected.values()),rawPrivateFailureDetailsExported=False,
          collectorComplete=False,expectedInjectedAuditFinalAbsenceAccounted=True,
          collectorExitRemainsNonzero=True,allOtherObservationGaps='REJECTED')
    result.update(notQaVerdict=True,nativePrivacyOwnershipTimingDisposition='STILL_REQUIRED_INDEPENDENTLY',status='EVIDENCE_RECONCILIATION_ONLY')
    print(json.dumps(result))
if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps(dict(status='INCOMPLETE_OR_INVALID_MUTATION_PROOF',notQaVerdict=True)))
        sys.exit(2)
