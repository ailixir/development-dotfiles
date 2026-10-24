"""Pinned resource negatives on isolated files; readonly closed diagnostic counterexample check."""
import copy
import datetime
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'backend/gradlew').is_file())
sys.path.insert(0,str(HERE))
import conformance as prior
import driver_support as ds
import report_resources as rr
import validate_collector as vc
POLICY=rr.load_policy(ROOT)
EXECUTION=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'
LABEL='obs011-diag-start1-full01'
CLOSED_PATH=EXECUTION/(LABEL+'-results.json')
CLOSED_BYTES=CLOSED_PATH.read_bytes()
CLOSED=json.loads(CLOSED_BYTES)
assert ds.sha(CLOSED_BYTES)=='9b991d479cbe6176a4631c43abcc28f1c14f2e7f3d2d269e920c40b44013babe'
KNOWN=next(e for e in CLOSED['testHtmlFiles'] if e['path'].endswith('/test/html/css/base-style.css'))
KNOWN_FACT=ds.file_state(ROOT/KNOWN['path'])


class ResourceTests(prior.Base):
    fixture=prior.CollectorValidationTests.fixture
    def test_exact_known_inherited_resource_provenance(self):
        producers={}
        result=rr.classify(ROOT,EXECUTION,LABEL,KNOWN,KNOWN_FACT,['test'],CLOSED['testcases'],POLICY,producers)
        rr.verify_producers(producers)
        self.assertFalse(result['freshnessCredit']);self.assertFalse(result['caseCoverageRuntimeCredit'])
    def test_unknown_css_is_not_whitelisted(self):
        entry=dict(KNOWN,path=KNOWN['path'].replace('base-style.css','unknown.css'))
        with self.assertRaisesRegex(ValueError,'UNKNOWN_OR_MISPLACED'):
            rr.classify(ROOT,EXECUTION,LABEL,entry,KNOWN_FACT,['test'],CLOSED['testcases'],POLICY,{})
    def test_wrong_task_report_root_is_rejected(self):
        entry=dict(KNOWN,task='guidedIncrementalTest')
        with self.assertRaisesRegex(ValueError,'OUTSIDE_EXACT_TASK_HTML_ROOT'):
            rr.classify(ROOT,EXECUTION,LABEL,entry,KNOWN_FACT,['test','guidedIncrementalTest'],CLOSED['testcases'],POLICY,{})
    def test_known_name_changed_resource_bytes_reject(self):
        fact=dict(KNOWN_FACT,bytes=b'ALTERED',sha256=ds.sha(b'ALTERED'))
        with self.assertRaisesRegex(ValueError,'EXACT_STATIC_RESOURCE_CONTENT_CHANGED'):
            rr.classify(ROOT,EXECUTION,LABEL,KNOWN,fact,['test'],CLOSED['testcases'],POLICY,{})
    def test_pinned_jar_hash_drift_rejects(self):
        bad=dict(KNOWN_FACT,sha256='0'*64)
        with patch.object(rr,'dependency',return_value=bad):
            with self.assertRaisesRegex(ValueError,'PRODUCER_JAR_HASH_OR_SIZE_CHANGED'):
                rr.classify(ROOT,EXECUTION,LABEL,KNOWN,KNOWN_FACT,['test'],CLOSED['testcases'],POLICY,{})
    def test_stale_active_html_stays_rejected(self):
        result,check=self.fixture();entry=result['testHtmlFiles'][0];path=self.root/entry['path']
        old=int((datetime.datetime.fromisoformat(result['started']).timestamp()-10)*1e9)
        os.utime(path,ns=(path.stat().st_atime_ns,old));entry['mtimeNs']=path.stat().st_mtime_ns
        with self.assertRaisesRegex(ValueError,'DYNAMIC_ARCHIVE_ORIGINAL_NOT_FRESH'):check()
    def test_missing_active_class_report_stays_rejected(self):
        result,check=self.fixture();result['testHtmlFiles']=[e for e in result['testHtmlFiles'] if '/classes/' not in e['path']]
        self.assertFalse(check()['validatedComplete'])


def closed_witness():
    raw_before=ds.sha(CLOSED_PATH.read_bytes())
    end=datetime.datetime.fromisoformat(CLOSED['started']).timestamp()+CLOSED['elapsedSeconds']
    cases=[{k:c[k] for k in ['task','class','name']} for c in CLOSED['testcases']]
    classes=['com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT']
    tasks=['test','guidedIncrementalTest']
    positive=vc.validate(ROOT,EXECUTION,LABEL,classes,tasks,cases,0,end,POLICY)
    assert positive['validatedComplete'] and len(positive['inheritedStaticResources'])==6
    original=vc.file_state
    missing=copy.deepcopy(CLOSED)
    missing['testHtmlFiles']=[e for e in missing['testHtmlFiles'] if '/test/html/classes/' not in e['path']]
    def missing_state(path):
        state=original(path)
        if Path(path)==CLOSED_PATH:state=dict(state,bytes=json.dumps(missing).encode())
        return state
    with patch.object(vc,'file_state',side_effect=missing_state):
        negative_missing=vc.validate(ROOT,EXECUTION,LABEL,classes,tasks,cases,0,end,POLICY)
    assert not negative_missing['validatedComplete']
    changed=copy.deepcopy(CLOSED);tamper=b'FAKE_RESOURCE_TAMPER'
    for entry in changed['testHtmlFiles']:
        if entry['path']==KNOWN['path']:entry.update(sha256=ds.sha(tamper),bytes=len(tamper))
    def tampered_state(path):
        state=original(path)
        if Path(path)==CLOSED_PATH:state=dict(state,bytes=json.dumps(changed).encode())
        if Path(path)==ROOT/KNOWN['path']:state=dict(state,bytes=tamper,sha256=ds.sha(tamper))
        return state
    observed=None
    try:
        with patch.object(vc,'file_state',side_effect=tampered_state):
            vc.validate(ROOT,EXECUTION,LABEL,classes,tasks,cases,0,end,POLICY)
    except ValueError as error:observed=str(error)
    assert observed=='EXACT_STATIC_RESOURCE_CONTENT_CHANGED'
    assert ds.sha(CLOSED_PATH.read_bytes())==raw_before
    outer=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/diag-start1-harness/resume2/runs/obs011-diag-start1-full01/receipt.json'
    outer_state=ds.file_state(outer);qualification=json.loads(outer_state['bytes'])
    return {'kind':'READONLY_CLOSED_DIAGNOSTIC_CODE_CONTRACT_WITNESS_NOT_NEW_NATIVE_RESULT',
        'collectorPath':str(CLOSED_PATH.relative_to(ROOT)),'collectorSha256':raw_before,
        'positiveCodeAssessment':positive['validatedComplete'],'exactInheritedResources':len(positive['inheritedStaticResources']),
        'missingCurrentClassReportRejected':not negative_missing['validatedComplete'],
        'changedKnownResourceWithReboundFakeManifestRejected':observed,
        'negativeInjections':'In-memory only; actual public archive/receipt bytes/times unchanged',
        'outerQualificationPreserved':{'sha256':outer_state['sha256'],'status':qualification['status'],
            'exit':qualification['exit'],'observationFailure':qualification['observationFailure'],
            'ownedIdentityObservationGap':qualification['ownedIdentityObservationGap']},
        'noLive03OutputsReadOrWritten':True,'noRuntimeGsmLaneFullT0OrCoverageCredit':True}


if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ResourceTests))
    witness=closed_witness() if result.wasSuccessful() else None
    output={'testsRun':result.testsRun,'passed':result.wasSuccessful(),'closedDiagnosticWitness':witness,
        'noActualEntryPointNativeSignalOrProductWrite':True,'actualMergedCoverageGateAdded':False}
    (HERE/'resource-conformance-results.json').write_text(json.dumps(output,indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful() else 1)
