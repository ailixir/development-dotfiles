import { describe, expect, it } from 'vitest';
import { stepCodesOf } from './stepCodes';

const op = (code: unknown, kind: unknown = 'step') => ({
  coordinate: { stepId: 's', ordinal: 0 },
  guardId: 'g0',
  operation: { kind, code, captures: [], uses: [], sourceHash: 'x' },
});

describe('stepCodesOf', () => {
  it('reads one code per step of a valid artifact, in order', () => {
    const artifact = {
      steps: [
        { stepIndex: 0, stepId: 'a', operations: [op('await page.goto(inputs["input-destination"]);')] },
        { stepIndex: 1, stepId: 'b', operations: [op("await page.getByRole('button').click();")] },
      ],
    };
    expect(stepCodesOf(artifact)).toEqual([
      { stepId: 'a', stepIndex: 0, codes: ['await page.goto(inputs["input-destination"]);'] },
      { stepId: 'b', stepIndex: 1, codes: ["await page.getByRole('button').click();"] },
    ]);
  });

  it('keeps every operation of a step, in order', () => {
    const artifact = { steps: [{ stepIndex: 0, stepId: 'a', operations: [op('one();'), op('two();'), op('three();')] }] };
    expect(stepCodesOf(artifact)[0].codes).toEqual(['one();', 'two();', 'three();']);
  });

  it('ignores operations that are not step operations or have no code', () => {
    const artifact = {
      steps: [
        { stepIndex: 0, stepId: 'a', operations: [op('keep();'), op('drop();', 'other'), op(undefined), op(7), null, 'x'] },
        { stepIndex: 1, stepId: 'b', operations: [op('drop();', 'other')] },
      ],
    };
    expect(stepCodesOf(artifact)).toEqual([{ stepId: 'a', stepIndex: 0, codes: ['keep();'] }]);
  });

  it.each([null, undefined, 'text', 4, [], {}, { steps: 'no' }, { steps: [null, 1, { stepId: 3, operations: [] }] }])(
    'returns nothing for malformed input %#',
    (input) => {
      expect(stepCodesOf(input)).toEqual([]);
    },
  );
});
