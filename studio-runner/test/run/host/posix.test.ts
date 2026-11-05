/**
 * W3 pin (ADR-SC-009): the posix host is the code the runner always ran, moved. Every value below is the constant the
 * runner used before the host seam existed; a change here is a change to Linux production behaviour and must be one on
 * purpose. On posix the selected host must be this one.
 */
import { constants } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { host } from '../../../src/run/host/index.js';
import { PS_ARGUMENTS, PS_ARGUMENTS_WITH_ARGS, POSIX_INHERITED_ENV_KEYS, posixFiles, posixHost, posixProcess } from '../../../src/run/host/posix.js';
import { describePosixOnly } from '../../helpers/platform.js';

describe('the posix host keeps today\'s constants', () => {
  it('reads the table with the same ps argv, plain and with command lines', () => {
    expect([...PS_ARGUMENTS]).toEqual(['-A', '-o', 'pid=,ppid=']);
    expect([...PS_ARGUMENTS_WITH_ARGS]).toEqual(['-A', '-ww', '-o', 'pid=,ppid=,args=']);
  });

  it('forks detached (its own process group) and nothing else, samples every 25 ms bounded at 100 ms, reads tables bounded at 5 s', () => {
    expect(posixProcess.fork).toEqual({ detached: true });
    expect(posixProcess.samplesTree).toBe(true);
    expect(posixProcess.sampleIntervalMs).toBe(25);
    expect(posixProcess.sampleTimeoutMs).toBe(100);
    expect(posixProcess.tableTimeoutMs).toBe(5000);
    expect(posixProcess.productionSupported).toBe(true);
  });

  it('drains on SIGTERM and SIGINT, in that order', () => {
    expect([...posixProcess.drainSignals]).toEqual(['SIGTERM', 'SIGINT']);
  });

  it('inherits exactly the seven allowlisted keys, plus TMPDIR at the scratch directory, dropping empty values', () => {
    expect([...POSIX_INHERITED_ENV_KEYS]).toEqual(['PATH', 'HOME', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH', 'DISPLAY', 'XDG_RUNTIME_DIR']);
    expect(posixProcess.inheritedEnvKeys).toBe(POSIX_INHERITED_ENV_KEYS);
    const parent = { PATH: '/usr/bin', HOME: '/home/u', LANG: '', NODE_OPTIONS: '--import x', SECRET: 's', TMPDIR: '/elsewhere' };
    expect(posixProcess.childEnv(parent, '/scratch/run-1/tmp')).toEqual({ PATH: '/usr/bin', HOME: '/home/u', TMPDIR: '/scratch/run-1/tmp' });
    expect(posixProcess.browserEnv(parent, '/scratch/g')).toEqual({ PATH: '/usr/bin', HOME: '/home/u', TMPDIR: '/scratch/g' });
    expect(posixProcess.browserEnv({}, '/scratch/g')).toEqual({ PATH: '', HOME: '', TMPDIR: '/scratch/g' });
  });

  it('opens with the same O_* flags and does not fence (O_NOFOLLOW refuses the link at the open)', () => {
    expect(posixFiles.flags).toEqual({
      directory: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      noFollow: constants.O_RDONLY | constants.O_NOFOLLOW,
      noFollowNonBlock: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      createExclusive: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    });
    expect(posixFiles.fencesOpens).toBe(false);
    expect(posixFiles.descriptorPaths).toBe(process.platform === 'linux');
    expect(posixFiles.isSharingViolation(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe(false);
  });

  it('defaults scratch and the object store to the same /tmp roots', () => {
    expect(posixFiles.defaultRoots).toEqual({ scratch: '/tmp/studio-runner', objects: '/tmp/studio-runner-objects' });
  });

  it('judges mode bits and containment as the callers did inline', () => {
    expect(posixFiles.hasMode({ mode: 0o40700 }, 0o700)).toBe(true);
    expect(posixFiles.hasMode({ mode: 0o40750 }, 0o700)).toBe(false);
    expect(posixFiles.hasMode({ mode: 0o100600n }, 0o600)).toBe(true);
    expect(posixFiles.hasMode({ mode: 0o100644n }, 0o600)).toBe(false);
    expect(posixFiles.lacksMode({ mode: 0o40700 }, 0o077)).toBe(true);
    expect(posixFiles.lacksMode({ mode: 0o40720 }, 0o022)).toBe(false);
    expect(posixFiles.isInside('/a/b', '/a/b/c')).toBe(true);
    expect(posixFiles.isInside('/a/b', '/a/b')).toBe(false);
    expect(posixFiles.isInside('/a/b', '/a/bc')).toBe(false);
    expect(posixFiles.isInside('/a/b', '/A/B/c')).toBe(false);
  });

  it('knows its entry point by argv[1], exactly', () => {
    expect(posixProcess.isEntryPoint('file:///srv/dist/main.js', '/srv/dist/main.js')).toBe(true);
    expect(posixProcess.isEntryPoint('file:///srv/dist/main.js', '/srv/dist/probe.js')).toBe(false);
    expect(posixProcess.isEntryPoint('file:///srv/dist/main.js', '/SRV/dist/main.js')).toBe(false);
    expect(posixProcess.isEntryPoint('file:///srv/dist/main.js')).toBe(false);
  });
});

describePosixOnly('selection is by process.platform; this process is posix', 'the selected host', () => {
  it('is the posix host', () => {
    expect(host).toBe(posixHost);
  });

  it('owns what this uid owns, through the live getuid', () => {
    const uid = process.getuid?.() ?? -1;
    expect(posixFiles.isOwnNode({ uid })).toBe(true);
    expect(posixFiles.isOwnNode({ uid: BigInt(uid) })).toBe(true);
    expect(posixFiles.isOwnNode({ uid: uid + 1 })).toBe(false);
  });
});
