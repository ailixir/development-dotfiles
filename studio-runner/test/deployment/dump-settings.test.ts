/**
 * STUDIO-OBS-009 AC-4 (the chart-lint half, ruling A6): crash artifacts are off.
 *
 * A heap dump or a core dump of a process that held a decrypted Studio secret is a plaintext copy of
 * it on disk. The controls, and where each is asserted:
 *
 * - **JVM (API and worker):** `-XX:-HeapDumpOnOutOfMemoryError` and `-XX:-CreateCoredumpOnCrash` in
 *   `JAVA_OPTS`, and no `HeapDumpPath`, on every value set and with guided mode on or off. The JVM
 *   honours the LAST occurrence of a flag, so the check reads the last state of each flag instead
 *   of "is the string present".
 * - **Runner:** `ulimit -c 0` runs in the image CMD (`["sh","-c","ulimit -c 0 && exec node
 *   dist/main.js"]`), never as chart `args`. The chart overrides neither `command` nor `args`.
 *
 * What this does NOT show, stated so it is not read as shown: that the BACKEND image's entrypoint
 * actually consumes `JAVA_OPTS` (there is no backend Dockerfile in this repository), that a core
 * dump is not written by the runner at the node/kernel level (that is the image smoke, owed), and
 * that the Platform's own pod defaults leave `ulimit -c` alone. The backend core rlimit stays "owed,
 * owner Platform/SRE" (A6).
 *
 * Every predicate has a control that proves it can fail.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';

import {
  deploymentNamed,
  envValues,
  render,
  renderOutcome,
  runnerDeployment,
  soleContainer,
  VALUE_SETS,
  valueSetName,
} from './helm.js';

const MODES = VALUE_SETS.flatMap((file) =>
  [false, true].map((guided) => [`${valueSetName(file)} guided=${String(guided)}`, file, guided] as const),
);

/**
 * Violations of "dumps are off" in a `JAVA_OPTS` string. A flag counts by its LAST occurrence,
 * because that is the one the JVM applies.
 */
export function dumpFlagViolations(javaOpts: string | undefined): string[] {
  if (javaOpts === undefined || javaOpts.trim() === '') return ['JAVA_OPTS is absent'];
  const tokens = javaOpts.split(/\s+/u).filter((token) => token !== '');
  const violations: string[] = [];
  for (const flag of ['HeapDumpOnOutOfMemoryError', 'CreateCoredumpOnCrash']) {
    let state: '+' | '-' | null = null;
    for (const token of tokens) {
      const match = new RegExp(`^-XX:([+-])${flag}$`, 'u').exec(token);
      if (match !== null) state = match[1] as '+' | '-';
    }
    if (state === null) violations.push(`-XX:-${flag} is missing`);
    else if (state === '+') violations.push(`${flag} ends up ENABLED (the last occurrence is +)`);
  }
  for (const token of tokens) {
    if (token.startsWith('-XX:HeapDumpPath')) violations.push(`${token}: a dump path presupposes dumps`);
  }
  return violations;
}

/** Violations of the A6 runner CMD, given the instruction's JSON array. */
export function runnerCmdViolations(cmd: unknown): string[] {
  if (!Array.isArray(cmd) || !cmd.every((part) => typeof part === 'string')) {
    return ['the CMD is not a JSON exec-form array'];
  }
  if (cmd.length !== 3 || cmd[0] !== 'sh' || cmd[1] !== '-c') {
    return [`the CMD is not ["sh","-c","<script>"]: ${JSON.stringify(cmd)}`];
  }
  const script = String(cmd[2]);
  const commands = script.split('&&').map((part) => part.trim());
  const violations: string[] = [];
  if (commands.length !== 2 || commands[0] !== 'ulimit -c 0') {
    violations.push(`the script must start with exactly "ulimit -c 0 &&": ${script}`);
  }
  // `exec` as the LAST command is what replaces the shell, so node is the main process and SIGTERM
  // reaches it directly; without it the shell sits in front of node and the drain never runs.
  if (commands[commands.length - 1] !== 'exec node dist/main.js') {
    violations.push(`the last command must be "exec node dist/main.js": ${script}`);
  }
  if (/[;|&]\s*$/u.test(script) || /\bnode\b.*[;|]/u.test(script)) {
    violations.push(`something follows or pipes node: ${script}`);
  }
  return violations;
}

function dockerfileText(): string {
  return readFileSync(join(packageRoot, 'Dockerfile'), 'utf8');
}

/** Every real CMD instruction (comment lines excluded), as parsed JSON arrays, in file order. */
function dockerfileCmds(text: string): unknown[] {
  return text
    .split('\n')
    .filter((line) => /^CMD\s+/u.test(line))
    .map((line) => JSON.parse(line.replace(/^CMD\s+/u, '')) as unknown);
}

describe('AC-4 — JVM heap and core dumps are off on every value set', () => {
  it.each(MODES)('%s: the API and the worker carry both negative flags and no HeapDumpPath', (_label, valuesFile, guided) => {
    const outcome = render({ valuesFile, guided });
    for (const role of ['-api', '-worker']) {
      const javaOpts = envValues(soleContainer(deploymentNamed(outcome, role)))['JAVA_OPTS'];
      expect(dumpFlagViolations(javaOpts), `${role} (${valueSetName(valuesFile)})`).toEqual([]);
    }
  });

  it('the predicate can fail: it flags a missing flag, a later enabling flag and a dump path', () => {
    expect(dumpFlagViolations('-Xmx512m')).toHaveLength(2);
    expect(dumpFlagViolations(undefined)).toEqual(['JAVA_OPTS is absent']);
    // Present early, enabled later: the JVM applies the later one.
    expect(
      dumpFlagViolations('-XX:-HeapDumpOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash'),
    ).toHaveLength(1);
    expect(
      dumpFlagViolations('-XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash -XX:HeapDumpPath=/tmp'),
    ).toHaveLength(1);
    // One flag right, one enabled: exactly the enabled one is reported.
    expect(dumpFlagViolations('-XX:+CreateCoredumpOnCrash -XX:-HeapDumpOnOutOfMemoryError')).toEqual([
      'CreateCoredumpOnCrash ends up ENABLED (the last occurrence is +)',
    ]);
    expect(
      dumpFlagViolations('-XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash'),
    ).toEqual([]);
  });

  it('render mutations: an environment override that drops or reverses a flag turns the check red', () => {
    // The mutation lands inside the measurement window: the override goes to the `helm template`
    // invocation the assertion reads. This is how a future values file would regress the control.
    const dropped = render({
      args: ['--set-string', 'backend.env.JAVA_OPTS=-Xms256m -Xmx512m -XX:+UseG1GC'],
    });
    expect(dumpFlagViolations(envValues(soleContainer(deploymentNamed(dropped, '-api')))['JAVA_OPTS'])).toHaveLength(2);

    const reversed = render({
      args: [
        '--set-string',
        'worker.env.JAVA_OPTS=-Xmx768m -XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps',
      ],
    });
    expect(dumpFlagViolations(envValues(soleContainer(deploymentNamed(reversed, '-worker')))['JAVA_OPTS'])).toHaveLength(2);
  });

  it('is asserted per component: the worker block of each values file carries the flags too', () => {
    // A values file that overrode only the API's JAVA_OPTS would pass a check that read one pod.
    for (const valuesFile of VALUE_SETS) {
      const outcome = render({ valuesFile });
      const api = envValues(soleContainer(deploymentNamed(outcome, '-api')))['JAVA_OPTS'];
      const worker = envValues(soleContainer(deploymentNamed(outcome, '-worker')))['JAVA_OPTS'];
      expect(dumpFlagViolations(api), `${valueSetName(valuesFile)} API`).toEqual([]);
      expect(dumpFlagViolations(worker), `${valueSetName(valuesFile)} worker`).toEqual([]);
    }
  });
});

describe('AC-4 — runner core dumps are off in the image CMD, and the chart does not override it', () => {
  it('the Dockerfile has exactly one CMD, and it is the A6 form', () => {
    const cmds = dockerfileCmds(dockerfileText());
    expect(cmds, 'the runtime stage must have exactly one CMD').toHaveLength(1);
    expect(cmds[0]).toEqual(['sh', '-c', 'ulimit -c 0 && exec node dist/main.js']);
    expect(runnerCmdViolations(cmds[0])).toEqual([]);
  });

  it('the Dockerfile adds no ENTRYPOINT wrapper', () => {
    // An ENTRYPOINT in front of the CMD would put a second process between the runtime and node.
    expect(dockerfileText().split('\n').filter((line) => /^ENTRYPOINT\b/u.test(line))).toEqual([]);
  });

  it('the predicate can fail: it flags a shell form, a missing exec, a missing ulimit and a trailing command', () => {
    expect(runnerCmdViolations('node dist/main.js')).toHaveLength(1);
    expect(runnerCmdViolations(['node', 'dist/main.js'])).toHaveLength(1);
    expect(runnerCmdViolations(['sh', '-c', 'ulimit -c 0 && node dist/main.js']).join()).toContain('exec');
    expect(runnerCmdViolations(['sh', '-c', 'exec node dist/main.js']).join()).toContain('ulimit -c 0');
    expect(runnerCmdViolations(['sh', '-c', 'ulimit -c 0 && exec node dist/main.js; true'])).not.toEqual([]);
    expect(runnerCmdViolations(['sh', '-c', 'ulimit -c 0 && exec node dist/main.js'])).toEqual([]);
  });

  it.each(MODES)('%s: the chart overrides neither command nor args, so the image CMD is what runs', (_label, valuesFile, guided) => {
    const container = soleContainer(runnerDeployment(render({ valuesFile, guided })));
    expect(container.command).toBeUndefined();
    expect(container.args).toBeUndefined();
  });

  it('a runnerEnv entry cannot turn core dumps back on or carry a debug option (no such key is accepted)', () => {
    for (const key of ['STUDIO_RUNNER_VAULT_ADDRESS', 'NODE_OPTIONS', 'ULIMIT_CORE']) {
      const outcome = renderOutcome({ args: ['--set-string', `studioRunner.runnerEnv.${key}=x`] });
      expect(outcome.ok, `${key} rendered`).toBe(false);
      expect(outcome.error).toContain('not an accepted');
    }
  });
});
