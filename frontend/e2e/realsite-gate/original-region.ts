/** Original-observation audit. A later document never supplies historical selection authority. */
import {sha256Hex} from './common.ts';
export type ReadRelation='SAME_ROW_LABEL'|'IMMEDIATE_HEADING_SAME_PARENT'|'R7_ADJACENT_PUBLIC';
export interface PublicAnchor {role:string;name:string}
export interface SemanticScope {relation:ReadRelation|'EXPLICIT_PREFIX'|'QUALIFIER';anchors:PublicAnchor[];locatorPrefix:unknown[]}
export interface OriginalFact {role:string;name:string;editable:boolean;evidence:string;evidenceSegments:{field:string;start:number;end:number}[];text?:string;nameComplete?:boolean;scopeRefs?:string[];ordinal?:{index:number;count:number};readScope?:{relation:ReadRelation;sourceRefs:string[]}}
export interface OriginalObservation {sessionId:string;documentId:string;generation:number;outline:string;facts:Record<string,OriginalFact>;projection:{projected:boolean;notShown:number;shownNodes:number;totalNodes:number};[key:string]:unknown}
export interface OriginalSelection {
  sessionId:string;documentId:string;generation:number;ref:string;observationHash:string;factHash:string;
  observation:OriginalObservation;proofTarget:{locator:unknown[];tier:string;identity:unknown};frozenTarget:{locator:unknown[];tier:string;identity:unknown};
  exactJoins:boolean;operationKind:string;authoredScopeIntent?:string|null;
}
/** Matches SQL canonical-v1: UTF-8 key order, integer numbers only, bounded recursion. */
export function canonical(value:unknown,depth=0):string {
  if(depth>32)throw new Error('CANONICAL_DEPTH');
  if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
  if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new Error('CANONICAL_NUMBER');return String(value);}
  if(Array.isArray(value))return`[${value.map((v)=>canonical(v,depth+1)).join(',')}]`;
  if(typeof value==='object'&&value!==null)return`{${Object.keys(value).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map((key)=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key],depth+1)}`).join(',')}}`;
  throw new Error('CANONICAL_TYPE');
}
export const canonicalHash=(value:unknown):string=>sha256Hex(canonical(value));
interface Line {depth:number;role:string;name:string|null;ref:string|null;parent:number|null}
function completeOutline(o:OriginalObservation):Line[]|null {
  if(o.projection.projected||o.projection.notShown!==0)return null;
  const lines:Line[]=[],stack:number[]=[],refs=new Set<string>();
  for(const raw of o.outline.split('\n').filter((line)=>line!=='')){
    const m=/^( *)- (\S+)(?: ("(?:[^"\\]|\\.)*"))?(?: \[(e[0-9]{1,6})\])?([^\n\r\u2028\u2029]*)$/.exec(raw);
    if(m===null||m[1]!.length%2!==0)return null;
    const depth=m[1]!.length/2;if(depth>stack.length)return null;
    stack.length=depth;const parent=depth===0?null:stack[depth-1] ?? null;
    const name=m[3]===undefined?null:JSON.parse(m[3]) as string,ref=m[4] ?? null;
    if(ref!==null){if(refs.has(ref))return null;refs.add(ref);const f=o.facts[ref];if(f===undefined||f.role!==m[2]||f.name!==name)return null;}
    lines.push({depth,role:m[2]!,name,ref,parent});stack.push(lines.length-1);
  }
  if(lines.length!==o.projection.shownNodes||o.projection.shownNodes!==o.projection.totalNodes)return null;
  if(refs.size!==Object.keys(o.facts).length||Object.keys(o.facts).some((ref)=>!refs.has(ref)))return null;
  return lines;
}
function ancestor(lines:Line[],index:number,role:string):number|null {let cursor=lines[index]?.parent ?? null;while(cursor!==null){if(lines[cursor]?.role===role)return cursor;cursor=lines[cursor]?.parent ?? null;}return null;}
function outlineRelation(o:OriginalObservation,ref:string,sourceRefs:string[],relation:SemanticScope['relation']):boolean {
  const lines=completeOutline(o);if(lines===null)return false;const target=lines.findIndex((l)=>l.ref===ref);if(target<0)return false;
  const sourceIndices=sourceRefs.map((r)=>lines.findIndex((l)=>l.ref===r));if(sourceIndices.some((i)=>i<0))return false;
  if(relation==='EXPLICIT_PREFIX')return sourceIndices.every((source)=>{let cursor=lines[target]!.parent;while(cursor!==null){if(cursor===source)return true;cursor=lines[cursor]!.parent;}return false;});
  if(relation==='IMMEDIATE_HEADING_SAME_PARENT')return sourceIndices.length===1&&lines[sourceIndices[0]!]!.role==='heading'&&lines[sourceIndices[0]!]!.parent===lines[target]!.parent&&sourceIndices[0]!<target&&!lines.some((line,i)=>i>sourceIndices[0]!&&i<target&&line.parent===lines[target]!.parent);
  if(relation==='SAME_ROW_LABEL'){
    // Sanitized ancestry proves a shared row; it cannot infer governing column geometry.
    if(sourceIndices.some((source)=>lines[source]!.role==='columnheader'))return false;
    const row=ancestor(lines,target,'row');return row!==null&&sourceIndices.every((source)=>ancestor(lines,source,'row')===row);
  }
  return false;
}
function shownFactsConsistent(o:OriginalObservation,sourceRefs:string[]):boolean {
  const shown=new Map<string,{role:string;name:string|null}>();
  for(const raw of o.outline.split('\n').filter((l)=>l!=='')){if(/^… [0-9]+ more nodes not shown *$/.test(raw)||/^ *… [0-9]+ more options *$/.test(raw))continue;const m=/^( *)- (\S+)(?: ("(?:[^"\\]|\\.)*"))?(?: \[(e[0-9]{1,6})\])?([^\n\r\u2028\u2029]*)$/.exec(raw);if(m===null)return false;const ref=m[4];if(ref===undefined)continue;if(shown.has(ref)||o.facts[ref]===undefined||o.facts[ref]!.role!==m[2])return false;shown.set(ref,{role:m[2]!,name:m[3]===undefined?null:JSON.parse(m[3]) as string});}
  return shown.size===Object.keys(o.facts).length&&Object.keys(o.facts).every((ref)=>shown.has(ref))&&sourceRefs.every((ref)=>shown.get(ref)?.name===o.facts[ref]?.name);
}
function cleanSource(f:OriginalFact):boolean {return f.nameComplete===true&&f.editable===false&&f.name.length>0&&f.name.length<=256&&!/\[withheld\]|\[private\]|\u2026/.test(f.name)&&['heading','rowheader','columnheader','cell','link','text','listitem','navigation','region','complementary','main','form','dialog','alertdialog','search','row','article','group','table','grid','tabpanel','menu','toolbar','banner','contentinfo','list'].includes(f.role);}
function coherentClass(o:OriginalObservation,ref:string):boolean {
  const f=o.facts[ref];if(f===undefined)return false;
  const group=Object.entries(o.facts).filter(([,v])=>v.role===f.role&&v.name===f.name&&v.evidence===f.evidence);
  if(group.length===1)return f.ordinal===undefined;
  return group.every(([,v])=>v.ordinal!==undefined&&v.ordinal.count===group.length&&Number.isInteger(v.ordinal.index)&&v.ordinal.index>=1&&v.ordinal.index<=group.length)&&new Set(group.map(([,v])=>v.ordinal!.index)).size===group.length;
}
export function originalSelectionFindings(s:OriginalSelection):string[]{
  const o=s.observation,f=o.facts[s.ref];
  return !s.exactJoins||o.sessionId!==s.sessionId||o.documentId!==s.documentId||o.generation!==s.generation||canonicalHash(o)!==s.observationHash||f===undefined||canonicalHash(f)!==s.factHash||canonical(s.proofTarget)!==canonical(s.frozenTarget)?['UNKNOWN original observation/fact/preparation/frozen target identity']:[];
}
export function originalRegionFindings(s:OriginalSelection,truth:SemanticScope):{reasons:string[];sourceRefs:string[];authority:'READ_SCOPE'|'COMPLETE_OUTLINE'|'SCOPE_REFS_QUALIFIER'|'UNKNOWN'} {
  const reasons:string[]=[],o=s.observation,f=o.facts[s.ref];
  const identity=originalSelectionFindings(s);if(identity.length)return{reasons:identity,sourceRefs:[],authority:'UNKNOWN'};
  if(f===undefined)return{reasons:['UNKNOWN original target fact'],sourceRefs:[],authority:'UNKNOWN'};
  if(truth.anchors.length<1||truth.anchors.length>8||truth.anchors.some((a)=>!a.name||a.name.length>256)||truth.locatorPrefix.length<1||truth.locatorPrefix.length>8||canonical(s.frozenTarget.locator.slice(0,truth.locatorPrefix.length))!==canonical(truth.locatorPrefix))return{reasons:['Q4 WRONG_REGION: original frozen scope differs from independently declared semantic region'],sourceRefs:[],authority:'UNKNOWN'};
  const effects=['click','hover','press','check','uncheck','fill','selectOption'];
  if(effects.includes(s.operationKind)){
    const refs=f.scopeRefs,normalize=(value:string):string=>value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');
    if(truth.relation!=='QUALIFIER'||typeof s.authoredScopeIntent!=='string'||!s.authoredScopeIntent.trim()||refs===undefined||refs.length<1||refs.length>8||new Set(refs).size!==refs.length||refs.some((ref)=>!/^e[0-9]{1,6}$/.test(ref)||ref===s.ref||o.facts[ref]===undefined||o.facts[ref]!.nameComplete!==true||!cleanSource(o.facts[ref]!)||!coherentClass(o,ref))||!shownFactsConsistent(o,refs))return{reasons:['UNKNOWN current complete effect-safe scopeRefs qualifier; readScope/indentation cannot authorize effects'],sourceRefs:refs ?? [],authority:'UNKNOWN'};
    const anchors=refs.map((ref)=>({role:o.facts[ref]!.role,name:o.facts[ref]!.name}));
    if(truth.anchors.some((a)=>anchors.filter((b)=>canonical(a)===canonical(b)).length!==1)||!truth.anchors.some((a)=>normalize(a.name)===normalize(s.authoredScopeIntent!)))return{reasons:['Q4 WRONG_REGION: original effect qualifier differs from independently expected full public scope label'],sourceRefs:refs,authority:'UNKNOWN'};
    const competitors=Object.entries(o.facts).filter(([,candidate])=>candidate.role===f.role&&candidate.name===f.name&&candidate.scopeRefs!==undefined&&candidate.scopeRefs.every((ref)=>o.facts[ref]!==undefined&&o.facts[ref]!.nameComplete===true&&cleanSource(o.facts[ref]!))&&truth.anchors.every((a)=>candidate.scopeRefs!.filter((ref)=>o.facts[ref]!.role===a.role&&o.facts[ref]!.name===a.name).length===1));
    if(competitors.length!==1||competitors[0]?.[0]!==s.ref)return{reasons:['UNKNOWN ambiguous original effect qualifier/target class; no first/ordinal tie breaker'],sourceRefs:refs,authority:'UNKNOWN'};
    return{reasons:[],sourceRefs:refs,authority:'SCOPE_REFS_QUALIFIER'};
  }
  const cert=f.readScope;
  let sourceRefs:string[]=[],authority:'READ_SCOPE'|'COMPLETE_OUTLINE'|'SCOPE_REFS_QUALIFIER'|'UNKNOWN'='UNKNOWN';
  if(cert!==undefined&&['read','assert'].includes(s.operationKind)){
    if(Object.keys(cert).sort().join()!=='relation,sourceRefs'||!['SAME_ROW_LABEL','IMMEDIATE_HEADING_SAME_PARENT','R7_ADJACENT_PUBLIC'].includes(cert.relation)||cert.relation!==truth.relation||cert.sourceRefs.length<1||cert.sourceRefs.length>8||new Set(cert.sourceRefs).size!==cert.sourceRefs.length||cert.sourceRefs.some((ref)=>!/^e[0-9]{1,6}$/.test(ref)||ref===s.ref||o.facts[ref]===undefined||!cleanSource(o.facts[ref]!)||!coherentClass(o,ref)))reasons.push('UNKNOWN closed/current/clean original readScope source certificate');
    else if(!shownFactsConsistent(o,cert.sourceRefs))reasons.push('UNKNOWN source refs must be complete and shown in the exact original outline');
    else{sourceRefs=cert.sourceRefs;authority='READ_SCOPE';
      const candidates=Object.entries(o.facts).filter(([,candidate])=>{const c=candidate.readScope;if(candidate.role!==f.role||(s.operationKind==='read'&&candidate.text===undefined)||c===undefined||c.relation!==truth.relation||c.sourceRefs.length<1||c.sourceRefs.length>8||new Set(c.sourceRefs).size!==c.sourceRefs.length||c.sourceRefs.some((ref)=>o.facts[ref]===undefined||!cleanSource(o.facts[ref]!)||!coherentClass(o,ref)))return false;return canonical(c.sourceRefs.map((ref)=>({role:o.facts[ref]!.role,name:o.facts[ref]!.name})))===canonical(truth.anchors);});
      if(candidates.length!==1||candidates[0]?.[0]!==s.ref)reasons.push('UNKNOWN ambiguous original semantic target/scope class; another permitted public anchor is required');
    }
  }else{
    if(o.projection.projected||o.projection.notShown!==0)reasons.push('UNKNOWN projected outline cannot prove missing region boundaries');
    else{
      sourceRefs=truth.anchors.flatMap((a)=>Object.entries(o.facts).filter(([ref,fact])=>ref!==s.ref&&fact.role===a.role&&fact.name===a.name&&cleanSource(fact)&&coherentClass(o,ref)).map(([ref])=>ref));
      const declaresColumn=truth.anchors.some((a)=>a.role==='columnheader');
      if(declaresColumn)reasons.push('UNKNOWN governing column requires actual original readScope certificate');
      if(declaresColumn||sourceRefs.length!==truth.anchors.length||!outlineRelation(o,s.ref,sourceRefs,truth.relation))reasons.push('UNKNOWN complete original outline region path');
      else authority='COMPLETE_OUTLINE';
    }
  }
  const actual=sourceRefs.map((ref)=>({role:o.facts[ref]!.role,name:o.facts[ref]!.name}));
  if(authority!=='UNKNOWN'&&(canonical(actual)!==canonical(truth.anchors)))reasons.push('Q4 WRONG_REGION: original public row/column/heading anchors differ from independent meaning');
  return{reasons,sourceRefs,authority:reasons.length?'UNKNOWN':authority};
}
