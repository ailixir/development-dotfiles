"""Light fake-helper conformance only. No Popen/subprocess/signal/native execution is permitted."""
import ast
from contextlib import ExitStack
import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import driver_support as ds
spec = importlib.util.spec_from_file_location('gsm_driver_under_test', HERE/'run-unit.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


class HeldLock(BaseException):
    pass


class FakeLock:
    def __init__(self, *args):
        self.calls = 0
    def verify(self):
        self.calls += 1
        return {'pid': 101, 'start': 'SAME_START', 'device': 1, 'inode': 2, 'kernelDenial': True}


class FakeNative:
    instances = []
    failure = None
    def __init__(self, lock, rec):
        self.lock, self.rec, self.calls = lock, rec, []
        self.closed = True
        self.instances.append(self)
    def drain(self):
        self.calls.append('drain')
    def run(self, command, cwd, env, log, phase):
        self.calls.append(phase)
        if phase == 'original-compile' and self.failure == 'original-fail':
            return 1
        if phase == 'original-compile' and self.failure == 'original-exception':
            raise OSError('fake only')
        return 0


class Base(unittest.TestCase):
    def setUp(self):
        (HERE/'test-scratch').mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=HERE/'test-scratch')
        self.root = Path(self.tmp.name)
        self.folder = self.root/'evidence'; self.folder.mkdir(mode=0o700)
        self.receipt = {'errors': [], 'events': [], 'interrupted': False}
        self.rec = ds.Recorder(self.folder, self.receipt)
        self.lock = FakeLock()
    def tearDown(self):
        self.tmp.cleanup()
    def journal(self):
        a, b = self.root/'a.java', self.root/'b.java'
        a.write_bytes(b'original-a'); a.chmod(0o640)
        b.write_bytes(b'original-b'); b.chmod(0o644)
        return ds.Journal(self.root,self.folder,{'a.java': b'candidate-a','b.java':b'candidate-b',
            'new.java':b'candidate-new'}, self.rec, self.lock.verify)


class LockTests(Base):
    def inputs(self):
        wrapper = self.root/'with-gradle-lock.py'; wrapper.write_text('IMMUTABLE')
        lock = self.root/'gradle.lock'; lock.write_text('')
        expected=[str(wrapper),sys.executable,str(self.root/'run-unit.py'),'freeze','obs011-fake',
            '--authorization',str(self.root/'auth.json'),'--root-proof-barrier-released']
        return wrapper,lock,expected
    def bind(self, *, wrong_start=False, wrong_device=False, wrong_inode=False,
             marker=False, kernel_free=False, changed_wrapper=False, split_fd=False):
        wrapper, lock, tail = self.inputs(); info=lock.stat(); parent=101
        actual=[sys.executable,*tail]
        if marker: actual=[sys.executable,'unrelated.py','--marker='+str(wrapper),*tail[1:]]
        def text(pid,column):
            return ('CHANGED' if wrong_start else 'SAME') if column=='lstart' else ' '.join(actual)
        output=f'p{parent}\nf3\nD{hex(info.st_dev+int(wrong_device))}\ni{info.st_ino+int(wrong_inode)}\nn{lock}\nlW\n'
        if split_fd: output=f'p{parent}\nf3\nD{hex(info.st_dev)}\ni0\nn{lock}\nf4\nD0x0\ni{info.st_ino}\nn{lock}\n'
        with ExitStack() as stack:
            stack.enter_context(patch.object(ds.os,'getppid',return_value=parent))
            stack.enter_context(patch.object(ds,'pid_text',side_effect=text))
            stack.enter_context(patch.object(ds,'capture',return_value=output))
            flock=stack.enter_context(patch.object(ds.fcntl,'flock'))
            if not kernel_free: flock.side_effect=BlockingIOError(errno.EAGAIN,'fake denial')
            bound=ds.ParentLock(self.root,wrapper,ds.sha(b'IMMUTABLE'),tail,sys.executable)
            if wrong_start: bound.start='ORIGINAL'
            if changed_wrapper: wrapper.write_text('CHANGED')
            return bound.verify()
    def test_exact_parent_fd_device_inode_kernel_and_wrapper(self):
        self.assertTrue(self.bind()['kernelDenial'])
    def test_marker_substring_parent_rejected(self):
        with self.assertRaises(ValueError): self.bind(marker=True)
    def test_reused_or_changed_parent_start_rejected(self):
        with self.assertRaises(ValueError): self.bind(wrong_start=True)
    def test_same_inode_wrong_device_rejected(self):
        with self.assertRaises(ValueError): self.bind(wrong_device=True)
    def test_same_device_wrong_inode_rejected(self):
        with self.assertRaises(ValueError): self.bind(wrong_inode=True)
    def test_device_and_inode_on_different_descriptors_rejected(self):
        with self.assertRaises(ValueError): self.bind(split_fd=True)
    def test_no_kernel_denial_rejected(self):
        with self.assertRaises(ValueError): self.bind(kernel_free=True)
    def test_immutable_wrapper_change_rejected(self):
        with self.assertRaises(ValueError): self.bind(changed_wrapper=True)


class OwnershipTests(Base):
    def row(self,pid=11,parent=10,start='S'):
        return {'pid':pid,'ppid':parent,'start':start}
    def test_unknown_is_not_non_jvm(self):
        value=ds.classify_owned(self.row(),None,None,'S')
        self.assertEqual(value['executableState'],'UNKNOWN')
        self.assertEqual(ds.ownership_drain_decision({11:self.row()},{(11,'S'):value},True),'WAIT')
    def test_missing_census_cannot_resolve(self):
        self.assertEqual(ds.ownership_drain_decision({}, {},True,False),'WAIT')
    def test_actual_child_terminal_required(self):
        self.assertEqual(ds.ownership_drain_decision({}, {},False),'WAIT')
    def test_reparent_retains_start_identity(self):
        known={(11,'S'):ds.classify_owned(self.row(),None,'java','S')}
        row=self.row(parent=1)
        self.assertIn((11,'S'),ds.owned_census_keys({11:row},known,99,10))
        self.assertEqual(ds.ownership_drain_decision({11:row},known,True),'WAIT')
    def test_java_exec_nonjava_stays_pending_until_absence(self):
        value=ds.classify_owned(self.row(),None,'java','S')
        value=ds.classify_owned(self.row(),value,'python','S')
        self.assertEqual(value['executableState'],'JAVA')
        self.assertEqual(ds.ownership_drain_decision({11:self.row()},{(11,'S'):value},True),'WAIT')
        self.assertEqual(ds.ownership_drain_decision({}, {(11,'S'):value},True),'RESOLVED')
    def test_nonjava_exec_unknown_then_java_not_lost(self):
        first=ds.classify_owned(self.row(),None,'sh','S')
        unknown=ds.classify_owned(self.row(),first,None,None,True)
        self.assertEqual(unknown['executableState'],'UNKNOWN')
        java=ds.classify_owned(self.row(),unknown,'java','S')
        self.assertEqual(java['executableState'],'JAVA')
    def test_different_start_resolves_only_old_identity(self):
        old=ds.classify_owned(self.row(),None,'java','S')
        self.assertEqual(ds.ownership_drain_decision({11:self.row(start='NEW')},{(11,'S'):old},True),'RESOLVED')
    def test_unrelated_inherited_jvm_is_not_owned(self):
        rows={11:self.row(),22:self.row(22,1,'INHERITED')}
        self.assertNotIn((22,'INHERITED'),ds.owned_census_keys(rows,{},11,10))
    def exercise_native(self, *, census_error=False, emit_error=False, wait_error=False):
        events=[]
        class Child:
            pid=11; returncode=0
            def poll(self): return 0
            def wait(self,timeout):
                events.append('wait')
                if wait_error and events.count('wait')==1: raise KeyboardInterrupt()
                return 0
        child=self.row(11,10,'C'); java=self.row(12,11,'J'); reparent=self.row(12,1,'J')
        snapshots=[{11:child,12:java},{12:reparent},{}]
        if census_error: snapshots.insert(0,OSError('fake census'))
        def census():
            item=snapshots.pop(0);events.append('census')
            if isinstance(item,BaseException):raise item
            return item
        def pid(pid,column):return ('java' if pid==12 else 'python') if column=='comm' else ('J' if pid==12 else 'C')
        original_emit=self.rec.emit
        failed=[False]
        def emit(phase,**kw):
            if emit_error and phase=='OWNED_NATIVE_STARTED' and not failed[0]:
                failed[0]=True;raise OSError('fake log/receipt interrupt')
            original_emit(phase,**kw)
        runner=ds.OwnedNative(self.lock,self.rec)
        with ExitStack() as stack:
            stack.enter_context(patch.object(ds.subprocess,'Popen',return_value=Child()))
            stack.enter_context(patch.object(ds,'table',side_effect=census))
            stack.enter_context(patch.object(ds,'pid_text',side_effect=pid))
            stack.enter_context(patch.object(ds.os,'getpid',return_value=10))
            stack.enter_context(patch.object(self.rec,'nap',return_value=None))
            stack.enter_context(patch.object(self.rec,'emit',side_effect=emit))
            if emit_error:
                with self.assertRaises(OSError):runner.run(['FAKE'],self.root,{},self.folder/'fake.log','fake')
            else:
                self.assertEqual(runner.run(['FAKE'],self.root,{},self.folder/'fake.log','fake'),0)
        self.assertTrue(runner.closed)
        self.assertEqual(len(snapshots),0)
        self.assertEqual(runner.child_start,'C')
    def test_reparented_jvm_drained_after_child_terminal(self):self.exercise_native()
    def test_census_error_does_not_bypass_drain(self):self.exercise_native(census_error=True)
    def test_log_io_error_after_popen_still_drains(self):self.exercise_native(emit_error=True)
    def test_wait_interrupt_does_not_bypass_drain(self):self.exercise_native(wait_error=True)


class JournalTests(Base):
    def check_original(self):
        self.assertEqual((self.root/'a.java').read_bytes(),b'original-a')
        self.assertEqual(stat.S_IMODE((self.root/'a.java').stat().st_mode),0o640)
        self.assertEqual((self.root/'b.java').read_bytes(),b'original-b')
        self.assertFalse((self.root/'new.java').exists())
    def test_exact_byte_mode_restore_and_owned_new_delete(self):
        journal=self.journal();journal.stage();self.assertTrue(journal.restore());self.check_original()
    def test_partial_temp_write_recovers_never_staged_originals(self):
        journal=self.journal();actual=ds.os.fdopen
        class ShortWriter:
            def __init__(self,stream):self.stream=stream
            def __enter__(self):return self
            def __exit__(self,*args):return self.stream.__exit__(*args)
            def write(self,data):self.stream.write(data[:2]);return 2
            def flush(self):self.stream.flush()
        def fdopen(*args,**kwargs):return ShortWriter(actual(*args,**kwargs))
        with patch.object(ds.os,'fdopen',side_effect=fdopen):
            with self.assertRaises(OSError):journal.stage()
        self.assertTrue(journal.restore());self.check_original()
        self.assertFalse(list(self.root.glob('*.tmp')))
    def test_fault_after_atomic_stage_rename_remains_owned_and_restores(self):
        journal=self.journal();actual=ds.os.fsync;counter=[0]
        def fsync(fd):
            if stat.S_ISDIR(os.fstat(fd).st_mode):
                counter[0]+=1
                if counter[0]==1:raise OSError('fake post-rename directory fsync')
            return actual(fd)
        with patch.object(ds.os,'fsync',side_effect=fsync):
            with self.assertRaises(OSError):journal.stage()
        self.assertTrue(journal.restore());self.check_original()
    def test_one_restore_io_failure_does_not_abort_other_paths(self):
        journal=self.journal();journal.stage();actual=ds.os.replace
        def replace(a,b):
            if Path(b)==self.root/'a.java':raise OSError('fake restore write failure')
            return actual(a,b)
        with patch.object(ds.os,'replace',side_effect=replace):self.assertFalse(journal.restore())
        self.assertEqual((self.root/'a.java').read_bytes(),b'candidate-a')
        self.assertEqual((self.root/'b.java').read_bytes(),b'original-b')
        self.assertFalse((self.root/'new.java').exists())
        self.assertEqual(len(self.receipt['sourceRestore']),3)
    def test_user_existing_edit_is_not_clobbered(self):
        journal=self.journal();journal.stage();(self.root/'a.java').write_bytes(b'USER_EDIT')
        self.assertFalse(journal.restore());self.assertEqual((self.root/'a.java').read_bytes(),b'USER_EDIT')
        self.assertEqual((self.root/'b.java').read_bytes(),b'original-b')
    def test_user_new_file_edit_is_not_deleted(self):
        journal=self.journal();journal.stage();(self.root/'new.java').write_bytes(b'USER_NEW')
        self.assertFalse(journal.restore());self.assertEqual((self.root/'new.java').read_bytes(),b'USER_NEW')
    def test_user_mode_change_is_not_silently_clobbered(self):
        journal=self.journal();journal.stage();(self.root/'a.java').chmod(0o600)
        self.assertFalse(journal.restore());self.assertEqual(stat.S_IMODE((self.root/'a.java').stat().st_mode),0o600)
    def test_receipt_io_failure_does_not_stop_restore(self):
        journal=self.journal();journal.stage();actual=ds.os.replace
        def replace(a,b):
            if Path(b).name=='receipt.json':raise OSError('fake evidence write failure')
            return actual(a,b)
        with patch.object(ds.os,'replace',side_effect=replace):self.assertTrue(journal.restore())
        self.check_original();self.assertIn('RECEIPT_PERSISTENCE_FAILED',self.receipt['errors'])


class FinalDecisionTests(unittest.TestCase):
    def setUp(self):self.runs=[{'suffix':s,'validatedComplete':True} for s in ['b01','b02','b03']]
    def keep(self,**kw):
        args=dict(phase='freeze',explicit_keep=True,runs=self.runs,proof_matches=True,errors=[],interrupted=False);args.update(kw)
        return ds.finalized_keep_allowed(**args)
    def test_all_three_complete_plus_final_proof_required(self):self.assertTrue(self.keep())
    def test_no_first_run_or_exception_cannot_keep(self):self.assertFalse(self.keep(runs=[]))
    def test_exception_before_second_receipt_cannot_keep(self):self.assertFalse(self.keep(runs=self.runs[:1]))
    def test_exception_before_third_receipt_cannot_keep(self):self.assertFalse(self.keep(runs=self.runs[:2]))
    def test_final_proof_error_cannot_keep(self):self.assertFalse(self.keep(proof_matches=False))
    def test_any_io_or_interruption_disables_keep(self):
        self.assertFalse(self.keep(errors=['IO']));self.assertFalse(self.keep(interrupted=True))
    def test_explicit_keep_and_exact_order_required(self):
        self.assertFalse(self.keep(explicit_keep=False));self.assertFalse(self.keep(runs=list(reversed(self.runs))))
    def test_native_phases_are_popen_only_not_subprocess_run(self):
        tree=ast.parse((HERE/'run-unit.py').read_text())
        calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)
               and isinstance(n.func.value,ast.Name) and n.func.value.id=='subprocess' and n.func.attr=='run']
        self.assertFalse(calls)


class CollectorValidationTests(Base):
    def fixture(self):
        import validate_collector
        execution=self.root/'results';execution.mkdir()
        label='obs011-fake-receipt';fqcn='example.CompleteIT'
        xml=execution/'test.xml';xml.write_text('<testsuite><testcase classname="example.CompleteIT" name="case()"/></testsuite>')
        native=execution/(label+'.log');native.write_text('> Task :test\n')
        data=execution/'test.exec';data.write_bytes(b'EXEC')
        def fact(path):
            state=ds.file_state(path)
            return {'path':str(path.relative_to(self.root)),'sha256':state['sha256'],
                    'bytes':len(state['bytes']),'mtimeNs':state['mtimeNs'],'mode':oct(state['mode']),
                    'task':'test','nonempty':True}
        from datetime import datetime,timezone,timedelta
        start=(datetime.now(timezone.utc)-timedelta(seconds=2)).isoformat()
        result={'started':start,'exit':0,'gradleExit':0,'explicitTestTasks':['test'],
                'requiredFreshExecTasks':['test'],'sourceStable':True,'distStable':True,
                'testInputStable':True,'taskCollectionComplete':True,
                'testcases':[{'task':'test','class':fqcn,'name':'case()','status':'PASS'}],
                'counts':{'total':1,'passed':1,'failed':0,'errors':0,'skipped':0},
                'xmlFiles':[fact(xml)],'jacocoExecFiles':[fact(data)],
                'logSha256':ds.sha(native.read_bytes())}
        path=execution/(label+'-results.json')
        def check():
            path.write_text(json.dumps(result))
            return validate_collector.validate(self.root,execution,label,[fqcn],['test'],
                [{'task':'test','class':fqcn,'name':'case()'}],0,datetime.now(timezone.utc).timestamp())
        return result,check
    def test_complete_fake_fresh_receipt_validates(self):
        result,check=self.fixture();self.assertTrue(check()['validatedComplete'])
    def test_missing_task_completeness_rejects(self):
        result,check=self.fixture();result['taskCollectionComplete']=False
        self.assertFalse(check()['validatedComplete'])
    def test_claimed_original_mtime_cannot_be_rebound(self):
        result,check=self.fixture();result['xmlFiles'][0]['mtimeNs']+=1
        with self.assertRaises(ValueError):check()
    def test_case_count_mismatch_rejects(self):
        result,check=self.fixture();result['counts']['total']=2
        self.assertFalse(check()['validatedComplete'])


class MainFailureWitnessTests(Base):
    def fake_workspace(self):
        here=self.root/'docs/package';here.mkdir(parents=True)
        (self.root/'backend').mkdir();(self.root/'backend/gradlew').write_text('DUMMY NEVER EXECUTE')
        wrapper=self.root/'.aiox/with-gradle-lock.py';wrapper.parent.mkdir();wrapper.write_text('DUMMY WRAPPER')
        files=[]
        for relative in [driver.SERVICE,driver.SESSION,driver.NEGATIVE]:
            p=self.root/relative;p.parent.mkdir(parents=True,exist_ok=True)
            new=relative==driver.NEGATIVE
            if not new:p.write_bytes(b'original');p.chmod(0o644)
            candidate=here/'repo'/relative;candidate.parent.mkdir(parents=True,exist_ok=True);candidate.write_bytes(b'candidate')
            files.append({'path':relative,'baseSha256':None if new else ds.sha(b'original'),
                          'draftSha256':ds.sha(b'candidate'),'forwardedUnchanged':False})
        proof=self.root/'backend/proof.java';proof.write_bytes(b'proof')
        manifest={'files':files,'proofFiles':[{'path':'backend/proof.java','S011Sha256':ds.sha(b'proof')}],
                  'unchangedGsTBatons':[],'mutants':{}}
        (here/'manifest.json').write_text(json.dumps(manifest))
        plan={'sourceManifestSha256':ds.sha((here/'manifest.json').read_bytes()),
              'immutableHelpers':{'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py':ds.sha(b'FAKE')},
              'proofModes':{'backend/proof.java':'0o644'},'sourceModes':{f['path']:'0o644' for f in files},
              'javaHome':'/FAKE/NEVER/EXECUTE'}
        for n in ['run-unit.py','driver_support.py','validate_collector.py','artifact-hashes.sha256']:
            (here/n).write_text('' if n=='artifact-hashes.sha256' else 'FAKE')
        (here/'driver-plan.json').write_text(json.dumps(plan));(here/'expected-discovery.json').write_text('{"cases":[]}')
        authorization={'authorized':True,'phase':'freeze','label':'obs011-fake','keepSuccessfulFreezeUnit':True,
             'rootProofBarrierReleased':True,'priorGateReceipts':{k:{'path':'backend/proof.java','sha256':ds.sha(b'proof')}
               for k in ['freshOriginalFullCheckCoverageSource','gsTFullGateLiteralS011Main','correctedGsmAGreenAndAcceptedBatons']}}
        for key,name in [('driverSha256','run-unit.py'),('supportSha256','driver_support.py'),
                         ('validatorSha256','validate_collector.py'),('planSha256','driver-plan.json'),
                         ('artifactLedgerSha256','artifact-hashes.sha256')]:authorization[key]=ds.sha((here/name).read_bytes())
        auth=self.root/'auth.json';auth.write_text(json.dumps(authorization))
        (self.root/'docs/qa/evidence/STUDIO-OBS-011/execution').mkdir(parents=True)
        argv=[str(here/'run-unit.py'),'freeze','obs011-fake','--authorization',str(auth),
              '--root-proof-barrier-released','--keep-successful-freeze-unit']
        return here,argv
    def exercise_main(self,fault):
        here,argv=self.fake_workspace();FakeNative.instances=[];FakeNative.failure=fault
        validation_calls=[0]
        final_proof_fault=[False]
        def validator(*args):
            validation_calls[0]+=1
            if fault=='result-json' and validation_calls[0]==1:raise json.JSONDecodeError('fake','',0)
            return {'validatedComplete':True,'failures':[]}
        actual_emit=ds.Recorder.emit
        def emit(rec,phase,**kw):
            actual_emit(rec,phase,**kw)
            if fault=='final-proof-io' and phase=='VALIDATED_COLLECTOR_RESULT' and kw.get('suffix')=='b03':
                final_proof_fault[0]=True
            if fault=='terminal-io' and phase=='UNIT_TERMINAL':
                rec.error('FAKE_TERMINAL_RECEIPT_IO')
            if fault=='late-io' and phase=='VALIDATED_COLLECTOR_RESULT' and kw.get('suffix')=='b03':
                rec.error('FAKE_LATE_RECEIPT_IO')
        def hold(rec,reason,lock):
            rec.error(reason);rec.emit('FAKE_HELD_LOCK_DISPOSITION',reason=reason)
            raise HeldLock(reason)
        def capture(*args):
            if fault=='listener-io':raise OSError('fake listener open/capture failure')
            return ''
        real_state=driver.file_state
        def state(path):
            if final_proof_fault[0] and Path(path).name=='proof.java':
                final_proof_fault[0]=False
                raise OSError('fake final proof read')
            return real_state(path)
        with ExitStack() as stack:
            stack.enter_context(patch.object(driver,'file_state',side_effect=state))
            stack.enter_context(patch.object(driver,'__file__',str(here/'run-unit.py')))
            stack.enter_context(patch.object(driver.sys,'argv',argv))
            stack.enter_context(patch.object(driver,'ParentLock',FakeLock))
            stack.enter_context(patch.object(driver,'OwnedNative',FakeNative))
            stack.enter_context(patch.object(driver,'immutable_inputs',return_value=None))
            stack.enter_context(patch.object(driver,'validate',side_effect=validator))
            stack.enter_context(patch.object(driver,'capture',side_effect=capture))
            stack.enter_context(patch.object(driver.signal,'signal',return_value='FAKE_HANDLER'))
            stack.enter_context(patch.object(ds.Recorder,'emit',emit))
            stack.enter_context(patch.object(ds.Recorder,'hold',hold))
            if fault in ['original-fail','original-exception']:
                # Force a source-restoring path before the intentionally failed original compile.
                stack.enter_context(patch.object(driver,'validate',side_effect=OSError('fake result IO')))
                with self.assertRaises(HeldLock):driver.main()
            else:self.assertEqual(driver.main(),0 if fault=='all-good' else 1)
        instance=FakeNative.instances[-1]
        receipt=json.loads(next((self.root/'docs/qa/evidence/STUDIO-OBS-011/execution/gs-m').glob('*/receipt.json')).read_text())
        if fault=='all-good':
            self.assertTrue(receipt['keptSuccessfulFreezeUnit']);self.assertTrue(receipt['finalizedSuccess'])
            self.assertNotIn('original-compile',instance.calls)
            for relative in [driver.SERVICE,driver.SESSION,driver.NEGATIVE]:
                self.assertEqual((self.root/relative).read_bytes(),b'candidate')
        else:
            self.assertFalse(receipt['keptSuccessfulFreezeUnit']);self.assertFalse(receipt['finalizedSuccess'])
            self.assertIn('post-decision-original-compile' if fault=='terminal-io' else 'original-compile',instance.calls)
            for relative in [driver.SERVICE,driver.SESSION]:self.assertEqual((self.root/relative).read_bytes(),b'original')
            self.assertFalse((self.root/driver.NEGATIVE).exists())
        return receipt
    def test_actual_main_listener_exception_cannot_keep(self):self.exercise_main('listener-io')
    def test_actual_main_json_exception_cannot_keep(self):self.exercise_main('result-json')
    def test_actual_main_io_after_three_results_cannot_keep(self):self.exercise_main('late-io')
    def test_actual_main_final_proof_io_cannot_keep(self):self.exercise_main('final-proof-io')
    def test_terminal_persistence_failure_reverts_previously_qualified_keep(self):self.exercise_main('terminal-io')
    def test_all_three_complete_validated_receipts_can_keep_exact_unit(self):self.exercise_main('all-good')
    def test_original_compile_failure_holds_no_ordinary_return(self):
        self.assertIn('ORIGINAL_COMPILE_FAILED_HOLD_NO_RETRY_OR_RELEASE',self.exercise_main('original-fail')['errors'])
    def test_original_compile_exception_holds_no_ordinary_return(self):self.exercise_main('original-exception')


if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    output={'kind':'ISOLATED_FAKE_HELPER_CONFORMANCE_ONLY','testsRun':result.testsRun,
            'failures':len(result.failures),'errors':len(result.errors),'passed':result.wasSuccessful(),
            'actualDriverOrHarnessNativeExecution':False,'actualProductSourceWrites':False,
            'actualPopenSubprocessSignalCalls':False,'workspace':'exclusive resume2/test-scratch only',
            'notRuntimeLaneQaCredit':True}
    (HERE/'conformance-results.json').write_text(json.dumps(output,indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful() else 1)
