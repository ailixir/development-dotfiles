import { mkdtemp, mkdir, writeFile, readdir, readFile, rm, symlink, lstat, chmod, link, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareRecordingScratch } from '../../src/run/recordingScratch.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
 const root = await mkdtemp(join(tmpdir(), 'owned-recording-')); roots.push(root);
 const journalDirectory = join(root, 'journal'); await mkdir(journalDirectory);
 return { root, options: { workerId: 'worker-one', journalDirectory, evidenceRoot: root } };
}
async function dead(options: Awaited<ReturnType<typeof fixture>>['options']) {
 const first = await prepareRecordingScratch(options), leaf = await first.allocate(), incarnation = dirname(leaf), marker = join(incarnation, 'owner.json');
 const body = JSON.parse(await readFile(marker, 'utf8')) as Record<string, unknown>;
 body.pid = 2147483647; await writeFile(marker, JSON.stringify(body)); await writeFile(join(leaf, 'video.webm'), 'video-canary');
 return { first, leaf, incarnation, marker };
}
async function exists(path: string): Promise<boolean> { return lstat(path).then(() => true, () => false); }
it('disposes only allocated bytes, preserving another leaf and private closed ownership', async () => {
 const {options}=await fixture(), scratch=await prepareRecordingScratch(options), a=await scratch.allocate(), b=await scratch.allocate();
 await writeFile(join(a,'video.webm'),'video');await writeFile(join(b,'video.webm'),'other');await scratch.dispose(a);
 expect(await exists(a)).toBe(false);expect(await readFile(join(b,'video.webm'),'utf8')).toBe('other');await expect(scratch.dispose(dirname(a))).rejects.toThrow('RECORDING_SCRATCH_UNAVAILABLE');
 expect(Object.keys(JSON.parse(await readFile(join(dirname(b),'owner.json'),'utf8')) as object).sort()).toEqual(['nonce','pid','scope','version']);expect((await lstat(dirname(b))).mode & 0o077).toBe(0);
});
it('reclaims dead managed recordings while preserving direct legacy and other-scope bytes',async()=>{
 const {root,options}=await fixture(),old=await dead(options),legacy=join(root,'checks-recording-legacy');await mkdir(legacy);await writeFile(join(legacy,'canary'),'legacy');const other=await dead({...options,workerId:'other'});
 expect((await prepareRecordingScratch({...options,probe:()=> 'dead'})).report.reclaimed).toBe(1);expect(await exists(old.incarnation)).toBe(false);expect(await exists(other.leaf)).toBe(true);expect(await exists(legacy)).toBe(true);
});
it.each(['live','unknown'] as const)('preserves same-scope %s, including reused PID or EPERM uncertainty',async state=>{
 const {options}=await fixture(),old=await dead(options);expect((await prepareRecordingScratch({...options,probe:()=>state})).report.reclaimed).toBe(0);expect(await exists(old.leaf)).toBe(true);
});
it('real liveness preserves active same-scope incarnation',async()=>{
 const {options}=await fixture(),first=await prepareRecordingScratch(options),leaf=await first.allocate();expect((await prepareRecordingScratch(options)).report.reclaimed).toBe(0);expect(await exists(leaf)).toBe(true);
});
it.each(['missing','corrupt','oversized','extra-key','wrong-scope','wrong-nonce','public-mode'] as const)('preserves %s ownership',async mode=>{
 const {options}=await fixture(),old=await dead(options);
 if(mode==='missing')await rm(old.marker);else if(mode==='corrupt')await writeFile(old.marker,'{broken');else if(mode==='oversized')await writeFile(old.marker,'x'.repeat(32769));else if(mode==='public-mode')await chmod(old.marker,0o644);
 else {const body=JSON.parse(await readFile(old.marker,'utf8')) as Record<string,unknown>;body[mode==='extra-key'?'unexpected':mode==='wrong-scope'?'scope':'nonce']='x';await writeFile(old.marker,JSON.stringify(body));}
 expect((await prepareRecordingScratch({...options,probe:()=> 'dead'})).report.reclaimed).toBe(0);expect(await exists(old.leaf)).toBe(true);
});
it.each(['root','scope','incarnation','metadata','leaf','nested'] as const)('never follows a %s symlink or touches its external canary',async mode=>{
 const {root,options}=await fixture(),outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'CANARY'),'private-content');const old=await dead(options),scope=dirname(old.incarnation),managed=dirname(scope);
 const target=mode==='root'?managed:mode==='scope'?scope:mode==='incarnation'?old.incarnation:mode==='metadata'?old.marker:mode==='leaf'?old.leaf:join(old.leaf,'nested');
 if(mode!=='nested')await rm(target,{recursive:true,force:true});await symlink(outside,target);
 if(mode==='root'||mode==='scope')await expect(prepareRecordingScratch({...options,probe:()=> 'dead'})).rejects.toThrow('RECORDING_SCRATCH_UNAVAILABLE');
 else expect((await prepareRecordingScratch({...options,probe:()=> 'dead'})).report.reclaimed).toBe(mode==='leaf'||mode==='nested'?1:0);
 expect(await readFile(join(outside,'CANARY'),'utf8')).toBe('private-content');
});
it('disposal unlinks a replaced allocated leaf link without traversal',async()=>{
 const {root,options}=await fixture(),scratch=await prepareRecordingScratch(options),leaf=await scratch.allocate(),outside=join(root,'outside');await mkdir(outside);await writeFile(join(outside,'canary'),'safe');await rm(leaf,{recursive:true});await symlink(outside,leaf);await scratch.dispose(leaf);expect(await exists(leaf)).toBe(false);expect(await readFile(join(outside,'canary'),'utf8')).toBe('safe');
});
it('fails readiness with a fixed data-free code on owned-dead delete failure',async()=>{
 const {options}=await fixture();await dead(options);await expect(prepareRecordingScratch({...options,probe:()=> 'dead',removeFile:()=>Promise.reject(Error('PRIVATE_PATH_CONTENT_CANARY'))})).rejects.toThrow(/^RECORDING_SCRATCH_UNAVAILABLE$/u);
});
it('bounds traversal, candidate count, reclamation count and startup deadline',async()=>{
 const {options}=await fixture(),old=await dead(options);for(let i=0;i<5;i++)await writeFile(join(old.leaf,`file-${String(i)}`),'x');
 expect((await prepareRecordingScratch({...options,probe:()=> 'dead',limits:{entries:3}})).report.bounded).toBe(true);expect(await exists(old.leaf)).toBe(true);
 let time=0;expect((await prepareRecordingScratch({...options,probe:()=> 'dead',now:()=>time+=10,limits:{deadlineMs:1}})).report.bounded).toBe(true);
 const candidates=await prepareRecordingScratch({...options,probe:()=> 'live',limits:{candidates:1}});expect(candidates.report.inspected).toBe(1);expect(candidates.report.bounded).toBe(true);
 expect((await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live',limits:{reclaimed:1}})).report.reclaimed).toBe(1);
});
it('depth bound preserves uninspected bytes',async()=>{
 const {options}=await fixture(),old=await dead(options);let next=old.leaf;for(let i=0;i<5;i++){next=join(next,'deep');await mkdir(next,{mode:0o700});}await writeFile(join(next,'canary'),'keep');expect((await prepareRecordingScratch({...options,probe:()=> 'dead'})).report.bounded).toBe(true);
});
it('concurrent reapers tolerate a lost rename race and preserve new live allocations',async()=>{
 const {options}=await fixture();await dead(options);const results=await Promise.allSettled([prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live'}),prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live'})]);for(const result of results)expect(result.status).toBe('fulfilled');
 const names=await readdir(join(options.evidenceRoot,'.checks-guided-recordings'));expect(names).toHaveLength(1);for(const result of results)if(result.status==='fulfilled')expect(basename(await result.value.allocate())).toMatch(/^checks-recording-/u);
});

it('fresh startup creates absent trusted journal directory before canonical identity',async()=>{
 const {root,options}=await fixture(),journalDirectory=join(root,'new','journal');await prepareRecordingScratch({...options,journalDirectory});expect(await exists(journalDirectory)).toBe(true);
});
it('bounded residue retains provable marker and completes on next bounded startup',async()=>{
 const {options}=await fixture(),old=await dead(options);for(let i=0;i<5;i++)await writeFile(join(old.leaf,`video-${String(i)}`),'bytes');
 const first=await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live',limits:{entries:3}});expect(first.report).toMatchObject({reclaimed:0,bounded:true});expect(await exists(old.marker)).toBe(true);
 const next=await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live'});expect(next.report.reclaimed).toBe(1);expect(await exists(old.incarnation)).toBe(false);
});

it('live active quarantine is not adopted by a concurrent same-scope reaper',async()=>{
 const {options}=await fixture();await dead(options);let entered:()=>void=()=>{throw Error('UNSET')},release:()=>void=()=>{throw Error('UNSET')};const blocked=new Promise<void>(r=>{release=r}),started=new Promise<void>(r=>{entered=r});
 const a=prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live',afterQuarantine:async()=>{entered();await blocked;}});await started;
 try {const b=await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live'});expect(b.report.reclaimed).toBe(0);const leaf=await b.allocate();release();expect((await a).report.reclaimed).toBe(1);expect(await exists(leaf)).toBe(true);await b.close();}finally{release();await a.then(s=>s.close());}
});
it('a dead reaper quarantine is safely reclaimed after restart',async()=>{
 const {options}=await fixture(),old=await dead(options),q=old.incarnation+'-q-2147483647-'+ 'a'.repeat(48);await rename(old.incarnation,q);expect((await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live'})).report.reclaimed).toBe(1);expect(await exists(q)).toBe(false);
});
it('hardlinked metadata is unprovable and preserved',async()=>{
 const {root,options}=await fixture(),old=await dead(options);await link(old.marker,join(root,'outside-marker'));expect((await prepareRecordingScratch({...options,probe:()=> 'dead'})).report.reclaimed).toBe(0);expect(await exists(old.leaf)).toBe(true);
});
it.each(['root','scope','incarnation'] as const)('refuses unsafe %s privacy without deleting recording bytes',async level=>{
 const {options}=await fixture(),old=await dead(options),path=level==='incarnation'?old.incarnation:level==='scope'?dirname(old.incarnation):dirname(dirname(old.incarnation));await chmod(path,0o755);
 if(level==='incarnation')expect((await prepareRecordingScratch({...options,probe:()=> 'dead'})).report.reclaimed).toBe(0);else await expect(prepareRecordingScratch({...options,probe:()=> 'dead'})).rejects.toThrow('RECORDING_SCRATCH_UNAVAILABLE');expect(await exists(old.leaf)).toBe(true);
});
it('observed incarnation inode replacement after quarantine refuses readiness',async()=>{
 const {options}=await fixture(),old=await dead(options);await expect(prepareRecordingScratch({...options,probe:()=> 'dead',afterQuarantine:async()=>{const names=await readdir(dirname(old.incarnation)),name=names.find(n=>n.includes('-q-'));if(!name)throw Error('NO_Q');const q=join(dirname(old.incarnation),name);await rename(q,q+'-held');await mkdir(q,{mode:0o700});await writeFile(join(q,'owner.json'),await readFile(join(q+'-held','owner.json')),{mode:0o600});}})).rejects.toThrow('RECORDING_SCRATCH_UNAVAILABLE');
});
it('deadline during deletion retains marker, reports no reclamation and next startup completes',async()=>{
 const {options}=await fixture(),old=await dead(options);let elapsed=0;const first=await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live',now:()=>elapsed,limits:{deadlineMs:1},removeFile:async path=>{await rm(path);elapsed=2;}});expect(first.report).toMatchObject({bounded:true,reclaimed:0});expect(await exists(old.marker)).toBe(true);expect((await prepareRecordingScratch({...options,probe:pid=>pid===2147483647?'dead':'live'})).report.reclaimed).toBe(1);
});
