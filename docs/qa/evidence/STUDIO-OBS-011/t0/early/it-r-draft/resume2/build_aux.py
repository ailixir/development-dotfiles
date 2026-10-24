"""Off-tree static source/receipt maps and inert private scratch commands. No Java/native execution."""
from pathlib import Path
import json,hashlib
OUT=Path(__file__).resolve().parent
ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
base=(OUT/'stages/00-test001/repo'/REL).read_text()
body='''  void auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass() throws Exception {
    itrEstablishOwnAuditCorpus();
    scanAuditContent();
    itrAssertAuditCorpus();
  }'''
assert base.count(body)==1
rows=[]
for m in json.loads((OUT/'mutation-plan.json').read_text())['mutants']:
 source=(OUT/'mutations'/m['id']/'repo'/REL).read_text()
 row=dict(m,fullSourcePath=str(Path('mutations')/m['id']/'repo'/REL),
  restorePatchSha256=sha((OUT/'mutations'/m['id']/'restore-test001.patch').read_bytes()),
  genuineOrder39BodySha256=sha(body),genuineOrder39BodyPreserved=source.count(body)==1)
 if m['id'] in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch','M-gate-true-subset']:
  for marker,key in [('itrFinalFaultActive = true;','activationLine'),('privateImmutableJson(COHORT_DIRECTORY.resolve("privacy-itr-final-fault-"','receiptLine'),('private static void itrAssertAuditCorpus()','assertionMethodLine'),('scanCompleteAuditStream("OWNED_SINKS",','ownedSinkCallLine'),('scanCompleteAuditStream("CONTEXT_CLOSED",','closedContextCallLine')]:
   assert source.count(marker)==1;row[key]=source[:source.index(marker)].count('\n')+1
  a=source.index('  private static void itrAssertAuditCorpus()');b=source.index('  private static void scanAuditContent()',a)
  row['actualAssertionBlockSha256']=sha(source[a:b]);row['actualAssertionBlock']=source[a:b]
  row['activationPath']='Actual final caller → unconditional content scan → gate → value-free receipt → scoped fault → original assertion → finally clear fault.'
  row['gate']='Genuine exact actual multiplicities for3 vacuity controls; force-true subset negative separately forces only gate. Independent receipt predicate remains genuine.'
  row['requiredRealBoundaryControls']='Three vacuity faults require realCanaryCount/realAdmittedCount/realDispatchedCount>0 before fault; force-true synthetic-scanner singleton requires actual1/expected46, genuine exact=false and realCanaryCount=0.'
 rows.append(row)
(OUT/'boundary-mutation-source-map.json').write_text(json.dumps(rows,indent=2)+'\n')
# Exact already-installed six dependency identities, without resolver/compiler/JVM execution.
cache=Path('/Users/brunobuger/.gradle/caches/modules-2/files-2.1');jars=[]
for group,name,version in [('org.awaitility','awaitility','4.2.2'),('org.hamcrest','hamcrest','2.2'),('org.assertj','assertj-core','3.25.3'),('com.fasterxml.jackson.core','jackson-databind','2.17.2'),('com.fasterxml.jackson.core','jackson-core','2.17.2'),('com.fasterxml.jackson.core','jackson-annotations','2.17.2')]:
 matches=list((cache/group/name/version).glob('*/*.jar'));assert len(matches)==1,(name,len(matches))
 f=matches[0];jars.append(dict(coordinate=f'{group}:{name}:{version}',path=str(f),sha256=sha(f.read_bytes())))
classpath=':'.join(j['path'] for j in jars);scratch=OUT/'scratch'
(scratch/'classpath.txt').write_text(classpath+'\n');(scratch/'classpath-manifest.json').write_text(json.dumps(jars,indent=2)+'\n')
plan=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/plan.json';jdk=json.loads(plan.read_text())['javaHome']
run=scratch/'runs/obs011-itr-r2-wait-proof01';classes=run/'classes';source=scratch/'ItrWaitDifferentialScratch.java'
fresh="python3 -c 'from pathlib import Path; p=Path(\""+str(run.relative_to(ROOT))+"\"); assert not p.exists(), \"fresh private scratch path required\"; (p/\"classes\").mkdir(parents=True, mode=0o700)'"
commands=[fresh,
 f"'{jdk}/bin/javac' --release 21 -cp '{classpath}' -d '{classes}' '{source}' > '{run}/private-compile.log' 2>&1",
 f"'{jdk}/bin/java' -cp '{classes}:{classpath}' ItrWaitDifferentialScratch > '{run}/closed-pairs.log' 2> '{run}/private-stderr.log'"]
(scratch/'future-commands.json').write_text(json.dumps(dict(status='UNEXECUTED_NOT_AUTHORIZED',commands=commands,
 sourceSha256=sha(source.read_bytes()),javaHome=jdk,classpathManifestSha256=sha((scratch/'classpath-manifest.json').read_bytes()),
 requires=['Independent source/scratch QA review and root separate lock/runtime authorization; never alongside native timing unit',
 'Run from repository root with inherited ROOT/PATH/JDK21 policy and private umask077; do not dump environment',
 'Execute sequentially only on success; no retry; fresh path guard fails on any existing run directory',
 'Verify6 pinned jars and exact source/JDK21 binary identities against root reviewed baton before future compile',
 'Actual compiler/API/runtime behavior unproved; compile failure is incomplete proof, never a passing edge comparison',
 'Wait actual owned Java exit; observation timeout cannot imply terminal; owned thread joins/cleanup are bounded and failures explicit',
 'Export only closed paired facts/hashes. Keep compile/stderr logs private; never export raw stack/message/identity/values'],
 nativeDatabaseProviderCalls=False,canonicalJUnitTestMethodsAdded=0,fullClassApplySlotCost=0),indent=2)+'\n')
print(json.dumps({'boundaryMutants':4,'scratchPinnedJars':6,'executed':False}))
