from pathlib import Path
import hashlib,json,difflib
r=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c11-public-clear-isolated-author');p=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
b=(r/'before'/p).read_text();s=b;changes=[]
def edit(o,n):
 global s
 assert s.count(o)==1,(o[:80],s.count(o));s=s.replace(o,n,1);changes.append((o,n))
# Exact pure scanner extraction; old SDK generated body reconstructs by expanding this placeholder.
start=b.index('        const c5Variants=value=>{');stop=b.index('        // Selected C6 observes',start)
fragment=b[start:stop];assert fragment.endswith('        };\n')
edit('        import {installObservationCollector as c6TrustedCollector} from %s;\n'+fragment,
     '        import {installObservationCollector as c6TrustedCollector} from %s;\n        %s\n')
edit('''            JSON.writeValueAsString(
                Path.of("../studio-runner/dist/run/observationCollector.js")
                    .toAbsolutePath()
                    .normalize()
                    .toUri()
                    .toString()));
  }

  private static String p3GuidedLaunchCounter''','''            JSON.writeValueAsString(
                Path.of("../studio-runner/dist/run/observationCollector.js")
                    .toAbsolutePath()
                    .normalize()
                    .toUri()
                    .toString()),
            c5ProfileScannerSupport());
  }

  private static String p3GuidedLaunchCounter''')
shared='''  private static String c5ProfileScannerSupport() {
    return """
'''+fragment+'''        """.stripTrailing();
  }

'''
edit('''  private static String p4NativeCloseObserverSdk() throws Exception {''',shared+'''  private static String p4NativeCloseObserverSdk() throws Exception {''')
# Selected case observes existing parent witness before original global profile checks; no count padding.
edit('''      assertThat(P3_RECEIPTS).isEmpty();
      p3Scan(List.of(value));
      assertJoinedSinkAbsent(retained, value);''','''      assertThat(P3_RECEIPTS).isEmpty();
      ObjectNode profileWitness = p9PostClearProfileWitness(state);
      p3Scan(List.of(value));
      assertJoinedSinkAbsent(retained, value);''')
edit('''              .put("postFaultScratchProfileObserved", false)''','''              .put("postFaultScratchProfileObserved", profileWitness.path("postFaultScratchProfileObserved").booleanValue())
              .put("postFaultProfileSampleOrdinal", profileWitness.path("profileSampleOrdinal").asInt())
              .put("originalQuiesceObserved", profileWitness.path("quiesceObserved").booleanValue())
              .put("originalQuiescentTrue", profileWitness.path("quiescentTrue").booleanValue())''')
java='''  private static ObjectNode p9PostClearProfileWitness(P4RevocationState state) throws Exception {
    Path file = TEMP.resolve("p3-c11-midfill-process.json");
    assertThat(Files.isRegularFile(file, java.nio.file.LinkOption.NOFOLLOW_LINKS) && !Files.isSymbolicLink(file)).isTrue();
    assertThat(Files.size(file)).isLessThanOrEqualTo(1024);
    assertThat(Files.getPosixFilePermissions(file)).isEqualTo(
        java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
    ObjectNode witness = (ObjectNode) C.parse(Files.readString(file, StandardCharsets.UTF_8));
    requireNumericBudgetEvidence(witness);
    assertThat(witness.size()).isEqualTo(9);
    assertThat(witness.path("case").asInt(-1) == state.ordinal
        && witness.path("epoch").asInt(-1) == state.ordinal).isTrue();
    for (String field : List.of("postFaultScratchProfileObserved", "quiesceObserved", "quiescentTrue",
        "readyAllocationMatched", "profileInodeMatched", "observerFailed")) {
      assertThat(witness.path(field).isBoolean()).isTrue();
    }
    assertThat(witness.path("observerFailed").booleanValue()).isFalse();
    assertThat(witness.path("quiesceObserved").booleanValue()
        && witness.path("quiescentTrue").booleanValue()
        && witness.path("readyAllocationMatched").booleanValue()
        && witness.path("profileInodeMatched").booleanValue()
        && witness.path("postFaultScratchProfileObserved").booleanValue()).isTrue();
    int ordinal = p4Number(witness, "profileSampleOrdinal");
    List<String> rows = Files.readAllLines(TEMP.resolve("c5-profile-counts.jsonl"));
    assertThat(ordinal).isBetween(1, rows.size());
    JsonNode sample = C.parse(rows.get(ordinal - 1));
    assertThat(sample.path("failed").isBoolean() && !sample.path("failed").booleanValue()).isTrue();
    assertThat(sample.path("hits").asLong(-1)).isZero();
    assertThat(sample.path("files").asLong(-1)).isPositive();
    return witness;
  }

'''
edit('''  private static void p9DrainRetainedChild(P6ChildCut cut) throws Exception {''',java+'''  private static void p9DrainRetainedChild(P6ChildCut cut) throws Exception {''')
# Original public dependencies: same config/factory once, preserve original create/clear promises.
edit('''            + "});const app=createApplication(loadConfig("
            + env
            + "),{launcher,http:revHttp,runtimeVersions:loadRuntimeVersions(),observed:{build,policies:["''','''            + "});const cutConfig=loadConfig("
            + env
            + ");const app=createApplication(cutConfig,{launcher,http:revHttp,scratch:cutScratchStore(cutConfig.scratchDir),runtimeVersions:loadRuntimeVersions(),observed:{build,policies:["''')
# Extend existing spawner observation only; old Ready/header code unchanged.
edit('''        const cutRealSpawner=createForkSpawner(),cutReady=new Map();''','''        const cutRealSpawner=createForkSpawner(),cutReady=new Map(),cutStops=new Map();''')
edit('''          const handle=cutRealSpawner.spawn(request);
          handle.onMessage(message=>{''','''          const handle=cutRealSpawner.spawn(request);
          try{const selected=revMode();
          if(selected?.childCut===true&&selected.c6===2&&selected.path===2){
            const stop={pid:handle.pid,mode:selected,observed:false,result:null};
            cutStops.set(handle,stop);
            const original=handle.quiesce;
            if(typeof original==='function'){
              handle.quiesce=function(...args){
                let result;try{result=Reflect.apply(original,this,args);}catch(error){stop.observed=true;stop.result=null;throw error;}
                try{result.then(value=>{stop.observed=true;stop.result=typeof value==='boolean'?value:null;},
                  ()=>{stop.observed=true;stop.result=null;}).catch(()=>{stop.observed=true;stop.result=null;});}
                catch{stop.observed=true;stop.result=null;}return result;
              };
            }
          }}catch{/* Missing observation remains unknown; original spawn and listeners continue. */}
          handle.onMessage(message=>{''')
edit('''              cutReady.set(ready.runId,{pid:handle.pid,ready});''','''              cutReady.set(ready.runId,{pid:handle.pid,ready,stop:cutStops.get(handle)});''')
# Public helper appended within existing parent-only script, no SDK hooks/imports.
script='''
        import {createFsScratchStore as cutFsScratchStore} from %s;
        import {SCRATCH_SUBDIRECTORIES as cutScratchLayout} from %s;
        import * as p4Fs from 'node:fs';import {join as cutJoin,dirname as cutDirname} from 'node:path';
        const c5ValuesFile=%s,c5CountsFile=%s,cutProfileWitnessFile=%s,cutProducerRoot=%s;
        %s
        const cutCounts=()=>{
          const stat=p4Fs.lstatSync(c5CountsFile);
          if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o777)!==0o600||stat.size>1048576)throw new Error('COUNTS');
          return p4Fs.readFileSync(c5CountsFile,'utf8').trimEnd().split('\\\\n');
        };
        const cutRecord=record=>{try{
          if(p4Fs.existsSync(cutProfileWitnessFile)){const old=p4Fs.lstatSync(cutProfileWitnessFile);
            if(old.isSymbolicLink()||!old.isFile()||(old.mode&0o777)!==0o600)throw new Error('WITNESS');}
          const fd=p4Fs.openSync(cutProfileWitnessFile,p4Fs.constants.O_WRONLY|p4Fs.constants.O_CREAT|
            p4Fs.constants.O_TRUNC|p4Fs.constants.O_NOFOLLOW,0o600);
          try{p4Fs.writeSync(fd,JSON.stringify(record));}finally{p4Fs.closeSync(fd);}
        }catch{try{const fd=p4Fs.openSync(c5CountsFile+'-failed',p4Fs.constants.O_WRONLY|p4Fs.constants.O_CREAT|
          p4Fs.constants.O_APPEND|p4Fs.constants.O_NOFOLLOW,0o600);try{p4Fs.writeSync(fd,'1');}finally{p4Fs.closeSync(fd);}}catch{}}};
        const cutScratchStore=root=>{
          const original=cutFsScratchStore(root);
          return {create(...args){const result=Reflect.apply(original.create,original,args),selected=revMode(),admission=args[0];
            if(selected?.childCut===true&&selected.c6===2&&selected.path===2){
              try{result.then(run=>{
                try{const descriptor=Object.getOwnPropertyDescriptor(run,'clear'),clear=run.clear;
                  if(typeof clear!=='function')throw new Error('CLEAR');
                  const wrapped=function(...clearArgs){
                    const record={case:selected.case,epoch:selected.epoch,postFaultScratchProfileObserved:false,
                      quiesceObserved:false,quiescentTrue:false,readyAllocationMatched:false,profileInodeMatched:false,
                      observerFailed:false,profileSampleOrdinal:0};
                    try{
                      const mode=revMode(),witness=cutReady.get(selected.executionId),stop=witness?.stop;
                      if(mode?.case!==selected.case||mode.epoch!==selected.epoch||mode.executionId!==selected.executionId
                        ||!witness?.ready||witness.failed||witness.ready.runId!==selected.executionId
                        ||witness.ready.admissionId!==admission||stop?.pid!==witness.pid
                        ||stop.mode.case!==selected.case||stop.mode.epoch!==selected.epoch||stop.mode.executionId!==selected.executionId)throw new Error('IDENTITY');
                      record.readyAllocationMatched=true;record.quiesceObserved=stop.observed===true;
                      record.quiescentTrue=stop.observed===true&&stop.result===true;
                      if(!record.quiescentTrue)throw new Error('QUIESCENCE');
                      const allocated=p4Fs.realpathSync(run.path),rootPath=p4Fs.realpathSync(root),runStat=p4Fs.lstatSync(run.path);
                      if(allocated!==run.path||cutDirname(allocated)!==rootPath||runStat.isSymbolicLink()
                        ||!runStat.isDirectory()||runStat.uid!==process.getuid()||(runStat.mode&0o777)!==0o700
                        ||cutJoin(rootPath,admission)!==allocated)throw new Error('ALLOCATION');
                      const receipt=cutJoin(cutProducerRoot,selected.case+'-3.json'),stat=p4Fs.lstatSync(receipt);
                      if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o777)!==0o600||stat.size>1024)throw new Error('PROFILE');
                      const source=JSON.parse(p4Fs.readFileSync(receipt,'utf8'));
                      if(source.case!==selected.case||source.epoch!==selected.epoch||source.producer!==3
                        ||!Number.isSafeInteger(source.profileDev)||!Number.isSafeInteger(source.profileIno)
                        ||source.profileIno<1)throw new Error('PROFILE');
                      const profile=cutJoin(allocated,cutScratchLayout.profile),info=p4Fs.lstatSync(profile);
                      if(info.isSymbolicLink()||!info.isDirectory()||p4Fs.realpathSync(profile)!==profile
                        ||info.uid!==process.getuid()||(info.mode&0o777)!==0o700
                        ||info.dev!==source.profileDev||info.ino!==source.profileIno)throw new Error('PROFILE');
                      record.profileInodeMatched=true;
                      const before=cutCounts().length;c5ProfileScan(profile);const after=cutCounts();
                      if(after.length!==before+1)throw new Error('SCAN');
                      const sample=JSON.parse(after[before]);
                      if(sample.failed!==false||sample.hits!==0||!Number.isSafeInteger(sample.files)||sample.files<1
                        ||!Number.isSafeInteger(sample.bytes)||sample.bytes<1)throw new Error('SCAN');
                      record.profileSampleOrdinal=before+1;record.postFaultScratchProfileObserved=true;
                    }catch{record.observerFailed=true;}
                    cutRecord(record);
                    // Observer refusal cannot prevent, retry or replace the original clear/error/promise.
                    return Reflect.apply(clear,this,clearArgs);
                  };
                  if(!Reflect.defineProperty(run,'clear',{...(descriptor??{configurable:true,writable:true,enumerable:true}),value:wrapped}))throw new Error('CLEAR');
                }catch{cutRecord({case:selected.case,epoch:selected.epoch,postFaultScratchProfileObserved:false,
                  quiesceObserved:false,quiescentTrue:false,readyAllocationMatched:false,profileInodeMatched:false,
                  observerFailed:true,profileSampleOrdinal:0});}
              },()=>{}).catch(()=>{cutRecord({case:selected.case,epoch:selected.epoch,postFaultScratchProfileObserved:false,
                quiesceObserved:false,quiescentTrue:false,readyAllocationMatched:false,profileInodeMatched:false,
                observerFailed:true,profileSampleOrdinal:0});});}catch{}
            }return result;},clearAll(...args){return Reflect.apply(original.clearAll,original,args);},
            list(...args){return Reflect.apply(original.list,original,args);}};
        };
'''
anchor='''        """
        .formatted(JSON.writeValueAsString(root + "validator/observedReferencePolicy.js"));
  }

  private static String ordinaryAdmissionRefusalTap'''
replacement=script+'''        """
        .formatted(
            JSON.writeValueAsString(root + "validator/observedReferencePolicy.js"),
            JSON.writeValueAsString(root + "server/scratch.js"),
            JSON.writeValueAsString(root + "run/scratchLayout.js"),
            JSON.writeValueAsString(TEMP.resolve("c5-private-values.json").toString()),
            JSON.writeValueAsString(TEMP.resolve("c5-profile-counts.jsonl").toString()),
            JSON.writeValueAsString(TEMP.resolve("p3-c11-midfill-process.json").toString()),
            JSON.writeValueAsString(TEMP.toRealPath().resolve("p4-revocation-producers").toString()),
            c5ProfileScannerSupport());
  }

  private static String ordinaryAdmissionRefusalTap'''
edit(anchor,replacement)
(r/'candidate'/p).write_text(s)
inv=s
for o,n in reversed(changes):assert inv.count(n)==1;inv=inv.replace(n,o,1)
assert inv==b
(r/'candidate.patch').write_text(''.join(difflib.unified_diff(b.splitlines(True),s.splitlines(True),fromfile='before/'+str(p),tofile='candidate/'+str(p))))
(r/'inverse-transformations.json').write_text(json.dumps([{'before':o,'after':n}for o,n in changes],indent=2)+'\n')
(r/'scanner-original-fragment.txt').write_text(fragment)
print(json.dumps({'base':hashlib.sha256(b.encode()).hexdigest(),'candidate':hashlib.sha256(s.encode()).hexdigest(),'inverse':True,'transformations':len(changes)}))
