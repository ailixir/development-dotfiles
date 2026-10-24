"""Extracted actual command/parser/finalizer AST fakes; never call a driver/collector entrypoint."""
import argparse
import ast
import copy
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
import xml.etree.ElementTree as ET
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'backend/gradlew').is_file())
sys.path.insert(0,str(HERE))
import driver_support as support
from validate_collector import validate
DRIVER_AST=ast.parse((HERE/'run-unit.py').read_text())
MAIN=next(n for n in DRIVER_AST.body if isinstance(n,ast.FunctionDef) and n.name=='main')
COLLECTOR=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py'
COLLECTOR_AST=ast.parse(COLLECTOR.read_text())
COLLECTOR_MAIN=next(n for n in COLLECTOR_AST.body if isinstance(n,ast.FunctionDef) and n.name=='main')


def parsed_contract(command):
    body=[]
    for n in COLLECTOR_MAIN.body:
        if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='root' for t in n.targets):break
        body.append(copy.deepcopy(n))
    ns={'argparse':argparse,'__doc__':'actual immutable collector parser only',
        'sys':types.SimpleNamespace(argv=command[1:]),
        'ALLOWED_TASKS':{'test','guidedIncrementalTest','crossReplicaTest'}}
    exec(compile(ast.fix_missing_locations(ast.Module(body=body,type_ignores=[])),
        'ACTUAL_COLLECTOR_PARSER_AST_NO_ENTRYPOINT','exec'),ns)
    return ns['tasks'],ns['required_exec']


def fake_receipt(root, execution, label, tasks, required_exec, selected):
    entries={group:[] for group in ['xmlFiles','testHtmlFiles','jacocoExecFiles','guidedCohortFiles','guardTallies']}
    cases=[]
    def put(task,group,relative,data,nonempty=False):
        path=execution/(label+'-task-outputs')/task/relative
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        fact=support.file_state(path)
        value={'path':str(path.relative_to(root)),'sha256':fact['sha256'],'bytes':len(data),
            'mode':oct(fact['mode']),'mtimeNs':fact['mtimeNs'],'task':task}
        if nonempty:value['nonempty']=True
        entries[group].append(value)
    for task in tasks:
        suite=ET.Element('testsuite')
        for fqcn in selected:
            ET.SubElement(suite,'testcase',classname=fqcn,name='case()')
            cases.append({'task':task,'class':fqcn,'name':'case()','status':'PASS'})
        put(task,'xmlFiles','xml/test.xml',ET.tostring(suite))
        html={'index.html'}|{'classes/'+c+'.html' for c in selected}|{'packages/'+c.rsplit('.',1)[0]+'.html' for c in selected}
        for name in html:put(task,'testHtmlFiles','html/'+name,b'FAKE DYNAMIC HTML')
        put(task,'jacocoExecFiles','exec/test.exec',b'FAKE EXEC',True)
        if len(tasks)==2:
            cohort={'lane':task,'invocations':[{'displayLabel':'case()','passed':True,'afterEachComplete':True}]}
            cohort.update({key:True for key in ['auditComplete','privacyComplete','producersDrained',
                'modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete']})
            put(task,'guidedCohortFiles','cohort/cohort.json',json.dumps(cohort).encode())
    native=execution/(label+'.log');native.write_text(''.join('> Task :'+t+'\n' for t in tasks))
    start=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=2)).isoformat()
    data={'started':start,'exit':0,'gradleExit':0,'explicitTestTasks':tasks,
        'requiredFreshExecTasks':sorted(required_exec),'sourceStable':True,'distStable':True,
        'testInputStable':True,'taskCollectionComplete':True,'testcases':cases,
        'counts':{'total':len(cases),'passed':len(cases),'failed':0,'errors':0,'skipped':0},
        'logSha256':support.sha(native.read_bytes()),**entries}
    (execution/(label+'-results.json')).write_text(json.dumps(data))
    return cases


class CommandContractTests(unittest.TestCase):
    traces=[]
    def exercise(self,suffix,omit=False):
        (HERE/'test-scratch').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=HERE/'test-scratch') as tmp:
            root=Path(tmp);execution=root/'execution';execution.mkdir();folder=root/'private';folder.mkdir()
            selected=['example.CompleteIT'];tasks=['test','guidedIncrementalTest'] if suffix=='b03' else ['test']
            expected=[{'task':t,'class':c,'name':'case()'} for t in tasks for c in selected]
            trace={}
            class Native:
                def run(self,command,*args):
                    emitted=list(command)
                    if omit:
                        index=emitted.index('--require-exec-tasks');del emitted[index:index+2]
                    parsed,required=parsed_contract(emitted)
                    trace.update({'suffix':suffix,'command':emitted,'selectedTasks':parsed,'requiredFreshExecTasks':sorted(required)})
                    fake_receipt(root,execution,'obs011-contract',parsed,required,selected)
                    return 0
            class Rec:
                def emit(self,*args,**kw):pass
            ns={'boundary':lambda:None,'folder':folder,'capture':lambda *args:'','sys':sys,
                'root':root,'env':{},'native':Native(),'validate':validate,'execution':execution,
                'expected':expected,'time':__import__('time'),'resource_policy':{'resources':[]},
                'proof_facts':lambda:{},'expected_proof':{},'receipt':{'runs':[]},'rec':Rec()}
            node=copy.deepcopy(next(n for n in MAIN.body if isinstance(n,ast.FunctionDef) and n.name=='run'))
            exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),
                'ACTUAL_NESTED_RUN_AST_ALL_NATIVE_FAKE','exec'),ns)
            accepted=ns['run'](suffix,'obs011-contract',selected)
            trace['actualAssessorAccepted']=accepted;trace['omittedForNegativeControl']=omit
            self.traces.append(trace)
            self.assertEqual(accepted,not omit)
            if not omit:self.assertEqual(set(trace['selectedTasks']),set(trace['requiredFreshExecTasks']))
    def test_b01_actual_command_parser_assessor_contract(self):self.exercise('b01')
    def test_b02_actual_command_parser_assessor_contract(self):self.exercise('b02')
    def test_b03_actual_command_parser_assessor_contract(self):self.exercise('b03')
    def test_single_task_phase_actual_command_parser_assessor_contract(self):self.exercise('green')
    def test_actual_collector_empty_default_is_rejected_if_option_removed(self):self.exercise('b03',True)


class ActualFinalizerTests(unittest.TestCase):
    traces=[]
    def exercise(self,fault):
        unit=next(n for n in MAIN.body if isinstance(n,ast.Try) and n.finalbody)
        node=ast.FunctionDef(name='isolated_actual_finalizer',args=ast.arguments(posonlyargs=[],args=[],
            kwonlyargs=[],kw_defaults=[],defaults=[]),body=copy.deepcopy(unit.finalbody),decorator_list=[])
        held=[];trace=[]
        class Hold(BaseException):pass
        class Rec:
            def error(self,code):receipt['errors'].append(code)
            def emit(self,phase,**kw):
                trace.append(phase)
                if phase=='UNIT_TERMINAL' and fault.startswith('post-terminal'):
                    self.error('FAKE_TERMINAL_PERSISTENCE_FAILURE')
            def hold(self,reason,lock):held.append(reason);trace.append('HELD');raise Hold()
        class Journal:
            def restore(self):trace.append('restore');return True
            def originals_match(self):trace.append('post-compile-proof');raise OSError('FAKE_PROOF_READ')
        class Native:
            def drain(self):trace.append('drain')
        def compile_phase(name):
            trace.append(name)
            if fault=='post-terminal-original-compile-exception':raise OSError('FAKE_COMPILE')
            return 0
        complete=[{'suffix':s,'validatedComplete':True} for s in ['b01','b02','b03']]
        receipt={'errors':[],'runs':complete,'interrupted':False,
            'finalizedSuccess':fault.startswith('post-terminal'),'keptSuccessfulFreezeUnit':False,
            'originalCompileSucceeded':False}
        ns={'receipt':receipt,'native':Native(),'boundary':lambda:trace.append('boundary'),
            'proof_facts':lambda:{'proof':'same'},'expected_proof':{'proof':'same'},'manifest':{'files':[]},
            'rec':Rec(),'args':types.SimpleNamespace(phase='freeze',keep_successful_freeze_unit=True),
            'finalized_keep_allowed':support.finalized_keep_allowed,'journal':Journal(),
            'compile_unit':compile_phase,'lock':object(),'saved_handlers':{}}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),
            'ACTUAL_FINALIZER_AST_ALL_SOURCE_NATIVE_FAKE','exec'),ns)
        with self.assertRaises(Hold):ns['isolated_actual_finalizer']()
        self.assertTrue(held);self.assertIn('restore',trace)
        self.assertFalse(receipt['finalizedSuccess']);self.assertFalse(receipt['keptSuccessfulFreezeUnit'])
        self.assertFalse(receipt['sourceRestored']);self.assertFalse(receipt['originalCompileSucceeded'])
        self.assertEqual(trace[-3:],['drain','boundary','HELD'])
        self.traces.append({'fault':fault,'disposition':'HELD_NOT_ESCAPING_OSERROR','heldReason':held,
            'trace':trace,'finalizedSuccess':receipt['finalizedSuccess'],
            'keptSuccessfulFreezeUnit':receipt['keptSuccessfulFreezeUnit']})
    def test_normal_second_original_integrity_read_exception_holds(self):self.exercise('original-second-proof-read')
    def test_post_terminal_original_compile_exception_holds(self):self.exercise('post-terminal-original-compile-exception')
    def test_post_terminal_second_original_integrity_read_exception_holds(self):self.exercise('post-terminal-second-proof-read')


if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    out={'kind':'EXTRACTED_ACTUAL_AST_FAKE_CONFORMANCE_ONLY','testsRun':result.testsRun,'passed':result.wasSuccessful(),
        'commandContract':CommandContractTests.traces,'threeActualFinalizerWitnesses':ActualFinalizerTests.traces,
        'collectorParserSha256':support.sha(COLLECTOR.read_bytes()),'noActualEntryPointOrNativeExecution':True,
        'productSourceOrLiveOutputWrites':False,'scope':'exclusive resume3/test-scratch; fake native/source/parent/signal operations'}
    (HERE/'final-findings-conformance.json').write_text(json.dumps(out,indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful() else 1)
