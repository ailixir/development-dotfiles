// Fixture: `no-restricted-imports` for worker_threads.
import { Worker } from 'worker_threads';

export function run(source: string): unknown {
  return new Worker(source, { eval: true });
}
