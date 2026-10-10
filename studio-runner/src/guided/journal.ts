import { mkdir, open } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { hash, insist } from './contracts.js';

/** Append-only, data-free consumption records. Directory and record are fsynced before effects.
 * A partial write or damaged record poisons recovery; uncertainty never authorizes replay.
 */
export class GuidedJournal {
  private readonly consumed = new Set<string>();
  private poisoned = false;
  private writing = false;
  private written = '';
  private constructor(private readonly directory: string, private readonly path: string) {}
  static async open(directory: string, sessionId: string): Promise<GuidedJournal> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Persist any newly created directory entries as well as the eventual journal inode.
    for (let current = resolve(directory); ; current = dirname(current)) {
      const ancestor = await open(current, 'r'); try { await ancestor.sync(); } finally { await ancestor.close(); }
      if (current === dirname(current)) break;
    }
    const journal = new GuidedJournal(directory, join(directory, `${hash(sessionId)}.journal`));
    // Permanent creation marker is an exclusive cross-process reservation. It is never
    // removed at teardown: a lost worker cannot reconstitute its live DOM/value context.
    let owner;
    try { owner = await open(`${journal.path}.owner`, 'wx', 0o600); } catch { throw new Error('CONTEXT_LOST'); }
    try { await owner.sync(); } finally { await owner.close(); }
    const parent = await open(directory, 'r'); try { await parent.sync(); } finally { await parent.close(); }
    const file = await open(journal.path, 'wx', 0o600); try { await file.sync(); } finally { await file.close(); }
    const dir = await open(directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    return journal;
  }
  get recovered(): boolean { return this.poisoned || this.consumed.size > 0; }
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
      const dir = await open(this.directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    } catch { this.poisoned = true; throw new Error('JOURNAL_UNAVAILABLE'); } finally { this.writing = false; }
  }
}
