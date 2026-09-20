// Fixture: the `ImportExpression` restriction.
export async function run(specifier: string): Promise<unknown> {
  return import(specifier);
}
