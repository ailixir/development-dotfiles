/**
 * The per-run environment record of the release gate: what actually ran. Collected before any model
 * call and re-checked at the end (the working-tree digest). Reads declared files, narrow HEAD metadata and process state only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import type { Canary } from './leakscan.ts';
import { join } from 'node:path';
import { fileManifest, headFromFilesystem } from './freeze.ts';
import type { RuntimeFreeze } from './freeze.ts';
import { FRONTEND_ROOT, REPO_ROOT, readJson, sha256File, sha256Hex } from './common.ts';
import type { EnvironmentRecord, ProxySummary } from './evaluate.ts';
import type { RecorderIndexLine } from './recorder.ts';

/** Paths whose contents decide what the stack ran. */
export const DIGEST_PATHS = [
  'AGENTS.md', 'CLAUDE.md', '.claude/CLAUDE.md', '.claude/rules/accessibility-scope.md',
  'backend/src','backend/buildSrc/src','backend/buildSrc/build.gradle.kts','backend/buildSrc/settings.gradle.kts',
  'backend/build.gradle.kts','backend/settings.gradle.kts','backend/gradle.properties','backend/gradlew','backend/gradlew.bat','backend/gradle','backend/config',
  'studio-runner/src','studio-runner/scripts','studio-runner/package.json','studio-runner/pnpm-lock.yaml','studio-runner/package-lock.json','studio-runner/tsconfig.json','studio-runner/tsconfig.build.json',
  'studio-runner/evaluation/grounding/corpus',
  'frontend/src','frontend/e2e','frontend/package.json','frontend/pnpm-lock.yaml','frontend/.npmrc','frontend/tsconfig.json','frontend/tsconfig.node.json','frontend/playwright.config.ts','frontend/vite.config.ts','frontend/webpack.config.js','frontend/vitest.config.ts',
  'docs/architecture/ADR-SC-007-snapshot-ref-grounding.md','docs/specs/studio-observed-authoring','tools/studio-local-tls.mjs','tools/studio-contracts',
];

export interface StackManifest {
  backend: { pid: number; jarPath: string; jarSha256: string; port: number };
  runner: { pid: number; frozenDir: string; distSha256: string; logPath: string; workDir: string; journalDir?: string; port: number };
  gateway: Record<string, unknown>;
  logs: { backend: string; core: string; issuer: string };
  vault: { container: string };
  postgresPort: number;
  startedAt: string;
  /** Set only by `CHECKS_GATE_REHEARSAL=1 gate-stack.sh up`: a stale dist was tolerated, so the stack is never evidence. */
  rehearsal?: boolean;
}

export function readManifest(path: string | undefined): StackManifest | null {
  if (path === undefined || path === '' || !existsSync(path)) return null;
  const m = readJson<StackManifest>(path);
  for (const key of ['backend', 'runner', 'gateway', 'logs', 'vault'] as const) {
    if (m[key] === undefined || m[key] === null) throw new Error(`stack manifest lacks ${key}`);
  }
  return m;
}

/** Full deterministic allowlisted path/content digest; added/deleted/renamed files change it. */
export function workingTreeDigest(repoRoot: string = REPO_ROOT, paths: string[] = DIGEST_PATHS): string {
  return fileManifest(repoRoot, paths).digest;
}

export function contractsV3Hash(repoRoot: string = REPO_ROOT): string {
  const dir = join(repoRoot, 'docs/specs/studio-observed-authoring/contracts/v3');
  const names = readdirSync(dir).filter((n) => n.endsWith('.schema.json')).sort();
  return sha256Hex(names.map((n) => `${n}:${sha256File(join(dir, n))}`).join('\n'));
}

export function summarizeRecorder(gatewayDir: string, configured: boolean): ProxySummary {
  const file = join(gatewayDir, 'requests.jsonl');
  if (!configured || !existsSync(file)) {
    return { configured, totalRequests: 0, bodies: 0, durationsMs: [], modelIds: [], systemInstructionHashes: [] };
  }
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as RecorderIndexLine);
  return {
    configured,
    truncations: {total:lines.length, verified4096:lines.filter((l) => l.finish?.cap===4096 && l.finish.reason==='MAX_TOKENS' && l.finish.coverage==='COMPLETE').length, unknown:lines.filter((l) => l.finish?.coverage!=='COMPLETE').length},
    totalRequests: lines.length,
    bodies: lines.length,
    durationsMs: lines.map((l) => l.durationMs),
    modelIds: [...new Set(lines.map((l) => l.modelId).filter((m): m is string => m !== null))],
    systemInstructionHashes: [...new Set(lines.map((l) => l.systemInstructionSha256).filter((h): h is string => h !== null))],
  };
}

/** lsof lives in /usr/sbin, which a restricted PATH omits; an absolute path keeps the binding check honest. */
export const LSOF = process.env.CHECKS_GATE_LSOF ?? '/usr/sbin/lsof';

export function listenerPid(port: number): number | null {
  try {
    const out = execFileSync(LSOF, ['-tiTCP:' + String(port), '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n')[0] ?? '';
    return out === '' ? null : Number(out);
  } catch {
    return null;
  }
}

function commandOf(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export interface CollectOptions {
  runId: string;
  dryRun: boolean;
  outDir: string;
  gatewayDir: string;
  proxyConfigured: boolean;
  manifestPath: string | undefined;
  backendUrl: string;
}

export function collectEnvironment(options: CollectOptions): EnvironmentRecord {
  const manifest = readManifest(options.manifestPath);
  const proxy = summarizeRecorder(options.gatewayDir, options.proxyConfigured);
  const runnerRoot = join(REPO_ROOT, 'studio-runner');
  const pin = readJson<{ playwright: string; coreBundleSha256: string }>(join(runnerRoot, 'src/run/playwrightEnginePin.json'));
  const runnerPw = readJson<{ version: string }>(join(runnerRoot, 'node_modules/playwright-core/package.json'));
  const driverPw = readJson<{ version: string }>(join(FRONTEND_ROOT, 'node_modules/@playwright/test/package.json'));
  const versionsFile = join(runnerRoot, 'dist/runtime-versions.json');
  const versions = existsSync(versionsFile) ? readJson<{ observedChromiumBuild?: string }>(versionsFile) : {};
  const contract = join(REPO_ROOT, 'backend/src/main/resources/studio/guided-output-contract.md');
  const assembler = join(REPO_ROOT, 'backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedPromptAssembler.java');
  const sha = headFromFilesystem(REPO_ROOT);
  const dirty = 'UNKNOWN' as const;
  const declaredModel = manifest === null ? null : typeof manifest.gateway.model === 'string' ? manifest.gateway.model : null;
  const wireIds = proxy.modelIds;
  const modelId = wireIds.length === 1 ? (wireIds[0] ?? null) : wireIds.length === 0 ? declaredModel : null;

  let bound = false;
  if (manifest !== null) {
    const backendPid = listenerPid(manifest.backend.port);
    const runnerPid = listenerPid(manifest.runner.port);
    const backendUrlPort = Number(new URL(options.backendUrl).port || '80');
    bound =
      backendUrlPort === manifest.backend.port &&
      backendPid === manifest.backend.pid &&
      commandOf(manifest.backend.pid).includes(manifest.backend.jarPath) &&
      existsSync(manifest.backend.jarPath) &&
      sha256File(manifest.backend.jarPath) === manifest.backend.jarSha256 &&
      runnerPid === manifest.runner.pid &&
      commandOf(manifest.runner.pid).length > 0 &&
      existsSync(manifest.runner.frozenDir);
  }

  return {
    runId: options.runId,
    dryRun: options.dryRun,
    startedAt: new Date().toISOString(),
    git: { sha, dirty, workingTreeDigestStart: workingTreeDigest(), workingTreeDigestEnd: null },
    model: { id: modelId, source: wireIds.length === 1 ? 'wire' : 'declared', wireIds },
    hashes: {
      contractMd: sha256File(contract),
      contractsV3: contractsV3Hash(),
      promptStatic: sha256Hex(readFileSync(contract).toString('hex') + readFileSync(assembler).toString('hex')),
      wireSystemInstruction: proxy.systemInstructionHashes,
    },
    playwright: {
      driver: driverPw.version,
      runner: runnerPw.version,
      coreBundleSha256: sha256File(join(runnerRoot, 'node_modules/playwright-core/lib/coreBundle.js')),
      pinSha256: pin.coreBundleSha256,
      chromiumBuild: versions.observedChromiumBuild ?? '',
    },
    gateway: manifest?.gateway ?? {},
    stack: {
      backendPid: manifest?.backend.pid ?? null,
      jarSha256: manifest?.backend.jarSha256 ?? null,
      runnerPid: manifest?.runner.pid ?? null,
      runnerFrozenDir: manifest?.runner.frozenDir ?? null,
      bound,
      rehearsal: manifest?.rehearsal === true,
    },
    outDir: options.outDir,
    repoRoot: REPO_ROOT,
    proxyConfigured: options.proxyConfigured,
  };
}

/**
 * Canary values for redaction and scanning. They come only from the environment and from files
 * outside the worktree; nothing here is written anywhere.
 */
export function loadCanaries(env: NodeJS.ProcessEnv = process.env): Canary[] {
  const out: Canary[] = [];
  const read = (path: string): string => readFileSync(path, 'utf8').trim();
  const canaryFile = env.CHECKS_GATE_CANARY_FILE;
  if (canaryFile !== undefined && canaryFile !== '') out.push({ label: 'GATE_CANARY', value: read(canaryFile), cls: 'SECRET' });
  for (const path of (env.CHECKS_GATE_CANARY_FILES ?? '').split(',').map((p) => p.trim()).filter((p) => p !== '')) {
    out.push({ label: `FILE:${path.slice(path.lastIndexOf('/') + 1)}`, value: read(path), cls: 'SECRET' });
  }
  for (const [i, value] of (env.CHECKS_GATE_EXTRA_CANARIES ?? '').split(',').filter((v) => v !== '').entries()) {
    out.push({ label: `EXTRA_${i + 1}`, value, cls: 'SECRET' });
  }
  return out.filter((c) => c.value !== '');
}

/** Explicit external core declaration is required. Safe nonsecret settings are selected, never dumped. */
export function captureRuntimeFreeze(manifest: StackManifest | null, externalDeclaration?: {root:string;sourceScopes:string[];artifactRoot:string;artifactScopes:string[]}): RuntimeFreeze {
  const settings: Record<string,string|number|boolean>={};
  for (const key of ['provider','model','project','location','endpoint','upstreamEndpoint','allowAllDomains','vaultProvider','runnerGuidedCapacity']) {
    const v=manifest?.gateway[key];
    if(typeof v==='string'||typeof v==='number'||typeof v==='boolean') settings[key]=v;
  }
  const processIdentities: RuntimeFreeze['processIdentities']=[];
  if(manifest!==null) for(const [role,pid] of [['backend',manifest.backend.pid],['runner',manifest.runner.pid]] as const) {
    const startedAt=execFileSync('ps',['-o','lstart=','-p',String(pid)],{encoding:'utf8'}).trim();
    if(!startedAt) throw new Error('FREEZE_PROCESS_UNKNOWN');
    processIdentities.push({role,pid,startedAt});
  }
  let artifactDigest:string|null=null;
  if(manifest!==null && sha256File(manifest.backend.jarPath)===manifest.backend.jarSha256 && listenerPid(manifest.backend.port)===manifest.backend.pid && listenerPid(manifest.runner.port)===manifest.runner.pid) artifactDigest=sha256Hex(JSON.stringify({jar:sha256File(manifest.backend.jarPath),runner:fileManifest(join(manifest.runner.frozenDir,'dist'),['.'])}));
  return {head:headFromFilesystem(REPO_ROOT),source:fileManifest(REPO_ROOT,DIGEST_PATHS),externalCore:externalDeclaration===undefined?null:{root:externalDeclaration.root,source:fileManifest(externalDeclaration.root,externalDeclaration.sourceScopes),artifact:fileManifest(externalDeclaration.artifactRoot,externalDeclaration.artifactScopes)},nonsecretSettings:settings,artifactDigest,processIdentities};
}
/** This file must contain only the approved external nonsecret root/scope declaration, never env values. */
export function externalCoreDeclaration(): {root:string;sourceScopes:string[];artifactRoot:string;artifactScopes:string[]}|undefined {
  const path=process.env.CHECKS_GATE_EXTERNAL_CORE_DECLARATION;
  if(path===undefined||path==='') return undefined;
  const r=readJson<Record<string,unknown>>(path);
  if(Object.keys(r).sort().join()!=='artifactRoot,artifactScopes,root,sourceScopes'||typeof r.root!=='string'||typeof r.artifactRoot!=='string'||!Array.isArray(r.sourceScopes)||!Array.isArray(r.artifactScopes)||![...r.sourceScopes,...r.artifactScopes].every((x)=>typeof x==='string')||r.sourceScopes.length===0||r.artifactScopes.length===0) throw new Error('FREEZE_EXTERNAL_DECLARATION_INVALID');
  return r as {root:string;sourceScopes:string[];artifactRoot:string;artifactScopes:string[]};
}
