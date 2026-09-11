// Fixture: `no-implied-eval`. The core rule detects a string passed to setTimeout.
export function run(): void {
  setTimeout('fetch("/admin")', 0);
}
