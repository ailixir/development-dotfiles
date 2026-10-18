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
  const outcome = (result: PasswordWorldResult, before: PasswordWorldState, allowed: readonly string[]): void => {
    assertLive(); if(port.current().navigation!==before.navigation)throw new Error('TARGET_CHANGED');
    if(result.exceptionDetails){const description=result.exceptionDetails.exception?.description??'';const code=allowed.find(code=>description.includes(code));if(code || description.includes('TARGET_CHANGED'))throw new PasswordNoEffect(code??'TARGET_CHANGED');throw new Error('TARGET_CHANGED');}
  };
  return {
    async preparePassword(target,origin){const before=guard(target);const result=await port.call('preparePassword',[target,origin]);outcome(result,before,['PASSWORD_TARGET_ABSENT','PASSWORD_TARGET_AMBIGUOUS']);},
    async fillPassword(target,origin,allowedOrigins,value,control?: InvocationControl){
      control?.check();const before=guard(target);await withhold([value]);control?.check();guard(target);
      if(port.current().navigation!==before.navigation)throw new PasswordNoEffect('TARGET_CHANGED');
      if(control?.phase==='PREPARING')control.beginInvocation();
      const result=await port.call('fillPassword',[target,origin,[...allowedOrigins],value]);control?.check();outcome(result,before,['PASSWORD_FORM_ACTION_NOT_ALLOWED','POLICY_DENIED']);
    },
  };
}
