import ast, hashlib, json, shlex, stat
from pathlib import Path
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-source04-bin-app-failure-disposition-design')
O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-source04-bin-app-failure-disposition-design-review')
results=[]
def check(name, value):
 results.append({'id':name,'passed':bool(value)})
 if not value: raise AssertionError(name)
def sha(b): return hashlib.sha256(b).hexdigest()
manifest=(S/'manifest.json').read_bytes()
check('EXACT_SUBJECT',sha(manifest)=='77c2f47d3448d216c5ea36a29b24927093b98ea35f4c5e9fd5c0a817f9a6414c')
subject=json.loads(manifest); pp=json.loads((S/'pins.json').read_bytes())['pins']
# Every acquisition is one exact named public source/review/trace pin, never a path from runtime metadata.
rows=json.loads((O/'pins.json').read_text())['pins']+pp
for i,r in enumerate(rows):
 p=Path(r['path']); check(f'PUBLIC_PATH_{i}',str(p).startswith('docs/qa/evidence/STUDIO-OBS-011/t0/') and '..' not in p.parts)
 b=p.read_bytes(); m=p.lstat(); check(f'HASH_{i}',sha(b)==r['sha256']); check(f'BYTES_{i}',len(b)==r['bytes']);check(f'MODE_{i}',stat.S_IMODE(m.st_mode)==r['mode']);check(f'REGULAR_{i}',stat.S_ISREG(m.st_mode))
check('EXACT_PIN_COUNT',len(pp)==186);check('EXACT_PAYLOAD_COUNT',len(rows)==198)
body=(S/'python-self-roles.py.txt').read_bytes(); boot=(S/'self-role-bootstrap.py.txt').read_text(); bash=(S/'proposed-invocation.bash.txt').read_text(); d=json.loads((S/'design.json').read_bytes()); freeze=json.loads((S/'freeze-scope-proposal.json').read_bytes()); own=json.loads((S/'checks.json').read_bytes()); fake=json.loads((O/'fake.stdout').read_bytes())
check('EXACT_BODY_SHA',sha(body)==d['proposedHelper']['payloadSha256']); check('BODY_SHA_IN_BOOTSTRAP',sha(body) in boot)
check('SAME_RAW_HASH_COMPILE',"hashlib.sha256(raw).hexdigest()" in boot and "exec(compile(raw," in boot)
check('EMBEDDED_BOOTSTRAP_EXACT',shlex.quote(boot) in bash)
check('ONE_CANONICAL_LAUNCH',bash.count(" -B -c ")==1)
check('CAP_BEFORE_LAUNCH',bash.index('readonly GATEWAY_SELFROLE04_STARTED=1')<bash.index(' -B -c '))
check('READ_BUFFER_BOUNDED',"read -r -d '' -n 4097" in bash and 'readonly GATEWAY_SELFROLE04_SOURCE_BUFFER' in bash)
check('SAME_READONLY_BODY_ARG','"$GATEWAY_SELFROLE04_SOURCE_BUFFER" < /dev/null' in bash)
check('NAMED_READ_STATUS_AND_PARENT','${GATEWAY_SELFROLE04_READ_STATUS-} == 1' in bash and '$$ == 3749 && $PPID == 3720' in bash)
check('READONLY_FUNCTION_PROMPT','readonly -f gateway_python_self_roles04_once' in bash and 'Stop for genuine prompt' in bash)
check('NO_ACTUAL_INVOCATION',all(not l.startswith('if gateway_python_self_roles04_once') for l in bash.splitlines()))
check('AUTHOR756_SOURCE_ONLY',own['checks']==756 and all(r['passed'] for r in own['results']) and own['syntaxCompiledOnly']==2 and own['literalsExecuted']==0 and own['actualRuntimeActions']==0)
check('MODEL28_SIX',fake['checks']==28 and len(fake['cases'])==6 and all(x['passed'] for x in fake['results']))
check('MODEL_ZERO_ACTUAL',fake['boundaryAttempts']==[] and fake['actualDiagnosticOrProcessActions']==0 and fake['nestedExecUsesSameFakeImports'])
check('MODEL_KNOWN_PID_LOSS_BODY',next(x for x in fake['cases'] if x['case']=='body-invalid-parent')['record']['pid'] is None)
check('MODEL_KNOWN_PID_LOSS_BOOTSTRAP',next(x for x in fake['cases'] if x['case']=='bootstrap-integrity-and-parent-failure')['record']['pid'] is None)
f=d['futureFreeze']; check('EIGHT_UNOBSERVED',len(f['expectedMembers'])==8 and f['expectedMemberCountToVerify']==8 and not f['postFailureMembershipObserved'])
check('CLOSED_FREEZE_LIMITS',f['limits']=={'directNameCensusMaximum':9,'perMemberBytes':1048576,'aggregateAcquiredBytes':8388608})
check('FREEZE_MODES_LINKS',all(x['expectedMode']==384 and x['expectedUid']==501 and x['expectedNlink']==1 for x in f['expectedMembers']))
check('UNKNOWN_SETUP_SIZE',sum(x['expectedBytes'] is None for x in f['expectedMembers'])==1)
check('FOUR_SETUP_NOT_FAILED',len(d['typedKnownRecords']['successfulSetupHelpers'])==4 and all(x['actualSeparateWait']==0 for x in d['typedKnownRecords']['successfulSetupHelpers']))
check('FAILED_CLIENT_DISTINCT',d['typedKnownRecords']['failedProvisionalClient']['pid']==25986 and d['typedKnownRecords']['failedProvisionalClient']['actualOuterStatus']==1)
check('UTILITY_WAIT_DISTINCT',d['typedKnownRecords']['provisionalUtility']['pid']==26057 and d['typedKnownRecords']['provisionalUtility']['status']==0 and d['typedKnownRecords']['provisionalUtility']['ppid'] is None)
check('NO_ROLE_VALUES_INFERRED',d['actualPythonRoleValues'] is None and not d['roleValuesEstablished'] and not d['roleEquivalenceSelected'])
check('NO_BORROW_OR_MUTATION',not d['source09ProfileBorrowed'] and not d['failurePredicatesWeakened'] and not d['runtimeInstallerImplemented'] and not d['actualRuntimeAuthorized'])
check('HISTORY_TIMESTAMPS_HONEST','manually entered inaccurately' in d['timestampCorrection'] and d['timestamp'] is None)
# AST inspection is parsing only, not Bash/platform execution or target helper compilation.
check('PID_TUPLE_PRESENT_BOTH','pid, ppid = os.getpid(), os.getppid()' in body.decode() and 'pid, ppid = os.getpid(), os.getppid()' in boot)
report={'kind':'BOUNDED_PUBLIC_DOCUMENT_STATIC_VERIFICATION','checks':len(results),'results':results,'verifiedSubjectPayloads':12,'verifiedExactPublicPins':186,'reusedAuthorFiniteChecks':756,'reusedAuthorSyntaxOnly':2,'independentFakeCases':6,'independentFakeChecks':28,'mandatoryCategories':1,'actualTargetActions':0,'runtimeResourceReads':0,'bashExecuted':False,'sourceOnly':True,'displayTruncationsPreserved':'Prior combined read outputs truncated; relevant design and both full reviews reread; complete exact bytes verified here.'}
(O/'checks.json').write_text(json.dumps(report,indent=2)+'\n')
pins=json.loads((O/'pins.json').read_text());pins['exactPublicDependencyPins']=pp;pins['verifiedDependencyCount']=186;(O/'pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print(json.dumps({'checks':len(results),'subjectPayloads':12,'publicPins':186,'independentFakeChecks':28,'fakeCases':6,'mandatoryCategories':1,'actualTargetActions':0}))
