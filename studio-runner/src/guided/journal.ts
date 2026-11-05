import { mkdir, open } from 'node:fs/promises';
import { openSync, readFileSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import type { BridgeNativeFenceEvent } from './types.js';
import { canonical } from './contracts.js';
import { join, dirname, resolve } from 'node:path';
import { hash, insist } from './contracts.js';
import { host } from '../run/host/index.js';

/** Append-only, data-free consumption records. Directory and record are fsynced before effects.
 * A partial write or damaged record poisons recovery; uncertainty never authorizes replay.
 * Directory fsync is the host's (`host.files.syncDirectory`; win32: a no-op, ADR-SC-009).
 */
export class GuidedJournal {
  private readonly consumed = new Set<string>();
  private poisoned = false;
  private writing = false;
  private written = '';
  private readonly native = new Map<string, BridgeNativeFenceEvent>();
  private constructor(private readonly directory: string, private readonly path: string) {}
  static async open(directory: string, sessionId: string): Promise<GuidedJournal> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Persist any newly created directory entries as well as the eventual journal inode.
    for (let current = resolve(directory); ; current = dirname(current)) {
      await host.files.syncDirectory(current);
      if (current === dirname(current)) break;
    }
    const journal = new GuidedJournal(directory, join(directory, `${hash(sessionId)}.journal`));
    // Permanent creation marker is an exclusive cross-process reservation. It is never
    // removed at teardown: a lost worker cannot reconstitute its live DOM/value context.
    let owner;
    try { owner = await open(`${journal.path}.owner`, 'wx', 0o600); } catch { throw new Error('CONTEXT_LOST'); }
    try { await owner.sync(); } finally { await owner.close(); }
    await host.files.syncDirectory(directory);
    const file = await open(journal.path, 'wx', 0o600); try { await file.sync(); } finally { await file.close(); }
    await host.files.syncDirectory(directory);
    return journal;
  }
  get recovered(): boolean { return this.poisoned || this.consumed.size > 0; }
  /** Synchronous reservation and fsync: InvocationControl cannot cross the native API boundary
   * while a durable transition is still pending. No recovery ever recreates this browser. */
  fence(event: BridgeNativeFenceEvent): void {
    insist(!this.poisoned && !this.writing, 'JOURNAL_UNAVAILABLE');
    const prior = this.native.get(event.admissionId);
    if (prior) { insist(canonical(prior) === canonical(event), 'NATIVE_FENCE_REFUSED'); return; }
    this.native.set(event.admissionId, structuredClone(event));
    let fd: number | undefined;
    try {
      fd = openSync(this.path, 'r+');
      insist(readFileSync(fd, 'utf8') === this.written, 'JOURNAL_UNAVAILABLE');
      const record = canonical(event) + '\n'; const bytes = Buffer.from(record);
      insist(writeSync(fd, bytes, 0, bytes.length, Buffer.byteLength(this.written)) === bytes.length, 'JOURNAL_UNAVAILABLE');
      fsyncSync(fd); this.written += record;
    } catch { this.poisoned = true; throw new Error('JOURNAL_UNAVAILABLE'); }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  async consume(admission: unknown): Promise<void> {
    const key = hash(admission);
    insist(!this.poisoned && !this.consumed.has(key), 'ALREADY_CONSUMED');
    insist(!this.writing, 'JOURNAL_BUSY'); this.writing = true;
    this.consumed.add(key); // synchronous reservation excludes simultaneous delivery.
    try {
      const file = await open(this.path, 'r+');
      try {
        insist(await file.readFile('utf8') === this.written, 'JOURNAL_UNAVAILABLE');
        const record = Buffer.from(`${key}\n`);
        const persisted = await file.write(record, 0, record.length, Buffer.byteLength(this.written));
        insist(persisted.bytesWritten === record.length, 'JOURNAL_UNAVAILABLE'); await file.sync(); this.written += `${key}\n`;
      } finally { await file.close(); }
      await host.files.syncDirectory(this.directory);
    } catch { this.poisoned = true; throw new Error('JOURNAL_UNAVAILABLE'); } finally { this.writing = false; }
  }
}
