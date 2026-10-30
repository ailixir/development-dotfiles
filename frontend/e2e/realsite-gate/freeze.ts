/** Filesystem-only source identity. Never reads Git config/index/reflogs or invokes Git. */
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isInside, sha256Hex } from './common.ts';
export interface FileManifest { entries: { path: string; bytes: number; sha256: string }[]; digest: string }
const EXCLUDED = new Set(['node_modules','dist','build','.gradle','.cache','coverage','logs','artifacts','state','secrets','.git']);
const FORBIDDEN = /(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|token)[^/]*\.(?:json|ya?ml|properties|txt|key|pem)$)/i;
export function fileManifest(root: string, scopes: readonly string[]): FileManifest {
  const entries: FileManifest['entries'] = [];
  const seen = new Set<string>();
  const visit = (path: string): void => {
    const rel = relative(root,path).split(sep).join('/');
    if (!isInside(path,root) || FORBIDDEN.test(rel)) throw new Error('FREEZE_SCOPE_REJECTED');
    if (seen.has(rel)) return;
    seen.add(rel);
    if (!existsSync(path)) { entries.push({path: rel, bytes: 0, sha256: 'MISSING'}); return; }
    const before = lstatSync(path);
    if (before.isSymbolicLink()) throw new Error('FREEZE_SYMLINK');
    if (before.isDirectory()) {
      for (const name of readdirSync(path).sort()) if (!EXCLUDED.has(name)) visit(join(path,name));
      const after = lstatSync(path);
      if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs) throw new Error('FREEZE_RACE');
    } else if (before.isFile()) {
      const bytes = readFileSync(path), after = lstatSync(path);
      if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) throw new Error('FREEZE_RACE');
      entries.push({path: rel, bytes: bytes.length, sha256: sha256Hex(bytes)});
    } else throw new Error('FREEZE_NOT_REGULAR');
  };
  for (const scope of scopes) {
    if (isAbsolute(scope) || scope.split(/[\\/]/).includes('..')) throw new Error('FREEZE_SCOPE_REJECTED');
    visit(resolve(root,scope));
  }
  entries.sort((a,b) => a.path.localeCompare(b.path));
  return { entries, digest: sha256Hex(JSON.stringify(entries)) };
}
function boundedFile(path: string): string {
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || st.size > 1024 * 1024) throw new Error('HEAD_METADATA_REJECTED');
  return readFileSync(path,'utf8').trim();
}
/** Metadata-only: validated worktree pointer and commondir, HEAD, loose/packed refs. */
export function headFromFilesystem(repo: string): string {
  const pointer = join(repo,'.git');
  const st = lstatSync(pointer);
  if (st.isSymbolicLink()) throw new Error('HEAD_METADATA_REJECTED');
  let meta: string;
  if (st.isDirectory()) meta = realpathSync(pointer);
  else {
    const match = /^gitdir: (.+)$/.exec(boundedFile(pointer));
    if (match?.[1] === undefined || match[1].includes('\n')) throw new Error('HEAD_POINTER_INVALID');
    meta = realpathSync(resolve(repo,match[1]));
  }
  const common = existsSync(join(meta,'commondir')) ? realpathSync(resolve(meta,boundedFile(join(meta,'commondir')))) : meta;
  const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
  let value = boundedFile(join(meta,'HEAD'));
  const visited = new Set<string>();
  for (let depth=0;depth<8;depth+=1) {
    if (oid.test(value)) return value;
    const ref = /^ref: (refs\/[A-Za-z0-9_./-]+)$/.exec(value)?.[1];
    if (ref === undefined || ref.includes('..') || ref.includes('//') || visited.has(ref)) throw new Error('HEAD_REF_INVALID');
    visited.add(ref);
    const loose = join(common,ref);
    if (!isInside(loose,common)) throw new Error('HEAD_REF_INVALID');
    // Reject symlinks in every path component, including refs directories.
    let part = common;
    for (const name of ref.split('/')) { part=join(part,name); if (existsSync(part) && lstatSync(part).isSymbolicLink()) throw new Error('HEAD_REF_INVALID'); }
    if (existsSync(loose)) { value=boundedFile(loose); continue; }
    const packed = join(common,'packed-refs');
    if (!existsSync(packed)) throw new Error('HEAD_REF_MISSING');
    const lines = boundedFile(packed).split('\n').filter((line) => !line.startsWith('#') && !line.startsWith('^') && line !== '');
    const found = lines.filter((line) => line.split(' ')[1] === ref);
    if (found.length !== 1 || !oid.test(found[0]?.split(' ')[0] ?? '')) throw new Error('HEAD_PACKED_REF_INVALID');
    return found[0]?.split(' ')[0] ?? '';
  }
  throw new Error('HEAD_REF_DEPTH');
}
export interface RuntimeFreeze {
  source: FileManifest; head: string;
  externalCore: { root: string; source: FileManifest; artifact: FileManifest } | null;
  nonsecretSettings: Record<string,string|number|boolean>;
  artifactDigest: string | null;
  processIdentities: { role: string; pid: number; startedAt: string }[];
}
export interface FreezeCheckpoint { recheck?:true; phase: 'start'|'initial'|'pre-nextday'|'final'; at: string; freeze: RuntimeFreeze }
export function freezeProblems(checkpoints: FreezeCheckpoint[], requireNextday: boolean): string[] {
  const reasons: string[] = [];
  const expected = requireNextday ? ['start','initial','pre-nextday','final'] : ['start','initial'];
  if (checkpoints.filter((c)=>!c.recheck).map((c) => c.phase).join() !== expected.join()) reasons.push('UNKNOWN immutable freeze checkpoint coverage');
  const first = checkpoints[0];
  if (first === undefined) return [...reasons,'UNKNOWN freeze baseline'];
  for (const c of checkpoints) {
    if (c.freeze.externalCore === null || c.freeze.artifactDigest === null || c.freeze.processIdentities.length < 2 || Object.keys(c.freeze.nonsecretSettings).length === 0) reasons.push('UNKNOWN full external core/settings/artifact/process closure');
    if (JSON.stringify(c.freeze) !== JSON.stringify(first.freeze)) reasons.push('STICKY_FREEZE_MISMATCH');
  }
  return reasons;
}
export function appendFreezeCheckpoint(directory: string, checkpoint: FreezeCheckpoint): void {
  mkdirSync(directory,{recursive:true});
  // Exclusive writes preserve first baseline and every mismatch. Never overwrite to repair a candidate.
  writeFileSync(join(directory,`${checkpoint.phase}.json`),JSON.stringify(checkpoint)+'\n',{flag:'wx'});
}
export function collectFreezeCheckpoints(directory: string): FreezeCheckpoint[] {
  const canonical=['start','initial','pre-nextday','final'].flatMap((phase) => {
    const file=join(directory,`${phase}.json`);
    return existsSync(file) ? [JSON.parse(readFileSync(file,'utf8')) as FreezeCheckpoint] : [];
  });
  const rechecks=join(directory,'rechecks');
  return [...canonical,...(existsSync(rechecks)?readdirSync(rechecks).sort().map((name)=>JSON.parse(readFileSync(join(rechecks,name),'utf8')) as FreezeCheckpoint):[])];
}
export function recordCollectionFreeze(directory:string,attempt:string,checkpoint:FreezeCheckpoint):void {
  if(!/^(initial|nextday)-[a-f0-9-]+$/.test(attempt))throw new Error('FREEZE_ATTEMPT_ID_INVALID');
  mkdirSync(directory,{recursive:true});
  if(!existsSync(join(directory,`${checkpoint.phase}.json`)))appendFreezeCheckpoint(directory,checkpoint);
  mkdirSync(join(directory,'rechecks'),{recursive:true});
  writeFileSync(join(directory,'rechecks',`${attempt}.json`),JSON.stringify({...checkpoint,recheck:true})+'\n',{flag:'wx'});
}
