/**
 * Filesystem scratch store (AC-12, AC-21, architecture §9.3).
 *
 * Scratch is cleared **at startup and on every exit path**, including the drain and error paths.
 * Clearing at startup matters as much as clearing at exit: a pod that was killed mid-run leaves a
 * directory behind, and the next run in that pod must not inherit it.
 *
 * Nothing here ever receives a job value. Resolved variables and secrets live in memory for the
 * duration of the run and are wiped when it ends; they are not written to scratch, not placed in
 * a retry buffer and not queued in a report body (AC-21, architecture §9.2).
 */
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
/** Run ids reach this module from the server; keep them to a shape that cannot escape the root. */
const SAFE_RUN_ID = /^[A-Za-z0-9._-]+$/u;
export function createFsScratchStore(root) {
    const rootPath = resolve(root);
    return {
        async create(runId) {
            if (!SAFE_RUN_ID.test(runId)) {
                throw new Error('Scratch run id contains characters that are not permitted in a path.');
            }
            const path = join(rootPath, runId);
            await mkdir(path, { recursive: true });
            return {
                path,
                async clear() {
                    await rm(path, { recursive: true, force: true });
                },
            };
        },
        async clearAll() {
            await rm(rootPath, { recursive: true, force: true });
            await mkdir(rootPath, { recursive: true });
        },
        async list() {
            try {
                return await readdir(rootPath);
            }
            catch {
                return [];
            }
        },
    };
}
//# sourceMappingURL=scratch.js.map