/**
 * SEC-2, AC-4a part 3 — @qa's shim browser registry, **run**, in both directions.
 *
 * This is the criterion the story exists for, and @po named it the weakest by some distance. The
 * obvious implementation writes a test that asserts the browser path is not among the mount paths,
 * records "mutation: added a mount → red", and stops. That satisfies the words and not the
 * criterion. The criterion is **@qa's working shim, run twice, succeeding once** — and a control
 * whose removal changes nothing observable is not a control.
 *
 * So the attack lives in `sec2-shim-attack.sh`, runs inside the built image as `pwuser`, and is
 * executed here twice against the same image:
 *
 *  - **without** the control — a writable container — where it must SUCCEED;
 *  - **with** it — `--read-only` plus the two tmpfs mounts standing in for the chart's `emptyDir`s
 *    — where every write must be refused.
 *
 * The successful run's captured output is in the story's Dev Agent Record, including the
 * discriminating observation the script makes: the same binary launched directly has a renderer at
 * `Seccomp=2`, and launched through the shim has one at `Seccomp=0`. That is the sandbox being
 * off, observed, rather than inferred from a flag appearing on a command line.
 *
 * **Residual, named and not closed.** An adversary who can edit the pod spec still wins, and
 * nothing reads the *running* browser's identity. @po declined a runtime identity check on the
 * grounds that a shim able to re-exec without the sandbox can also report the correct pinned
 * version — it catches the careless attack and misses the careful one — and this file does not
 * reopen it.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';
import { imageUnavailableReason, RUNNER_IMAGE } from './image.js';

const ATTACK = join(packageRoot, 'test', 'deployment', 'sec2-shim-attack.sh');

interface Run {
  readonly status: number;
  readonly output: string;
}

function runAttack(controlled: boolean): Run {
  const args = ['run', '--rm', '-u', 'pwuser'];
  if (controlled) {
    // The control, in the shape the chart renders it: a read-only root filesystem with writable
    // `emptyDir`s at the scratch parent and at `/dev/shm`, and nowhere else.
    args.push('--read-only', '--tmpfs', '/scratch:uid=1001,gid=1001', '--tmpfs', '/dev/shm:size=1g');
  }
  args.push('-v', `${ATTACK}:/attack.sh:ro`, '--entrypoint', 'bash', RUNNER_IMAGE, '/attack.sh');
  try {
    const output = execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
    return { status: 0, output };
  } catch (error) {
    const shaped = error as { status?: number; stdout?: string; stderr?: string };
    return { status: shaped.status ?? -1, output: `${shaped.stdout ?? ''}${shaped.stderr ?? ''}` };
  }
}

describe('SEC-2 — the shim browser registry attack, run in both directions', () => {
  it(`has ${RUNNER_IMAGE}, or FAILS — SEC-2 is run, and a tier that cannot run says so`, () => {
    // **This test is the repair of the nineteenth vacuous-guard shape.** It used to read
    // `expect(typeof DOCKER).toBe('boolean')` — a tautology — with the disclosure in its own name,
    // and the three tests below were `it.skipIf(!DOCKER)`. QA pointed `STUDIO_RUNNER_IMAGE` at a tag
    // that does not exist and measured *1 passed / 3 skipped, in 1 ms*: **green**, with the attack
    // @po named this story's weakest criterion silently not run.
    //
    // The bar @po set is that the SUCCESSFUL run must be in the record. A tier that can quietly not
    // run cannot meet that bar, whatever its record says on the day it was written.
    const reason = imageUnavailableReason();
    expect(reason, `SEC-2 cannot be run: ${reason ?? ''}`).toBeNull();
  });

  // Ordered deliberately: the successful form runs FIRST. If it does not succeed, stop — either
  // the image changed or the experiment is wrong, and a control that appears to work against an
  // attack that no longer works is worth nothing.
  it('SUCCEEDS without the control: the shim is written and Chromium runs under it', () => {
    const run = runAttack(false);
    expect(run.output).toContain('mkdir SUCCEEDED: /ms-playwright/');
    expect(run.output).toContain('mkdir SUCCEEDED: /home/pwuser/');
    expect(run.output).toContain('SHIM INVOKED');
    expect(run.output).toContain('ATTACK SUCCEEDED');
    expect(run.status).toBe(0);

    // The discriminating observation, asserted rather than left to the eye: the control launch
    // (direct, no shim) has a sandboxed renderer and the shimmed launch does not. Without this,
    // "the flag was on the command line" would be the only evidence, and a flag on a line is not
    // a sandbox being off.
    const control = section(run.output, 'control: the same browser launched directly');
    const shimmed = section(run.output, 'seccomp status of each Chromium process under the shim');
    expect(control, 'the control browser did not start, so nothing is being compared').toContain(
      'type=--type=renderer',
    );
    expect(control).toContain('Seccomp=2 type=--type=renderer');
    expect(shimmed).toContain('Seccomp=0 type=--type=renderer');
  }, 240_000);

  it('is BLOCKED with the control: every write refused, and the reason recorded', () => {
    const run = runAttack(true);
    expect(run.output).toContain('ATTACK BLOCKED');
    expect(run.output).not.toContain('SHIM WRITTEN');

    // **Why the write failed matters.** "An assertion whose discriminating mechanism is pre-empted
    // by a different guard" is the eighth of the sixteen shapes: if the image simply lacked write
    // permission on those paths, the read-only filesystem would be doing nothing and the control
    // would be an illusion. The script prints the parent's mode for exactly this reason, and it
    // reads `drwxrwxrwx root:root /ms-playwright` — world-writable — and
    // `drwxr-x--- pwuser:pwuser /home/pwuser`, owned by the user the container runs as. **Neither
    // write was refused for a permissions reason.** The mechanism is `--read-only` alone.
    expect(run.output).toContain('Read-only file system');
    expect(run.output).toContain('drwxrwxrwx root:root /ms-playwright');
    expect(run.output).toContain('drwxr-x--- pwuser:pwuser /home/pwuser');
  }, 240_000);

  it('the control does not work by breaking the browser it protects', () => {
    // "A guard satisfied by a broken implementation" — the ninth shape. A pod that never starts a
    // browser at all would satisfy every assertion above trivially, and the read-only filesystem
    // is exactly the kind of control that could cause it: the first attempt at this chart mounted
    // the emptyDir *at* the scratch dir and the runner died on `EROFS … rmdir` before listening.
    //
    // So the legitimate browser is launched in the same read-only container, with its user-data
    // directory on the writable scratch — which is what `launchPersistentContext` does — and it
    // must start **with its sandbox on**.
    const script = [
      'REAL=$(find "$PLAYWRIGHT_BROWSERS_PATH" -name chrome-headless-shell -type f | head -1)',
      'mkdir -p /scratch/studio-runner/profile /scratch/studio-runner/tmp',
      // As `src/run/launcher.ts` does: Chromium's temp output follows TMPDIR into the run's own
      // scratch. Without it the browser dies on the read-only `/tmp` and this test would report
      // "the control breaks the browser" where it means "the test forgot what the runner does".
      'export TMPDIR=/scratch/studio-runner/tmp',
      '"$REAL" --headless --user-data-dir=/scratch/studio-runner/profile --disable-dev-shm-usage --remote-debugging-port=0 about:blank >/dev/null 2>&1 &',
      'sleep 6',
      'for pid in $(ls /proc | grep -E "^[0-9]+$"); do',
      '  cmd="$( (tr "\\0" " " < /proc/$pid/cmdline) 2>/dev/null )"',
      '  case "$cmd" in *chrome-headless-shell*)',
      '    echo "pid $pid Seccomp=$(awk "/^Seccomp:/ {print \\$2}" /proc/$pid/status 2>/dev/null) $(echo "$cmd" | grep -o -- "--type=[a-z-]*" || echo main)";;',
      '  esac',
      'done',
    ].join('\n');
    const output = execFileSync(
      'docker',
      [
        'run', '--rm', '-u', 'pwuser', '--read-only',
        '--tmpfs', '/scratch:uid=1001,gid=1001',
        '--tmpfs', '/dev/shm:size=1g',
        '--entrypoint', 'bash', RUNNER_IMAGE, '-c', script,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 },
    );
    expect(output, 'the browser did not start under the control').toContain('--type=renderer');
    expect(output, 'the browser started but unsandboxed').toContain('Seccomp=2 --type=renderer');
  }, 240_000);
});

/**
 * Everything between a heading and the next one.
 *
 * The next delimiter is searched for **newline-prefixed**: the headings are wrapped in the same
 * rule characters on both sides, so an unanchored search finds the closing half of the heading it
 * was given and returns an empty section — which would make every assertion over a section pass
 * or fail for a reason that has nothing to do with the run.
 */
function section(output: string, heading: string): string {
  const start = output.indexOf(heading);
  if (start < 0) return '';
  const next = output.indexOf('\n────────', start + heading.length);
  return output.slice(start, next < 0 ? undefined : next);
}
