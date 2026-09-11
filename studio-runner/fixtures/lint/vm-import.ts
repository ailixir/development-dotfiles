// Fixture: `no-restricted-imports` for node:vm.
import vm from 'node:vm';

export function run(source: string): unknown {
  return vm.runInNewContext(source);
}
