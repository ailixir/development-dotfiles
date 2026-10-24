/** Trusted structural signature, never a text heuristic or a new failure trigger. */
export function loginRequiredSignature(observation) {
    return observation.coverage.passwordControls >= 1 && observation.nodes.some(node => node.visible && node.actionable && (node.elementType === 'button' || node.elementType === 'input' || node.role === 'button'));
}
//# sourceMappingURL=loginRequired.js.map