import type {InputRecipe, Step} from '../executor/observedOperations.js';
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
/** A source step that never started cannot invoke any of its frozen secret recipes. Started
 * steps are deliberately not inferred from exit/error codes or missing child results. */
export function provenSecretUseAfterLoss(names:readonly string[],recipes:readonly InputRecipe[],steps:readonly Step[],started:ReadonlySet<number>,completed:ReadonlyMap<number,string>):Record<string,SecretUseStatus>{
  const facts=new Map<string,SecretUseStatus>();
  for(const name of names){
    const inputs=new Set(recipes.filter(recipe=>recipe.kind==='secretRef'&&recipe.provenance.kind==='configuration'&&recipe.provenance.referenceName===name).map(recipe=>recipe.inputId));
    const consumers=steps.filter(step=>step.operations.some(action=>action.operation.kind==='fill'&&action.operation.value.kind==='secretRef'&&inputs.has(action.operation.value.sourceInputId)));
    if(consumers.some(step=>completed.get(step.stepIndex)==='PASS'))facts.set(name,'USED');
    else if(consumers.every(step=>!started.has(step.stepIndex)))facts.set(name,'NOT_USED');
  }
  return Object.fromEntries(facts);
}
