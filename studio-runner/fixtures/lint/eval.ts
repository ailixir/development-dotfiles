// Fixture: `no-eval`. Not compiled, not imported; linted only by test/lint-boundary.test.ts.
export function run(source: string): unknown {
  return eval(source);
}
