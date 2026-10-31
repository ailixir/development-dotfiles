import type {Step} from '../executor/observedOperations.js';
export type SecretUseStatus='USED'|'NOT_USED'|'REFUSED';
/** Missing status is uncertainty. Positive use is monotone and survives later faults. */
export class SecretUseEvidence {
  private readonly statuses: Map<string,SecretUseStatus>;
  constructor(names:readonly string[]){this.statuses=new Map(names.map(name=>[name,'NOT_USED']));}
  attempting(name:string):void{if(this.statuses.get(name)!=='USED')this.statuses.delete(name);}
  used(name:string):void{this.statuses.set(name,'USED');}
  refusedBeforeEffect(name:string):void{if(this.statuses.get(name)!=='USED')this.statuses.set(name,'REFUSED');}
  snapshot():Record<string,SecretUseStatus>{return Object.fromEntries(this.statuses);}
}
/** Exact immutable linkage, shared by authenticated receipt-derived facts and reporting: a step consumes the secrets its frozen `uses` names. */
export function frozenSecretConsumers(steps:readonly Step[]):ReadonlyMap<number,readonly string[]>{
  const consumers=new Map<number,readonly string[]>();
  for(const step of steps){const names=new Set<string>();for(const action of step.operations)for(const use of action.operation.uses)if(use.kind==='secret')names.add(use.id);consumers.set(step.stepIndex,[...names]);}
  return consumers;
}
/** IPC receipts can be lost after the child starts an effect. The parent-private Execute send
 * attempt, not absence of a received step-started frame, bounds positive no-invocation proof. */
export function provenSecretUseAfterLoss(names:readonly string[],steps:readonly Step[],executeAttempted:boolean,completed:ReadonlyMap<number,string>):Record<string,SecretUseStatus>{
  const facts=new Map<string,SecretUseStatus>();
  const consumers=frozenSecretConsumers(steps);
  for(const name of names){
    const sourceSteps=[...consumers].filter(([,ids])=>ids.includes(name)).map(([index])=>index);
    if(sourceSteps.some(index=>completed.get(index)==='PASS'))facts.set(name,'USED');
    else if(sourceSteps.length===0||!executeAttempted)facts.set(name,'NOT_USED');
  }
  return Object.fromEntries(facts);
}
/** Child omissions do not erase independently authenticated receipts. A contradictory final is
 * rejected as a contract fault while positive completed-use evidence remains reportable. */
export function mergeSecretUseEvidence(receipts:Readonly<Record<string,SecretUseStatus>>,final:Readonly<Record<string,SecretUseStatus>>|undefined,names:readonly string[]):{facts:Record<string,SecretUseStatus>;contradictory:boolean}{
  const declared=new Set(names),facts=new Map(Object.entries(receipts));let contradictory=false;
  for(const [name,status]of Object.entries(final??{})){
    if(!declared.has(name)){contradictory=true;continue;}
    if(facts.has(name)&&facts.get(name)!==status){contradictory=true;continue;}
    facts.set(name,status);
  }
  return {facts:Object.fromEntries(facts),contradictory};
}
