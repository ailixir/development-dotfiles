// Fixture: `no-implied-eval`.
export function run(source: string): void {
  setTimeout(source, 0);
}
