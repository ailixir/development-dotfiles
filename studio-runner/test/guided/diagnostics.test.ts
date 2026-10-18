import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GuidedDiagnostics,GuidedStartFailure,describeStartFailure,redactFailure} from '../../src/guided/diagnostics.js';
import {hash} from '../../src/guided/contracts.js';
import {GuidedLaunchFailure} from '../../src/run/guidedBrowser.js';
const paths:string[]=[];
afterEach(async()=>{for(const path of paths.splice(0))await rm(path,{recursive:true,force:true});});
async function directory(){const path=await mkdtemp(join(tmpdir(),'guided-diagnostics-'));paths.push(path);return path;}
const identity={sessionId:'session',contextId:'context',admissionId:'admission',stepId:'step',ordinal:0};
describe('separate bounded non-authoritative diagnostics',()=>{
  it('redacts released raw and encoded values before truncation and UTF8 bounds',()=>{
    const canary='released-password-é-"\\',encoded=encodeURIComponent(canary),base64=Buffer.from(canary).toString('base64');
    const error=new Error(canary+' '+encoded+' '+base64+' '+JSON.stringify(canary).slice(1,-1)+' '+ '🙂'.repeat(3000));
    const text=redactFailure(error,[canary]);expect(text).toContain('[REDACTED]');for(const value of [canary,encoded,base64])expect(text).not.toContain(value);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2048);expect(text.length).toBeLessThanOrEqual(2048);expect(text).not.toMatch(/[\uD800-\uDBFF]$/u);
    const boundary=redactFailure(new Error('a'.repeat(2038)+canary),[canary]);expect(boundary).not.toContain('released-');
    expect(redactFailure({toString(){throw new Error('never interpolate');}},[])).toBe('Unknown error: object');
    expect(redactFailure(new Error('\ud800\n'),[])).toBe('Error: �');
    expect(redactFailure(new Error('scalar'),['Error: scalar'])).toBe('[REDACTED]');
  });
  it('writes only redacted closed JSONL with private permissions and finite record budget',async()=>{
    const path=await directory(),sink=new GuidedDiagnostics(path,'session',1),stderr=vi.fn();
    expect(await sink.record(identity,new Error('secret-value'),['secret-value'],stderr)).toBe('Error: [REDACTED]');
    await sink.record(identity,new Error('second'),[],stderr);
    const bytes=await readFile(sink.path,'utf8'),lines=bytes.trim().split('\n');expect(lines).toHaveLength(1);expect(JSON.parse(lines[0]??'')).toEqual({...identity,errorMessage:'Error: [REDACTED]'});
    expect(bytes).not.toContain('secret-value');expect(stderr).toHaveBeenCalledOnce();expect((await stat(sink.path)).mode&0o777).toBe(0o600);
  });
  it('enforces total byte budget and ignores delivery or filesystem failures',async()=>{
    const path=await directory(),stderr=vi.fn(),limited=new GuidedDiagnostics(path,'budget',10,1);
    expect(await limited.record(identity,new Error('secret'),['secret'],stderr)).toBe('Error: [REDACTED]');expect(stderr).not.toHaveBeenCalled();await expect(readFile(limited.path)).rejects.toMatchObject({code:'ENOENT'});
    const file=join(path,'occupied');await writeFile(file,'no directory');const broken=new GuidedDiagnostics(file,'session');
    await expect(broken.record(identity,new Error('secret'),['secret'],()=>{throw new Error('stderr closed');})).resolves.toBe('Error: [REDACTED]');
  });
});
describe('REL-001 value-free start-failure line',()=>{
  const prefix='GUIDED_START_FAILED ';
  const parse=(line:string)=>JSON.parse(line.slice(prefix.length)) as {operation:string;session:string;elapsedMs:number;links:Record<string,unknown>[]};
  it('names the failed step, the browser exit signal and the whole cause chain without any message text',()=>{
    const canaries=['/Users/private-canary/profile','https://private-canary.example/path','private-canary-token'];
    const launch=new Error(`browserType.launchPersistentContext: Target page, context or browser has been closed\nBrowser logs:\n<launched> pid=54867\n[pid=54867][err] ${canaries[0]??''} ${canaries[1]??''}\n<process did exit: exitCode=null, signal=SIGABRT> ${canaries[2]??''}`);
    const failure=new GuidedStartFailure('LAUNCH',null,new Error('CONTEXT_LOST',{cause:new GuidedLaunchFailure(()=>Promise.resolve(),launch,'PROCESS')}));
    const line=describeStartFailure(failure,{operation:'context',sessionId:'session-private-canary',elapsedMs:1873.6});
    expect(line.startsWith(prefix)).toBe(true);expect(line.endsWith('\n')).toBe(true);
    for(const canary of [...canaries,'session-private-canary'])expect(line).not.toContain(canary);
    expect(parse(line)).toEqual({operation:'context',session:hash('session-private-canary').slice(0,16),elapsedMs:1874,links:[
      {name:'GuidedStartFailure',code:'CONTEXT_LOST',phase:'LAUNCH'},{name:'Error',code:'CONTEXT_LOST'},
      {name:'GuidedLaunchFailure',code:'CONTEXT_LOST',phase:'PROCESS'},{name:'Error',kind:'TARGET_CLOSED',exitCode:null,signal:'SIGABRT'}]});
  });
  it('reports a browser loss reason, a Playwright timeout and an errno code as fixed labels',()=>{
    const timeout=Object.assign(new Error('page.goto: Timeout 30000ms exceeded.\nCall log: /Users/private-canary'),{name:'TimeoutError'});
    const errno=Object.assign(new Error('EACCES: permission denied, open /Users/private-canary/x'),{code:'EACCES'});
    const line=describeStartFailure(new GuidedStartFailure('LAUNCH','PAGE_CRASH',timeout),{operation:'assign',sessionId:'s',elapsedMs:0});
    expect(line).not.toContain('private-canary');expect(parse(line).links).toEqual([{name:'GuidedStartFailure',code:'CONTEXT_LOST',phase:'LAUNCH',loss:'PAGE_CRASH'},{name:'TimeoutError',kind:'TIMEOUT'}]);
    expect(parse(describeStartFailure(errno,{operation:'assign',sessionId:'s',elapsedMs:0})).links).toEqual([{name:'Error',errno:'EACCES'}]);
    const killed=new Error('browserType.launchPersistentContext: Target page, context or browser has been closed\n<process did exit: exitCode=137, signal=null>');
    expect(parse(describeStartFailure(killed,{operation:'assign',sessionId:'s',elapsedMs:0})).links).toEqual([{name:'Error',kind:'TARGET_CLOSED',exitCode:137,signal:null}]);
  });
  it('bounds the chain, survives a cycle and a non-error cause, and never echoes a free-form name or route',()=>{
    let long:Error=new Error('CONTEXT_LOST');for(let depth=0;depth<10;depth++)long=new Error('CONTEXT_LOST',{cause:long});
    expect(parse(describeStartFailure(long,{operation:'context',sessionId:'s',elapsedMs:1})).links).toHaveLength(6);
    const first=new Error('CONTEXT_LOST'),second=new Error('CONTEXT_LOST',{cause:first});first.cause=second;
    expect(parse(describeStartFailure(second,{operation:'context',sessionId:'s',elapsedMs:1})).links).toHaveLength(2);
    const stranger=Object.assign(new Error('lower case message',{cause:'a private string'}),{name:'has spaces /Users/private-canary'});
    const line=describeStartFailure(stranger,{operation:'/Users/private-canary',sessionId:'s',elapsedMs:-5});
    expect(line).not.toContain('private');expect(parse(line)).toMatchObject({operation:'other',elapsedMs:0,links:[{name:'Error'},{name:'NonError'}]});
  });
});
