// Fixture: `no-restricted-properties` for indirect eval via globalThis.
export function run(source: string): unknown {
  return globalThis.eval(source);
}
