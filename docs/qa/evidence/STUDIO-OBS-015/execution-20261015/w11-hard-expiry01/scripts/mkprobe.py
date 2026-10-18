import sys
P=sys.argv[1]
s=open(P).read()
def rep(a,b):
    global s
    assert s.count(a)==1,a
    s=s.replace(a,b)
rep("import {GuidedRuntime} from '../../src/guided/runtime.js';","import {GuidedRuntime} from '../../src/guided/runtime.js';\nimport {GuidedOwnership} from '../../src/guided/ownership.js';")
rep("  const timers:ReturnType<typeof setTimeout>[]=[];\n","""  const timers:ReturnType<typeof setTimeout>[]=[];
  const wallNow=()=>performance.timeOrigin+performance.now();
  const stopCalls:{reason:string;wallMs:number;dateNow:number;perf:number;accepting:boolean;frames:string[]}[]=[],renewCalls:{startWall:number;startDateNow:number;endWall?:number}[]=[];
  const expiresAtMs=Date.parse(context.expiresAt);
  const actualRenew=Object.getOwnPropertyDescriptor(GuidedOwnership.prototype,'renew')?.value as (this:GuidedOwnership,entry:unknown)=>Promise<void>;
  vi.spyOn(GuidedOwnership.prototype as unknown as {renew:(e:unknown)=>Promise<void>},'renew').mockImplementation(function(this:GuidedOwnership,entry){const rec:{startWall:number;startDateNow:number;endWall?:number}={startWall:wallNow(),startDateNow:Date.now()};renewCalls.push(rec);const p=actualRenew.call(this,entry);void p.finally(()=>{rec.endWall=wallNow();});return p;});
""")
rep("    const pending=actualStop.call(this,reason);\n","""    const frames=(new Error().stack??'').split('\\n').slice(2,7).map(f=>f.trim().replace(/\\(.*\\/studio-runner\\//,'(').replace(/^at /,''));
    const pending=actualStop.call(this,reason);
    if(this.currentIdentity.sessionId===context.sessionId)stopCalls.push({reason,wallMs:wallNow(),dateNow:Date.now(),perf:performance.now(),accepting:this.accepting,frames});
""")
rep("Object.assign(facts,{commandResponses,","Object.assign(facts,{timeOrigin:performance.timeOrigin,expiresAtMs,stopCalls,renewCalls,commandResponses,")
open(P,'w').write(s)
