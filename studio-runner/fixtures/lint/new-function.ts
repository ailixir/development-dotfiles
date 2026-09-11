// Fixture: `no-new-func` and the `NewExpression[callee.name="Function"]` restriction.
export function run(source: string): unknown {
  return new Function(source);
}
