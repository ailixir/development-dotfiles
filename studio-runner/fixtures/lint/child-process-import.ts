// Fixture: `no-restricted-imports` for child_process outside src/run/**.
import { execSync } from 'node:child_process';

export function run(command: string): unknown {
  return execSync(command);
}
