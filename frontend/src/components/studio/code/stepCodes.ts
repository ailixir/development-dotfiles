/** The generated code of one authored step in a confirmed revision artifact, in operation order. */
export interface StepCodes {
  stepId: string;
  stepIndex: number;
  codes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the per-step Playwright code from `TestDetailDto.confirmedRevisionArtifact`
 * (`contracts/v3/replay-artifact.schema.json`: `steps[].operations[].operation.code`).
 *
 * The artifact is typed opaque, so this is a defensive reader: an operation whose `operation.kind`
 * is not `step`, or that has no string `code`, is skipped; anything malformed yields no entry
 * rather than an error. A step with no readable code is left out.
 */
export function stepCodesOf(artifact: unknown): StepCodes[] {
  if (!isRecord(artifact) || !Array.isArray(artifact.steps)) return [];
  const result: StepCodes[] = [];
  artifact.steps.forEach((step: unknown, position: number) => {
    if (!isRecord(step) || typeof step.stepId !== 'string' || !Array.isArray(step.operations)) return;
    const codes: string[] = [];
    for (const entry of step.operations as unknown[]) {
      const operation = isRecord(entry) ? entry.operation : undefined;
      if (isRecord(operation) && operation.kind === 'step' && typeof operation.code === 'string') {
        codes.push(operation.code);
      }
    }
    if (codes.length === 0) return;
    result.push({
      stepId: step.stepId,
      stepIndex: typeof step.stepIndex === 'number' ? step.stepIndex : position,
      codes,
    });
  });
  return result;
}
