"""Finite source-only tests. Read only own packet inputs before permanent deny-audit.

No main fallback. All controller effects resolve to FakePort in the same exec namespace.
The historical XML parser receives FakeET; Path is replaced by a pure name-only type.
"""
import sys
import json
import hashlib
import ast
from pathlib import Path
from collections import Counter
import xml.etree.ElementTree as ET

packet = Path(__file__).parent
raw_source = (packet / 'pure_controller.py').read_bytes()
raw_adapter = (packet / 'selected_adapter.py').read_bytes()
raw_plan = (packet / 'unit-plan.json').read_bytes()
selection = json.loads((packet / 'selected-definitions.json').read_bytes())
buffers = {path: (packet / ('selected-buffer-' + str(i) + '.py.txt')).read_bytes() for i, path in enumerate(selection)}
source_pin = hashlib.sha256(raw_source).hexdigest()
plan_pin = hashlib.sha256(raw_plan).hexdigest()
preloaded = {'json': json, 'hashlib': hashlib, 'ast': ast, 'ET': ET, 'Counter': Counter}
ET.tostring(ET.Element('stdlib-serialization-preload'))  # preload encoder before persistent audit
denied_events = []


def deny_effect(event, args):
    if event == 'open' or event.startswith(('os.', 'subprocess.', 'socket.', 'ctypes.', 'fcntl.', 'shutil.', '_thread.', 'threading.', 'multiprocessing.', 'urllib.', 'http.', 'import')):
        denied_events.append(event)
        raise RuntimeError('SOURCE_TEST_EFFECT_DENIED')


sys.addaudithook(deny_effect)  # permanent; never disabled or replaced
adapter = {'__builtins__': __builtins__}
exec(compile(raw_adapter, '<same-verified-adapter>', 'exec'), adapter)


class FakePath:
    def __init__(self, value):
        self.name = value.rsplit('/', 1)[-1]


class FakeET:
    @staticmethod
    def parse(raw_xml):
        return ET.ElementTree(ET.fromstring(raw_xml))


selected = adapter['selected_namespace'](buffers, selection, ast, hashlib, FakeET, FakePath)
Hold = None
checks = []


def check(name, condition):
    if not condition:
        raise RuntimeError('CHECK_FAILED_' + name)
    checks.append({'id': name, 'passed': True, 'targetEffects': 'FAKE', 'native': False})


def clone(value):
    return json.loads(json.dumps(value))


class FakePort:
    def __init__(self):
        self.plan = json.loads(raw_plan)
        self.time = 100
        self.calls = []
        self.started = set()
        self.controls = {}
        self.r = [{'path': x['path'], 'sha256': x['sha256'], 'mode': x['mode'] if x['mode'] is not None else 0o644} for x in self.plan['finiteCopy']['members']]
        self.p = None
        self.native_edit = None
        self.native_override = {}
        self.fail = None
        self.lease_hashes = {self.plan['roots']['projectP'] + '/' + x['path']: x['candidateSha256'] for x in self.plan['overlay']}
        self.gate_advance = False
        self.bad_case = False
        self.bad_xml = False
        self.admission_edit = None
        self.approval = True
        self.review = True
        self.debug = []

    def reserve_phase(self, unit, phase, pin):
        if phase in self.started:
            raise RuntimeError('DURABLE_CAP')
        self.started.add(phase)
        self.calls.append(('reserve', phase))
        if self.fail == 'setup':
            raise RuntimeError('raw setup body must never be public')

    def control(self, doc):
        raw = json.dumps(doc, sort_keys=True).encode()
        pin = hashlib.sha256(raw).hexdigest()
        self.controls[pin] = raw
        return raw, pin

    def verify_control(self, raw, pin):
        if hashlib.sha256(raw).hexdigest() != pin or self.controls.get(pin) != raw:
            raise RuntimeError('CONTROL_PIN')
        return json.loads(raw)

    def verify_approval(self, pin, phase, project):
        if not self.approval:
            raise RuntimeError('APPROVAL_OWED')
        self.calls.append(('approval', phase))

    def admission(self, roots, pin):
        result = {'unit': self.plan['label'], 'gatewayClosedQaRoot': True, 'noncreditCertificate': True, 'preF1': True, 'nonIR': True, 'ordinaryOwnershipQualified': True, 'newGuardNegativeStatus': 1, 'sameHolderQualified': True, 'oneHeavyWrapperSha256': self.plan['wrapper']['sha256'], 'lease': {'exclusive': True, 'start': 0, 'expires': 43200, 'destinationHashes': self.lease_hashes, 'ownedRoots': roots, 'noSharedWrites': True}, 'tools': {'fresh': True, 'java21': True, 'javaBinSha256': self.plan['java']['binarySha256'], 'javaReleaseSha256': self.plan['java']['releaseSha256'], 'caffeinateSha256': '1' * 64, 'allUtilitiesQualified': True, 'gradle8102PropertyCompatibility': True}, 'offline': {'manifestSha256': '2' * 64, 'closureQualified': True, 'version': '8.10.2', 'finiteOwnedSeed': True, 'noCredentialsOrInitOrDaemonOrRegistry': True, 'readOnlyOriginal': True}, 'fixture': {'fresh': True, 'imageId': self.plan['fixture']['parentSuppliedImageId'], 'platform': 'linux/arm64', 'literalResolutionQualified': True, 'javaFixtureQualified': True, 'unchangedSkipRyukPolicy': True}, 'sourceModes': {x['path']: x['mode'] for x in self.r}, 'sourceModesFresh': True}
        if self.admission_edit:
            self.admission_edit(result)
        return result

    def monotonic_lease_time(self):
        return self.time

    def inventory(self, which, roots, rows):
        return clone(self.r if which == 'R' else self.p)

    def verify_ordinary_ownership(self, roots):
        self.calls.append(('ordinary',))
        if self.fail == 'owner':
            raise RuntimeError('ORDINARY_OWNER_UNKNOWN')

    def prepare_copy(self, roots, rows, modes, overlays):
        self.calls.append(('copy',))
        self.p = clone(self.r)
        for row in overlays:
            next(x for x in self.p if x['path'] == row['path'])['sha256'] = row['candidateSha256']

    def native(self, spec, roots):
        self.calls.append(('native', spec['id'], tuple(spec['argv'])))
        if self.native_edit:
            self.native_edit(self.p)
        result = {'nativeStatus': 0, 'collectorStatus': 0, 'phaseStatus': 0, 'elapsedSeconds': 10, 'firstChildIdentityQualified': True, 'allOwnedWaited': True, 'utilityRosterComplete': True, 'stickyUnknown': False, 'outputCustodyQualified': True}
        result.update(self.native_override)
        return result

    def verify_style_reports(self, roots, tasks):
        if self.bad_xml:
            raise RuntimeError('FRESH_MAIN_TEST_XML_OWED')
        for task in ('checkstyleMain', 'checkstyleTest'):
            result = adapter['checkstyle_projection'](b'<checkstyle version="10.0"></checkstyle>', task, roots['projectP'] + '/backend', set(), set(), ET)
            if result['diagnosticCount'] != 0:
                raise RuntimeError('DIAGNOSTICS')
        self.calls.append(('style-reports', tuple(tasks)))

    def verify_regression(self, roots, catalog, expected, require_exec):
        if not require_exec:
            raise RuntimeError('EXEC_REQUIRED')
        cases = clone(catalog)
        if self.bad_case:
            cases[0]['name'] = 'differentCase()'
        grouped = {}
        for x in cases:
            grouped.setdefault(x['class'], []).append(x)
        parsed = []
        for classname, rows in grouped.items():
            suite = ET.Element('testsuite', tests=str(len(rows)), failures='0', errors='0', skipped='0')
            for x in rows:
                ET.SubElement(suite, 'testcase', classname=classname, name=x['name'])
            try:
                parsed.append(selected['read_xml'](ET.tostring(suite), 'test'))
            except BaseException as error:
                self.debug.append(('fake-xml', type(error).__name__))
                raise
        try:
            adapter['qualify_cases'](parsed, catalog, Counter)
        except BaseException as error:
            self.debug.append(('fake-catalog', type(error).__name__))
            raise
        self.calls.append(('regression99',))

    def finish_phase(self, unit, phase):
        self.calls.append(('finish', phase))
        if self.fail == 'finish':
            raise RuntimeError('raw cleanup must never be public')

    def publish_receipt(self, doc):
        self.calls.append(('receipt', doc['phase']))
        if self.fail == 'publish':
            raise RuntimeError('raw publish must never be public')
        return hashlib.sha256(json.dumps(doc, sort_keys=True).encode()).hexdigest()

    def archive_exact(self, roots, project, receipts, pin):
        self.calls.append(('archive',))

    def verify_archive_qa_root(self, roots, pin):
        if self.fail == 'archive-qa':
            raise RuntimeError('ARCHIVE_QA_OWED')

    def final_probe(self, roots, project):
        self.calls.append(('final',))

    def verify_formatted_aria_qa_root(self, changes):
        if not self.review:
            raise RuntimeError('ARIA_QA_ROOT_OWED')

    def verify_lease_amendment_without_extension(self, project, roots):
        bypath = {x['path']: x['sha256'] for x in project}
        self.lease_hashes = {roots['projectP'] + '/' + x['path']: bypath[x['path']] for x in self.plan['overlay']}

    def verify_separate_status(self, phase, status, pin):
        self.calls.append(('status', phase))

    def verify_final_inspection(self, pin):
        self.calls.append(('final-inspection',))

    def gate_probe(self, when, roots, project, pin):
        self.calls.append(('gate', when))
        if self.gate_advance and when == 'PRE':
            self.time += 61

    def verify_actual_wrapper_zero_and_outer_postclose(self, roots):
        self.calls.append(('actual-wrapper0-outer0',))

    def verify_postclose_absence_reuse_free_original_inode(self, roots):
        self.calls.append(('postclose-absence-original-inode-free',))

    def verify_postclose_qa_root(self, roots):
        self.calls.append(('postclose-qa-root',))


def new():
    p = FakePort()
    controller, ns = adapter['build_controller'](raw_source, source_pin, raw_plan, plan_pin, hashlib, json, p)
    return controller, p, ns


def decision(c, p, phase):
    return p.control({'unit': c.unit, 'phase': phase, 'principal': 'root', 'sequence': c.sequence + 1, 'previousReceipt': c.last, 'planSha256': c.plan_sha, 'approvalSha256': '3' * 64})


def run(c, p, phase):
    raw, pin = decision(c, p, phase)
    return c.invoke(phase, raw, pin)


def through(c, p, phases):
    for phase in phases:
        receipt = run(c, p, phase)
        if not receipt['accepted']:
            raise RuntimeError('FAKE_POSITIVE_' + phase + '_' + str(receipt) + '_FAKE_DEBUG_' + str(p.debug) + '_AUDIT_EVENTS_' + str(denied_events))


def denied_call(fn):
    try:
        fn()
    except BaseException:
        return True
    return False


c, p, ns = new()
through(c, p, ('prepare', 'format', 'verify', 'regression', 'archive', 'final'))
check('FLOW-01-exact-three-native-vectors', [x[1] for x in p.calls if x[0] == 'native'] == ['format', 'verify', 'regression'])
check('FLOW-02-final-before-status-denied', denied_call(lambda: c.guarded_gate(*decision(c, p, 'gate'), b'', '0' * 64)))
c.status('final', 0, c.last)
permit = p.control({'unit': c.unit, 'principal': 'root', 'finalReceipt': c.last, 'issued': 100, 'expires': 160, 'exitStatus': 0})
rec = c.guarded_gate(*decision(c, p, 'gate'), *permit)
check('FLOW-03-guard-pre-and-post', rec['accepted'] and [('gate', 'PRE'), ('gate', 'POST')] == [x for x in p.calls if x[0] == 'gate'])
c.status('gate', 0, c.last)
rec = c.postclose(*decision(c, p, 'postclose'))
check('FLOW-04-closed-resource-only-no-credit', rec['accepted'] and c.state == 'CLOSED_RESOURCE_ONLY' and rec['sourceApplyOrCredit'] is False)
check('FLOW-05-reserve-finish-receipt-order', all(p.calls.index(('reserve', phase)) < p.calls.index(('finish', phase)) < p.calls.index(('receipt', phase)) for phase in c.PHASES))

for name, edit in [
 ('MISSING-MODE', lambda f: f['sourceModes'].__setitem__(next(x['path'] for x in p.plan['finiteCopy']['members'] if x['mode'] is None), None)),
 ('EXTRA-MODE', lambda f: f['sourceModes'].__setitem__('extra', 420)),
 ('OFFLINE-CLOSURE', lambda f: f['offline'].__setitem__('closureQualified', False)),
 ('GATEWAY-CLOSE', lambda f: f.__setitem__('gatewayClosedQaRoot', False)),
 ('NONCREDIT-CERT', lambda f: f.__setitem__('noncreditCertificate', False)),
 ('ORDINARY-UNKNOWN', lambda f: f.__setitem__('ordinaryOwnershipQualified', False)),
 ('TOOL-UNKNOWN', lambda f: f['tools'].__setitem__('caffeinateSha256', None)),
 ('FIXTURE-UNKNOWN', lambda f: f['fixture'].__setitem__('javaFixtureQualified', False)),
 ('LEASE-NONEXCLUSIVE', lambda f: f['lease'].__setitem__('exclusive', False)),
 ('LEASE-EXPIRED', lambda f: f['lease'].__setitem__('expires', 100)),
 ('GUARD-BOOL-STATUS', lambda f: f.__setitem__('newGuardNegativeStatus', True)),
]:
 c,p,ns = new();p.admission_edit = edit
 rec = run(c,p,'prepare')
 check('PRE-'+name, not rec['accepted'] and c.hold and not any(x[0] == 'copy' for x in p.calls))

c,p,ns = new();p.r[0]['sha256']='4'*64
check('PRE-SOURCE-DRIFT', not run(c,p,'prepare')['accepted'] and not any(x[0] == 'copy' for x in p.calls))
c,p,ns = new();raw,pin=decision(c,p,'prepare')
check('PRE-CONTROL-PIN', not c.invoke('prepare',raw+' '.encode(),pin)['accepted'] and not any(x[0]=='copy' for x in p.calls))

for name, override in [('NATIVE-FAIL', {'nativeStatus':1}), ('BOOL-NATIVE', {'nativeStatus':False}), ('UNWAITED', {'allOwnedWaited':False}), ('STICKY', {'stickyUnknown':True}), ('DEADLINE', {'elapsedSeconds':901}), ('UTILITY-UNKNOWN', {'utilityRosterComplete':False})]:
 c,p,ns=new();through(c,p,('prepare',));p.native_override=override
 rec=run(c,p,'format')
 check('NATIVE-'+name, not rec['accepted'] and c.caps['format']==1 and c.hold and denied_call(lambda: run(c,p,'format')))

c,p,ns=new();through(c,p,('prepare',));p.fail='setup';rec=run(c,p,'format')
check('CAP-SETUP-FAIL-CONSUMED', not rec['accepted'] and c.caps['format']==1 and not any(x[0]=='native' for x in p.calls))
c,p,ns=new();through(c,p,('prepare',));p.native_override={'nativeStatus':1};p.fail='finish';rec=run(c,p,'format')
check('FAILURE-PRIMARY-CLEANUP-SEPARATE', rec['primary']=='NATIVE_NONZERO_OR_UNKNOWN' and rec['cleanup']==['OWNERSHIP_FINISH_UNKNOWN'] and 'raw' not in json.dumps(rec))
c,p,ns=new();p.fail='publish';rec=run(c,p,'prepare')
check('FAILURE-PUBLISH-UNKNOWN-HOLD', rec['accepted'] is False and 'RECEIPT_PUBLICATION_UNKNOWN' in rec['cleanup'] and c.hold)

c,p,ns=new();through(c,p,('prepare',));target=c.plan['overlay'][0]['path']
p.native_edit=lambda rows: next(x for x in rows if x['path']==target).__setitem__('sha256','5'*64)
rec=run(c,p,'format')
check('FORMAT-CHANGE-PAUSES', rec['accepted'] and c.state=='FORMAT_REVIEW_REQUIRED' and c.caps['verify']==0)
p.native_edit=None
c.adopt_formatted(*decision(c,p,'formatted-source-review'))
through(c,p,('verify','regression'))
check('FORMAT-REVIEW-LEASE-NEW-HASH-UNUSED-PHASES', c.state=='REGRESSION_OK' and c.caps['format']==1)
c,p,ns=new();through(c,p,('prepare',));p.native_edit=lambda rows: rows[0].__setitem__('sha256','6'*64)
check('FORMAT-NONTARGET-HOLD', not run(c,p,'format')['accepted'] and c.hold)
c,p,ns=new();through(c,p,('prepare','format'));p.bad_xml=True
check('VERIFY-PARTIAL-REPORT-HOLD', not run(c,p,'verify')['accepted'] and c.hold and c.caps['regression']==0)
c,p,ns=new();through(c,p,('prepare','format','verify'));p.bad_case=True
check('REGRESSION-CASE-MISMATCH-HOLD', not run(c,p,'regression')['accepted'] and c.hold)
c,p,ns=new();through(c,p,('prepare','format','verify','regression','archive'));p.fail='archive-qa'
check('FINAL-BEFORE-ACTUAL-QA-HOLD', not run(c,p,'final')['accepted'] and c.hold)
c,p,ns=new();through(c,p,('prepare','format','verify','regression','archive','final'));c.status('final',0,c.last);p.gate_advance=True
permit=p.control({'unit':c.unit,'principal':'root','finalReceipt':c.last,'issued':100,'expires':160,'exitStatus':0})
rec=c.guarded_gate(*decision(c,p,'gate'),*permit)
check('PERMIT-POST-EXPIRY-DENIED', not rec['accepted'] and c.hold and not any(x==('gate','POST') for x in p.calls))

# Actual selected historical functions run against pure fake observations; PID reuse never seeds ownership.
rows={10:{'ppid':1,'start':'new'},11:{'ppid':10,'start':'child'}}
check('CORE-PID-REUSE-NOT-OWNED',selected['owned_census_keys'](rows,{(10,'old')},99,1)==set())
classified=selected['classify_owned']({'pid':10,'start':'same'},None,None,'same',True)
check('CORE-UNKNOWN-WAIT',classified['executableState']=='UNKNOWN' and selected['ownership_drain_decision']({10:{'start':'same'}},{(10,'same'):classified},True)=='WAIT')
check('CORE-REAL-NATIVE-NOT-TERMINAL',selected['ownership_drain_decision']({}, {}, False)=='WAIT')
xml=b'<checkstyle version="10"><file name="/P/backend/src/A.java"><error line="3" column="2" severity="error" message="PRIVATE TEXT" source="Rule"/></file></checkstyle>'
projection=adapter['checkstyle_projection'](xml,'checkstyleTest','/P/backend',{'src/A.java'},{'Rule'},ET)
check('XML-CLOSED-PROJECTION-NO-MESSAGE','PRIVATE' not in json.dumps(projection) and projection['diagnosticCount']==1)
check('XML-OUTSIDE-PATH-DENIED',denied_call(lambda: adapter['checkstyle_projection'](xml,'checkstyleTest','/WRONG',{'src/A.java'},{'Rule'},ET)))
check('XML-DTD-DENIED',denied_call(lambda: adapter['checkstyle_projection'](b'<!DOCTYPE x><checkstyle version="1"/>','checkstyleTest','/P',set(),set(),ET)))
check('FACTORY-STALE-SOURCE-DENIED',denied_call(lambda: adapter['build_controller'](raw_source+b'\n',source_pin,raw_plan,plan_pin,hashlib,json,FakePort())))
check('AUDIT-OPEN-DENIED',denied_call(lambda: open('/nonexistent-should-never-be-opened','rb')))
check('NO-IMPORT-FALLTHROUGH',denied_call(lambda: __import__('not_loaded_never_import')))
print(json.dumps({'kind':'GST_INACTIVE_SOURCE01_FAKE_FLOW_RESULTS','passed':len(checks),'failed':0,'actualNativeInvocations':0,'actualRuntimeBoundaryInvocations':0,'historical99NativeReusedAsCurrent':False,'ordinaryAdapterImplemented':False,'persistentDenyAudit':True,'unknownModesInFakeOnly':'Synthetic explicit0644 facts are fake test inputs, not current284mode observations','checks':checks},indent=2))
