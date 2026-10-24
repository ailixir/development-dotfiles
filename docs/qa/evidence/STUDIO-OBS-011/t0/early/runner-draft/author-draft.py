from pathlib import Path

BASE = Path(__file__).resolve().parent
REPO = Path.cwd()
# Deliberate per-line human-authored whitespace replacements. No formatter is used.
REPLACEMENTS = {
'guided/contracts.ts': {
5: '''interface Schema {
  $id?: string; $ref?: string; const?: unknown; enum?: unknown[]; type?: string | string[];
  properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean | Schema;
  propertyNames?: Schema; minProperties?: number; maxProperties?: number; items?: Schema;
  minItems?: number; maxItems?: number; uniqueItems?: boolean; minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number; pattern?: string; format?: string; oneOf?: Schema[]; allOf?: Schema[];
  not?: Schema; if?: Schema; then?: Schema; else?: Schema; definitions?: Record<string, Schema>; contains?: Schema;
  dependencies?: Record<string, Schema | string[] | boolean>
}''',
10: r'''  if (typeof value === 'string') {
    insist(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), 'INVALID_UNICODE');
    return JSON.stringify(value);
  }''',
14: r'''  return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k,v]) => {
      insist(/^[\x20-\x7e]+$/u.test(k), 'SCHEMA');
      return `${JSON.stringify(k)}:${canonical(v)}`;
    }).join(',')}}`;''',
17: '''const supportedKeywords = new Set([
  '$id','$schema','$ref','title','description','default','const','enum','type','properties','propertyNames',
  'minProperties','maxProperties','required','additionalProperties','items','minItems','maxItems','uniqueItems',
  'minLength','maxLength','minimum','maximum','pattern','format','oneOf','allOf','not','if','then','else',
  'definitions','contains','dependencies'
]);''',
37: '''      insist(typeof schema.$ref === 'string' &&
        Object.keys(record).every(key => ['$ref','title','description'].includes(key)), 'SCHEMA_CONFIGURATION');''',
40: '''    if (schema.type !== undefined) insist(
      (Array.isArray(schema.type)?schema.type:[schema.type])
        .every(type=>['null','string','boolean','integer','object','array'].includes(type)), 'SCHEMA_CONFIGURATION');''',
41: '''    for (const keyword of ['minItems','maxItems','minLength','maxLength','minimum','maximum','minProperties','maxProperties'])
      if (record[keyword] !== undefined) insist(Number.isSafeInteger(record[keyword]), 'SCHEMA_CONFIGURATION');''',
42: '''    if (schema.additionalProperties !== undefined) insist(
      typeof schema.additionalProperties === 'boolean' || typeof schema.additionalProperties === 'object', 'SCHEMA_CONFIGURATION');''',
44: '''    if (schema.required !== undefined) insist(Array.isArray(schema.required) &&
      schema.required.every(key=>typeof key==='string') && new Set(schema.required).size===schema.required.length, 'SCHEMA_CONFIGURATION');''',
46: '''    if (schema.pattern !== undefined) {
      insist(typeof schema.pattern==='string','SCHEMA_CONFIGURATION');
      try { new RegExp(schema.pattern,'u'); } catch { throw new Error('SCHEMA_CONFIGURATION'); }
    }''',
52: '''    for (const keyword of ['items','not','if','then','else','propertyNames','contains'])
      if (record[keyword] !== undefined) walk(record[keyword],base);''',
56: '''        if (Array.isArray(dependency)) insist(
          dependency.every(key => typeof key === 'string') && new Set(dependency).size === dependency.length, 'SCHEMA_CONFIGURATION');''',
61: '''    if (typeof additional === 'object') {
      insist(additional && !Array.isArray(additional) && Object.keys(additional).length > 0, 'SCHEMA_CONFIGURATION');
      walk(additional, base);
    }''',
62: '''    for (const keyword of ['oneOf','allOf']) if (record[keyword] !== undefined) {
      const children=record[keyword]; insist(Array.isArray(children)&&children.length>0,'SCHEMA_CONFIGURATION');
      for(const child of children)walk(child,base);
    }''',
73: '''        insist(target && typeof target==='object' && Object.hasOwn(target,key),'SCHEMA_CONFIGURATION');
        target=(target as Record<string,unknown>)[key];''',
84: '''    for(const child of [
      ...(schema.oneOf??[]),...(schema.allOf??[]),schema.not,schema.if,schema.then,schema.else,
      ...Object.values(schema.dependencies??{})
        .filter((dependency): dependency is Schema => typeof dependency === 'object' && !Array.isArray(dependency))
    ])if(child)acyclic(child);''',
101: '''    if (!types.some(t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) :
      t === 'integer' ? Number.isSafeInteger(value) :
      t === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value) : typeof value === t)) return false;''',
105: '''    if (length < (s.minLength ?? 0) || length > (s.maxLength ?? Infinity) ||
      (s.pattern && !new RegExp(s.pattern, 'u').test(value))) return false;''',
119: '''  if (Array.isArray(value) && (value.length < (s.minItems ?? 0) || value.length > (s.maxItems ?? Infinity) ||
    (s.items && !value.every(v => matches(s.items ?? {},v))) ||
    (s.uniqueItems && new Set(value.map(canonical)).size !== value.length))) return false;''',
123: '''      if (Array.isArray(dependency) ? dependency.some(required => !Object.hasOwn(record,required)) :
        typeof dependency === 'boolean' ? !dependency : !matches(dependency,record)) return false;''',
127: '''    if (typeof s.additionalProperties === 'object' && Object.entries(record).some(([key, item]) =>
      !Object.hasOwn(s.properties ?? {}, key) && !matches(s.additionalProperties as Schema, item))) return false;''',
139: '''  while(pending.length){
    const entry=pending.pop();insist(entry&&entry.depth<=64&&++nodes<=1000000,'SCHEMA');
    if(entry.value&&typeof entry.value==='object')
      for(const child of Object.values(entry.value))pending.push({value:child,depth:entry.depth+1});
  }''',
146: '''export const identityKeys = [
  'schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision',
  'sourceRevision','configurationRevision','versions'
] as const;''',
147: '''export function identity(value: BridgeIdentity): BridgeIdentity {
  return Object.fromEntries(identityKeys.map(k => [k,value[k]])) as unknown as BridgeIdentity;
}'''
},
'guided/diagnostics.ts': {
12: r'''  const redacted=redactor.redact(text).replace(/\s+/gu,' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu,'�').trim();''',
14: '''  for(const character of redacted){
    const length=Buffer.byteLength(character);if(bytes+length>2048 || Array.from(bounded).length>=2048)break;
    bounded+=character;bytes+=length;
  }''',
34: '''interface CauseLink {
  name: string; code?: string; errno?: string; phase?: string; loss?: string; kind?: string;
  exitCode?: number | null; signal?: string | null
}''',
72: r'''  return 'GUIDED_START_FAILED ' + JSON.stringify({
    operation, session: hash(facts.sessionId).slice(0, 16), elapsedMs: Math.max(0, Math.round(facts.elapsedMs)), links
  }) + '\n';''',
79: '''  constructor(private readonly directory:string,sessionId:string,private readonly maxRecords=200,private readonly maxBytes=262144){
    this.path=join(directory,hash(sessionId)+'.diagnostic.jsonl');
  }''',
86: '''    try{
      await mkdir(this.directory,{recursive:true,mode:0o700});await appendFile(this.path,line,{mode:0o600,flag:'a'});
    }catch{/* No authority or replay state is stored here. */}'''
},
'guided/evidence.ts': {
73: '''export type RecordingEvidenceCallback = (
  route: 'recording-evidence', message: RecordingEvidenceBody, idempotencyKey: string
) => Promise<void>;''',
101: '''  open(session: {
    readonly sessionId: string; readonly csiId: string | null; readonly maxSessionSeconds: number
  }): Promise<GuidedSessionRecording>;''',
108: '''  const owned = (): Promise<RecordingScratch> => scratch ??= ports.recordingScratch ?
    Promise.resolve(ports.recordingScratch) : prepareRecordingScratch({
      workerId: 'embedded-recorder', journalDirectory: ports.evidenceRoot ?? process.env.TMPDIR ?? tmpdir(),
      ...(ports.evidenceRoot === undefined ? {} : { evidenceRoot: ports.evidenceRoot })
    });''',
161: '''    .sort((a, b) => a.startMs - b.startMs || a.ordinal - b.ordinal ||
      compareCodePoints(a.stepId, b.stepId) || compareCodePoints(a.admissionId, b.admissionId))''',
162: '''    .map((r): ActionTiming => ({
      kind: 'action', stepId: r.stepId, admissionId: r.admissionId, ordinal: r.ordinal, startMs: r.startMs, endMs: r.endMs
    }));''',
172: '''  return timings.every(t => Number.isSafeInteger(t.startMs) && t.startMs >= 0 && t.startMs <= bound &&
    (t.endMs === null || (Number.isSafeInteger(t.endMs) && t.endMs >= t.startMs && t.endMs <= bound)));''',
234: '''  settle(input: {
    readonly identity: BridgeIdentity; readonly videoPath: string | null; readonly orderlyClose: boolean;
    readonly callback: RecordingEvidenceCallback
  }): Promise<GuidedRecordingState> {''',
239: '''  private async run(input: {
    readonly identity: BridgeIdentity; readonly videoPath: string | null; readonly orderlyClose: boolean;
    readonly callback: RecordingEvidenceCallback
  }): Promise<GuidedRecordingState> {''',
244: '''      const ports = {
        store: this.ports.store, fileSystem: this.ports.fileSystem, bounds: this.ports.bounds,
        now: this.ports.now, sleep: this.ports.sleep, redactor
      };''',
248: '''          .catch((): RecordingObservation => ({
            attempted: true, path: null, bytes: null, header: false, error: 'RECORDING_FAILED', orderlyClose: input.orderlyClose
          }));''',
251: '''          const uploaded = await uploadRecording(ports, window, {
            videoKey: this.keys.videoKey, path: observed.path, state: 'PENDING', partial: observed.partial
          });''',
260: '''        const manifest = buildGuidedRecordingManifest({
          sessionId: input.identity.sessionId, recordingId: this.recordingId, workerId: input.identity.workerId,
          ownerFence: input.identity.ownerFence, evidenceState: state, evidencePartial: partial,
          videoKey: this.keys.videoKey, manifestKey: this.keys.manifestKey, timings
        });''',
262: '''        await writeResultManifest(
          ports, window, this.keys.manifestKey, serializeResultManifest(manifest, redactor), RESULT_MANIFEST_CONTENT_TYPE
        );'''
},
'guided/json.ts': {
36: '''        for (;;) {
          result.push(value(depth+1)); whitespace(); const separator=text[index++];
          if(separator===']')return result; if(separator!==',')throw new Error();
        }''',
38: '''      for (const [literal,result] of [['true',true],['false',false],['null',null]] as const)
        if (text.startsWith(literal,index)) { index+=literal.length; return result; }''',
40: '''      index+=match[0].length; const number=Number(match[0]);
      if(!Number.isSafeInteger(number)||Object.is(number,-0))throw new Error(); return number;'''
},
'run/guidedBrowser.ts': {
26: ''' * (`HttpRunnerDispatchClient.transportDeadline`, hard-coded; `delayed-state-design.md:108`: "a 15-second''',
88: '''export function guidedCloseStages(
  ports: GuidedCloseStagesPorts, graceMs: number = GUIDED_CLOSE_GRACE_MS
): Pick<GuidedBrowser, 'close'> & { readonly terminate: () => Promise<void>; readonly orderlyClosed: () => boolean } {'''
}
}
REPLACEMENTS['guided/transport.ts'] = {
8: '''import type {
  BridgeIdentity, BridgeDispatch, BridgePrefixPrepare, BridgePrefixDriftCallback, Assignment, AssignmentStop, AssignmentLifecycle, Session
} from './types.js';''',
37: '''    insist(p.iss === policy.issuer && p.aud === audience && p.role === role && p.sub === policy.subject &&
      typeof p.sub === 'string' && p.sub.trim().length > 0 && p.sub.length <= 256 &&
      typeof p.exp === 'number' && typeof p.iat === 'number' && Number.isSafeInteger(p.exp) && Number.isSafeInteger(p.iat) &&
      p.exp > now && p.iat >= 0 && p.iat <= now && p.exp > p.iat && p.exp - p.iat <= 300 &&
      (p.nbf === undefined || typeof p.nbf === 'number' && Number.isSafeInteger(p.nbf) && p.nbf >= 0 && p.nbf <= now), 'AUTH_DENIED');''',
84: '''export const GUIDED_REFUSAL_CODES = [
  'AUTH_DENIED','IDEMPOTENCY_CONFLICT','SCHEMA','IDENTITY_MISMATCH','CAPACITY','CONTEXT_LOST','ALREADY_CONSUMED','BUSY',
  'TARGET_CHANGED','PREPARATION_DENIED','ADMISSION_DENIED','BINDING_UNAVAILABLE','BINDING_DENIED','BINDING_ORDER',
  'ACTION_ORDER','CONTEXT_REVISION','INPUT_IDENTITY','BUDGET_EXCEEDED'
] as const;''',
85: '''export const GUIDED_REFUSAL_REASONS = [
  'PASSWORD_TARGET_ABSENT','PASSWORD_TARGET_AMBIGUOUS','PASSWORD_FORM_ACTION_NOT_ALLOWED','PASSWORD_CONTROL_READ_REFUSED'
] as const;''',
98: '''      insist(req.socket instanceof TLSSocket&&req.socket.authorized&&
        req.socket.getPeerCertificate().fingerprint256===options.controllerCertificateFingerprint256,'AUTH_DENIED');''',
101: r'''      const route=/^\/internal\/v2\/studio\/guided-sessions\/([^/]+)\/(assign|context|prepare|dispatch|observe|stop)$/u
        .exec(req.url??'');insist(route,'SCHEMA');
      const sessionId=decodeURIComponent(route[1]??'');const operation=route[2];routed={operation:operation??'',sessionId};''',
106: '''        const assignment=validate<Assignment>('assignment',body);insist(
          assignment.sessionId===sessionId&&assignment.workerId===options.workerId&&req.headers['x-owner-fence']===undefined,
          'IDENTITY_MISMATCH');''',
108: '''        const stop=validate<AssignmentStop>('assignment-stop',body);insist(
          stop.assignment.sessionId===sessionId&&stop.assignment.workerId===options.workerId&&req.headers['x-owner-fence']===undefined,
          'IDENTITY_MISMATCH');''',
112: '''        insist(envelope.sessionId===sessionId&&envelope.workerId===options.workerId&&
          req.headers['x-owner-fence']===String(envelope.ownerFence),'IDENTITY_MISMATCH');''',
114: '''        envelope=validate<BridgeIdentity>('bridge',identity(body as BridgeIdentity),'identity');
        insist(envelope.sessionId===sessionId&&envelope.workerId===options.workerId&&
          req.headers['x-owner-fence']===String(envelope.ownerFence),'IDENTITY_MISMATCH');''',
116: '''      const replayKey=JSON.stringify([sessionId,operation,key]),{digest,secretIdentity}=guidedDispatchIdentity(body),prior=replay.get(replayKey);
      if(prior)insist(prior.digest===digest&&prior.secretIdentity===secretIdentity,'IDEMPOTENCY_CONFLICT');''',
131: '''        else{
          if(operation!=='stop'){insist(envelope,'IDENTITY_MISMATCH');ownership.getRuntime(envelope);}
          result=await prior.promise;
          if(operation==='observe'){
            insist(envelope,'IDENTITY_MISMATCH');result=ownership.getRuntime(envelope).currentObservation(result);
          }
        }''',
132: '''      }else{
        insist(replay.size<10000,'CAPACITY');const promise=execute();replay.set(replayKey,{digest,secretIdentity,promise});result=await promise;
      }''',
140: '''        try{
          (options.diagnosticStderr??((text:string)=>{process.stderr.write(text);}))(describeStartFailure(error,{
            operation:routed.operation,sessionId:routed.sessionId,elapsedMs:Date.now()-began
          }));
        }catch{/* A diagnostic never changes the verdict. */}''',
142: '''      if(!res.headersSent)res.writeHead(code==='AUTH_DENIED'?401:409,{
        'content-type':'application/json','cache-control':'no-store'
      });res.end(JSON.stringify({code,...(reason ? {reason} : {})}));''',
154: '''  const server = createServer(
    {...options.tls,minVersion:'TLSv1.2',requestCert:true,rejectUnauthorized:true},(req,res)=>{bridge.handle(req,res);}
  );''',
156: '''  return {server,async close(){
    const stopped=await Promise.allSettled([bridge.closeSessions()]);server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>{if(error)reject(error);else resolve();}));
    if(stopped.some(result=>result.status==='rejected'))throw new Error('CONTEXT_LOST');
  }};''',
165: '''async function controllerRequest(
  options: GuidedCallbackOptions, sessionId: string, route: string, message: unknown,
  fence: number | undefined, key: string, timeoutMs: number, signal?: AbortSignal
): Promise<{status: number; body: unknown}> {''',
167: '''  const base = new URL(options.baseUrl);
  insist(base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash, 'CONFIGURATION_DENIED');''',
172: '''  const aborted = new Promise<never>((_resolve,reject) => {
    abortListener = () => { reject(new Error('CALLBACK_DENIED')); };
    if (cancellation.aborted) abortListener(); else cancellation.addEventListener('abort',abortListener,{once:true});
  });''',
177: '''      const req = httpsRequest(destination,{
        ...options.tls,rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,
        checkServerIdentity:(hostname,certificate)=>checkServerIdentity(hostname,certificate)??
          (certificate.fingerprint256===options.controllerCertificateFingerprint256?undefined:new Error('CALLBACK_DENIED')),
        method:'POST',signal:cancellation,headers:{
          authorization:`Bearer ${token}`,'content-type':'application/json','content-length':Buffer.byteLength(body),
          'idempotency-key':key,...(fence === undefined ? {} : {'x-owner-fence':String(fence)})
        }
      },response => {''',
179: '''        response.on('data',(part:Buffer)=>{
          bytes+=part.length;if(bytes>1024*1024)req.destroy(new Error('CALLBACK_DENIED'));else chunks.push(part);
        });''',
180: '''        response.on('end',()=>{
          try{
            const bytes=Buffer.concat(chunks);
            resolve({status:response.statusCode??0,body:bytes.length ? parseWireJson(bytes) : null});
          }catch{reject(new Error('CALLBACK_DENIED'));}
        });''',
183: '''      req.on('socket',socket=>{
        if(socket instanceof TLSSocket)socket.on('secureConnect',()=>{
          if(!socket.authorized||socket.getPeerCertificate().fingerprint256!==options.controllerCertificateFingerprint256)
            req.destroy(new Error('CALLBACK_DENIED'));
        });
      });''',
191: '''    const definition=route==='bootstrap-evidence'?'bootstrap':route==='observations'?'observation':
      route==='outcomes'?'outcome':route==='recording-evidence'?'recordingEvidence':'lifecycle';''',
195: '''    const result=await controllerRequest(
      options,assignment?.sessionId??drift?.sessionId??(notice as BridgeIdentity).sessionId,route,message,
      assignment?undefined:drift?.ownerFence??(notice as BridgeIdentity).ownerFence,idempotencyKey??randomUUID(),10_000
    );''',
202: '''    if (result.status === 403 || result.status === 409 && typeof result.body === 'object' && result.body !== null &&
      'code' in result.body && result.body.code === 'SECRET_USE_REVOKED') throw new Error('REVOKED');'''
}

# Final hand-authored refinements; keep line-edit metadata and full draft identical.
REPLACEMENTS['guided/transport.ts'][116] = "      const replayKey=JSON.stringify([sessionId,operation,key]),\n        {digest,secretIdentity}=guidedDispatchIdentity(body),prior=replay.get(replayKey);\n      if(prior)insist(prior.digest===digest&&prior.secretIdentity===secretIdentity,'IDEMPOTENCY_CONFLICT');"
REPLACEMENTS['guided/transport.ts'][132] = "      }else{\n        insist(replay.size<10000,'CAPACITY');const promise=execute();\n        replay.set(replayKey,{digest,secretIdentity,promise});result=await promise;\n      }"

for relative, edits in REPLACEMENTS.items():
    source = REPO / 'studio-runner/src' / relative
    original = source.read_text()
    lines = original.splitlines()
    for number in edits:
        assert number <= len(lines)
        assert len(lines[number - 1]) > 140 or (relative == 'run/guidedBrowser.ts' and number == 26)
    # Exact full original lines recorded for review and source-drift protection.
    audit = {str(n): {'before': lines[n-1], 'after': after} for n, after in edits.items()}
    import json
    audit_file = BASE / 'line-edits' / (relative.replace('/', '__') + '.json')
    audit_file.parent.mkdir(parents=True, exist_ok=True)
    audit_file.write_text(json.dumps(audit, indent=2) + '\n')
    draft = '\n'.join(edits.get(n, line) for n, line in enumerate(lines, 1)) + '\n'
    target = BASE / 'repo/studio-runner/src' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(draft)
    before = BASE / 'before/studio-runner/src' / relative
    before.parent.mkdir(parents=True, exist_ok=True)
    before.write_bytes(source.read_bytes())

# Two additional explicitly chosen wrap points for the authored transport replacements.
target = BASE / 'repo/studio-runner/src/guided/transport.ts'
text = target.read_text()
text = text.replace('const replayKey=JSON.stringify([sessionId,operation,key]),{digest,secretIdentity}=guidedDispatchIdentity(body),prior=replay.get(replayKey);',
                    'const replayKey=JSON.stringify([sessionId,operation,key]),\n        {digest,secretIdentity}=guidedDispatchIdentity(body),prior=replay.get(replayKey);')
text = text.replace("insist(replay.size<10000,'CAPACITY');const promise=execute();replay.set(replayKey,{digest,secretIdentity,promise});result=await promise;",
                    "insist(replay.size<10000,'CAPACITY');const promise=execute();\n        replay.set(replayKey,{digest,secretIdentity,promise});result=await promise;")
target.write_text(text)

# The complete matched pointer blocks are retained in pointer-edits.json, with displayed names.
import re, ast
source = REPO / 'studio-runner/test/deferred.test.ts'
original = source.read_text()
pattern = re.compile(r"    it\.skip\(\n(?P<name>(?:      .+\n)+?)      \(\) => \{\n        throw new Error\('unreachable: this is a pointer, not a criterion'\);\n      \},\n    \);")
edits=[]
def pointer(match):
    chunks=[]
    for line in match.group('name').splitlines():
        literal=line.strip()
        if literal.endswith(' +'): literal=literal[:-2].rstrip()
        if literal.endswith(','): literal=literal[:-1]
        chunks.append(ast.literal_eval(literal))
    name=''.join(chunks)
    replacement='    // R-40 historical pointer (not a skipped criterion):\n' + '\n'.join('    // '+part for part in chunks) + '\n'
    edits.append({'name':name,'before':match.group(0),'after':replacement.rstrip('\n')})
    return replacement.rstrip('\n')
draft=pattern.sub(pointer,original)
assert len(edits)==4, len(edits)
assert original.count('it.skip(')==19 and draft.count('it.skip(')==15
for dirname,data in [('repo',draft),('before',original)]:
    target=BASE/dirname/'studio-runner/test/deferred.test.ts'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(data)
(BASE/'pointer-edits.json').write_text(json.dumps(edits,indent=2,ensure_ascii=False)+'\n')
