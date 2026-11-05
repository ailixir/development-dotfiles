/**
 * The one host the runner runs on, chosen once from `process.platform` (ADR-SC-009). No flag and no environment switch:
 * a posix process is always the posix host, and production is posix.
 */
import { posixHost } from './posix.js';
import type { Host } from './types.js';
import { win32Files } from './win32Files.js';
import { win32Process } from './win32Process.js';

export const host: Host = process.platform === 'win32' ? Object.freeze({ process: win32Process, files: win32Files }) : posixHost;

export type { FileHost, Host, NodeOwnership, OpenFlags, ParentEnvironment, ProcessHost, ProcessRow, ProcessRowWithArgs, SignalSender, TreeSignalOutcome } from './types.js';
