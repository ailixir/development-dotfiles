import {appendFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRedactor} from '../executor/redaction.js';
import {hash} from './contracts.js';

export interface DiagnosticIdentity {sessionId:string;contextId:string;admissionId:string;stepId:string;ordinal:number}
export function redactFailure(error:unknown,knownValues:readonly string[]):string{
  const redactor=createRedactor(knownValues);
  const text=error instanceof Error?redactor.redact(error.name)+': '+redactor.redact(error.message):'Unknown error: '+typeof error;
  // Scalar redaction precedes interpolation; re-scrub any variant spanning the safe fields.
  const redacted=redactor.redact(text).replace(/\s+/gu,' ').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu,'�').trim();
  let bytes=0,bounded='';
  for(const character of redacted){const length=Buffer.byteLength(character);if(bytes+length>2048 || Array.from(bounded).length>=2048)break;bounded+=character;bytes+=length;}
  return bounded||'Unknown error';
}
/** Bounded, non-authoritative sidecar. Consumption/recovery never reads this file. */
export class GuidedDiagnostics {
  private records=0;private bytes=0;
  readonly path:string;
  constructor(private readonly directory:string,sessionId:string,private readonly maxRecords=200,private readonly maxBytes=262144){this.path=join(directory,hash(sessionId)+'.diagnostic.jsonl');}
  async record(identity:DiagnosticIdentity,error:unknown,knownValues:readonly string[],stderr:(text:string)=>void):Promise<string>{
    const errorMessage=redactFailure(error,knownValues);
    const line=JSON.stringify({...identity,errorMessage})+'\n',bytes=Buffer.byteLength(line);
    if(this.records>=this.maxRecords || this.bytes+bytes>this.maxBytes)return errorMessage;
    this.records++;this.bytes+=bytes;
    try{stderr(errorMessage+'\n');}catch{/* Diagnostic delivery never changes the verdict. */}
    try{await mkdir(this.directory,{recursive:true,mode:0o700});await appendFile(this.path,line,{mode:0o600,flag:'a'});}catch{/* No authority or replay state is stored here. */}
    return errorMessage;
  }
}
