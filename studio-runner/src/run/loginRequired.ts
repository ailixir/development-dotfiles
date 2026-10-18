/** Trusted structural signature, never a text heuristic or a new failure trigger. */
export function loginRequiredSignature(observation: {readonly coverage: {readonly passwordControls:number};readonly nodes: readonly {readonly visible:boolean;readonly actionable:boolean;readonly elementType:string;readonly role:string}[]}): boolean {
  return observation.coverage.passwordControls >= 1 && observation.nodes.some(node => node.visible && node.actionable && (node.elementType === 'button' || node.elementType === 'input' || node.role === 'button'));
}
