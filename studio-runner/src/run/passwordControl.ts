import type {InvocationControl} from '../executor/observedReplay.js';
import type {ObservationSession, PasswordTarget} from './observationTypes.js';

export interface PasswordWorldState {
  closed: boolean; busy: boolean; generation: number; observedNavigation: number;
  navigation: number; documentId: string | undefined; available: boolean;
}
export interface PasswordWorldResult {
  result: {value?: unknown}; exceptionDetails?: {exception?: {description?: string}};
}
export interface PasswordWorldPort {
  current(): PasswordWorldState;
  call(method: 'preparePassword'|'fillPassword', values: readonly unknown[]): Promise<PasswordWorldResult>;
}
/** A private trusted control refusal before any value write, never a wire claim. */
export class PasswordNoEffect extends Error { readonly noEffect=true; }
/** Metadata/transport boundary only. The sole candidate definition and element pin stay in
 * the isolated collector; this port cannot resolve a selector or inspect a page. */
export function createPasswordControl(port: PasswordWorldPort, assertLive: () => void, withhold: (values: readonly string[]) => Promise<void>): Required<Pick<ObservationSession,'preparePassword'|'fillPassword'>> {
  const guard = (target: PasswordTarget): PasswordWorldState => {
    const state=port.current(); assertLive();
    if(state.closed || state.busy || !state.available || state.observedNavigation!==state.navigation || target.generation!==state.generation || target.documentId!==state.documentId)throw new PasswordNoEffect('TARGET_CHANGED');
    return state;
  };
  const outcome = (result: PasswordWorldResult, before: PasswordWorldState, success:string, allowed: readonly string[]): void => {
    assertLive(); if(port.current().navigation!==before.navigation)throw new Error('TARGET_CHANGED');
    if(result.exceptionDetails)throw new Error('TARGET_CHANGED');
    const value=result.result.value;
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)throw new Error('TARGET_CHANGED');
    const fact=value as Record<string,unknown>,keys=Object.keys(fact).sort().join(',');
    if(keys==='code,kind'&&fact.kind==='passwordPrewriteRefusal'&&typeof fact.code==='string'&&fact.code.length<=64&&['TARGET_CHANGED',...allowed].includes(fact.code))throw new PasswordNoEffect(fact.code);
    if(keys!=='kind'||fact.kind!==success)throw new Error('TARGET_CHANGED');
  };
  return {
    async preparePassword(target,origin){const before=guard(target);const result=await port.call('preparePassword',[target,origin]);outcome(result,before,'passwordPrepared',['PASSWORD_TARGET_ABSENT','PASSWORD_TARGET_AMBIGUOUS']);},
    async fillPassword(target,origin,allowedOrigins,value,control?: InvocationControl){
      control?.check();const before=guard(target);await withhold([value]);control?.check();guard(target);
      if(port.current().navigation!==before.navigation)throw new PasswordNoEffect('TARGET_CHANGED');
      // A guided control answers with its memoised ack; the replay control answers synchronously and no await is added there.
      if(control?.phase==='PREPARING'){const begun:unknown=control.beginInvocation();if(begun instanceof Promise){await begun;control.check();}}
      const result=await port.call('fillPassword',[target,origin,[...allowedOrigins],value]);control?.check();outcome(result,before,'passwordWriteCompleted',['PASSWORD_FORM_ACTION_NOT_ALLOWED','POLICY_DENIED']);
    },
  };
}
