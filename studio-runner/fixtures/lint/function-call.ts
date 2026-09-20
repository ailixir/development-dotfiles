// Fixture: the `CallExpression[callee.name="Function"]` restriction.
export function run(source: string): unknown {
  return Function(source);
}
