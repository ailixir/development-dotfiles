import {createHash} from 'node:crypto';
/** The independent canonical serializer: sorted keys, JSON scalars. It never calls the production hash. */
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';
  return JSON.stringify(value);
}
export const boundaryHash=(value:unknown):string=>createHash('sha256').update(canonical(value),'utf8').digest('hex');

/**
 * Mutates a copy of a complete validation basis and re-derives every content-addressed hash that
 * the mutation changes, using the independent serializer (never the production derivation): a
 * string equal to the hash of an original sub-document becomes the hash of the same sub-document
 * after the edit, to a fixed point. Synthetic preimages (operation hashes, admissions) are not
 * touched, so a mutation must not change what they commit to.
 */
const HEX=/^[a-f0-9]{64}$/u;
function replace(value:unknown,sub:Map<string,string>):unknown {
  if(typeof value==='string')return HEX.test(value)&&sub.has(value)?sub.get(value):value;
  if(Array.isArray(value))return value.map(item=>replace(item,sub));
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,replace(child,sub)]));
  return value;
}
function pair(before:unknown,after:unknown,out:Map<string,string>):void {
  if(before===null||after===null||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)!==Array.isArray(after))return;
  out.set(boundaryHash(before),boundaryHash(after));
  for(const key of Object.keys(after))pair((before as Record<string,unknown>)[key],(after as Record<string,unknown>)[key],out);
}
interface Facts {scope:unknown;preparations:{preparationId:string;proof:unknown;proposal:{operation:unknown;executionEvidence:{origin:unknown}}}[];actions:{preparationId:string;ledger:{coordinate:unknown;operationHash:string;requestDigest:string;admission:{policyDecisionHash:string}}}[]}
/** admission.policyDecisionHash commits {scopeHash, preparation proof, requestDigest}: a synthetic preimage, not a sub-document. */
function policyDecisions(before:unknown,after:unknown,out:Map<string,string>):void {
  const b=before as Facts,a=after as Facts;
  const decision=(facts:Facts,fact:Facts['actions'][number])=>boundaryHash({scopeHash:boundaryHash(facts.scope),preparation:facts.preparations.find(p=>p.preparationId===fact.preparationId)?.proof,requestDigest:fact.ledger.requestDigest});
  const operation=(facts:Facts,fact:Facts['actions'][number])=>{const p=facts.preparations.find(item=>item.preparationId===fact.preparationId)?.proposal;return boundaryHash({coordinate:fact.ledger.coordinate,origin:p?.executionEvidence.origin,operation:p?.operation});};
  b.actions.forEach((fact,index)=>{const changed=a.actions[index];if(changed){out.set(fact.ledger.admission.policyDecisionHash,decision(a,changed));out.set(fact.ledger.operationHash,operation(a,changed));}});
}
export function resealBasis<T>(base:T,mutate:(copy:T)=>void):T {
  const edited=structuredClone(base);mutate(edited);
  let sub=new Map<string,string>(),current:unknown=edited;
  for(let round=0;round<40;round++){
    current=replace(edited,sub);
    const next=new Map<string,string>();pair(base,current,next);policyDecisions(base,current,next);
    for(const [from,to] of [...next])if(from===to)next.delete(from);
    if(next.size===sub.size&&[...next].every(([from,to])=>sub.get(from)===to))return current as T;
    sub=next;
  }
  throw Error('RESEAL_DID_NOT_CONVERGE');
}
