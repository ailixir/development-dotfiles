/** Private guided-video scratch ownership. Only definite dead owners are reaped, before listen.
 * No session IDs, content, paths or exception strings are logged. SIGKILL performs no cleanup:
 * its next same-scope worker may reclaim verified residue. Profiles/journals are never swept. */
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, opendir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
export const RECORDING_SCRATCH_LIMITS = Object.freeze({ candidates: 128, metadataBytes: 32 * 1024, entries: 512, depth: 4, deadlineMs: 5000, reclaimed: 16 });
const hash = (text) => createHash('sha256').update(text).digest('hex');
const nonce = () => randomBytes(24).toString('hex');
const HEX = /^[a-f0-9]{48}$/u;
const unavailable = () => new Error('RECORDING_SCRATCH_UNAVAILABLE');
class Bound extends Error {
}
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
function live(pid) {
    try {
        process.kill(pid, 0);
        return 'live';
    }
    catch (error) {
        return error.code === 'ESRCH' ? 'dead' : 'unknown';
    }
}
export async function prepareRecordingScratch(options) {
    const uid = process.getuid?.();
    if (uid === undefined)
        throw unavailable();
    const limits = { ...RECORDING_SCRATCH_LIMITS, ...options.limits };
    for (const [key, value] of Object.entries(limits))
        if (!Number.isSafeInteger(value) || value < 1 || value > RECORDING_SCRATCH_LIMITS[key])
            throw unavailable();
    const now = options.now ?? (() => performance.now()), end = now() + limits.deadlineMs;
    const check = () => { if (now() >= end)
        throw new Bound(); };
    const privateDirectory = async (path) => {
        const s = await lstat(path);
        if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== uid || (s.mode & 0o077) !== 0)
            throw unavailable();
        return s;
    };
    // The trusted parent may itself be a platform tmp alias (/var -> /private/var on macOS).
    // Canonicalize it once; all managed children are checked without following links.
    const parent = await realpath(options.evidenceRoot ?? process.env.TMPDIR ?? tmpdir());
    await mkdir(options.journalDirectory, { recursive: true, mode: 0o700 });
    const journal = await realpath(options.journalDirectory);
    const scope = hash(JSON.stringify([options.workerId, journal]));
    const root = join(parent, '.checks-guided-recordings');
    const ensure = async (path) => {
        await mkdir(path, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST')
            throw unavailable(); });
        return privateDirectory(path);
    };
    const rootStat = await ensure(root), namespacePath = join(root, scope), scopeStat = await ensure(namespacePath);
    const scopeFd = await open(namespacePath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!same(scopeStat, await scopeFd.stat())) {
        await scopeFd.close();
        throw unavailable();
    }
    // Linux supports descriptor-relative traversal through /proc/self/fd. macOS uses checked
    // private paths with O_NOFOLLOW handles and inode fences. This is not a sandbox against a
    // malicious unsandboxed process sharing the trusted runner UID (portability ruling).
    // deadlineMs is a cooperative elapsed-work budget between native filesystem calls.
    const descriptorPaths = process.platform === 'linux';
    if (!descriptorPaths)
        await scopeFd.close();
    const namespace = descriptorPaths ? `/proc/self/fd/${String(scopeFd.fd)}` : namespacePath;
    const fence = async () => {
        if (!same(rootStat, await privateDirectory(root)) || !same(scopeStat, await privateDirectory(namespacePath)))
            throw unavailable();
    };
    const marker = async (directory, expectedNonce) => {
        try {
            const owner = await privateDirectory(directory);
            const parentFd = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
            try {
                if (!same(owner, await parentFd.stat()))
                    return null;
                const path = descriptorPaths ? `/proc/self/fd/${String(parentFd.fd)}/owner.json` : join(directory, 'owner.json');
                const stat = await lstat(path);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077) !== 0 || stat.nlink !== 1 || stat.size > limits.metadataBytes)
                    return null;
                const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
                try {
                    if (!same(stat, await fd.stat()))
                        return null;
                    const bytes = Buffer.alloc(limits.metadataBytes + 1), { bytesRead } = await fd.read(bytes, 0, bytes.length, 0);
                    if (bytesRead > limits.metadataBytes)
                        return null;
                    const body = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
                    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'nonce,pid,scope,version')
                        return null;
                    const m = body;
                    if (m.version !== 1 || !Number.isSafeInteger(m.pid) || m.pid <= 0 || m.nonce !== expectedNonce || m.scope !== scope || !HEX.test(m.nonce))
                        return null;
                    return { body: m, stat, owner };
                }
                finally {
                    await fd.close();
                }
            }
            finally {
                await parentFd.close();
            }
        }
        catch {
            return null;
        }
    };
    // Collect bounded no-follow deletion operations first; a depth/entry bound never authorizes a
    // partial deletion. Every inode is rechecked before unlink/rmdir. Links are only unlinked.
    const removeTree = async (directory, deadline) => {
        const nodes = [];
        let count = 0;
        const handles = [];
        const walk = async (path, depth) => {
            if (deadline)
                check();
            if (++count > limits.entries || depth > limits.depth)
                throw new Bound();
            const stat = await lstat(path);
            if (stat.uid !== uid)
                throw unavailable();
            if (stat.isDirectory() && !stat.isSymbolicLink()) {
                if ((stat.mode & 0o077) !== 0)
                    throw unavailable();
                const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
                handles.push(fd);
                if (!same(stat, await fd.stat()))
                    throw unavailable();
                const anchored = descriptorPaths ? `/proc/self/fd/${String(fd.fd)}` : path, entries = await opendir(anchored);
                if (!same(stat, await lstat(path)) || !same(stat, await fd.stat())) {
                    await entries.close();
                    throw unavailable();
                }
                for await (const entry of entries)
                    await walk(join(anchored, entry.name), depth + 1);
            }
            nodes.push({ path, stat, ownerMarker: depth === 1 && basename(path) === 'owner.json' });
        };
        try {
            await walk(directory, 0);
            const markerIndex = nodes.findIndex(node => node.ownerMarker);
            if (markerIndex >= 0) {
                const [owner] = nodes.splice(markerIndex, 1);
                if (owner)
                    nodes.splice(nodes.length - 1, 0, owner);
            }
            let ownerRemoved = false;
            for (const node of nodes) {
                if (deadline && !ownerRemoved)
                    check();
                await fence();
                if (!same(node.stat, await lstat(node.path)))
                    throw unavailable();
                if (node.stat.isDirectory() && !node.stat.isSymbolicLink())
                    await rmdir(node.path);
                else
                    await (options.removeFile ?? unlink)(node.path);
                if (node.ownerMarker)
                    ownerRemoved = true;
            }
        }
        finally {
            await Promise.all(handles.map(fd => fd.close()));
        }
    };
    try {
        const report = { inspected: 0, reclaimed: 0, skipped: 0, bounded: false };
        try {
            const entries = await opendir(namespace);
            for await (const entry of entries) {
                check();
                if (report.inspected >= limits.candidates || report.reclaimed >= limits.reclaimed) {
                    report.bounded = true;
                    break;
                }
                report.inspected++;
                const match = /^inc-([a-f0-9]{48})(?:-q-([1-9][0-9]{0,15})-([a-f0-9]{48}))?$/u.exec(entry.name);
                if (!match?.[1]) {
                    report.skipped++;
                    continue;
                }
                // The old owner remains deletion authority. A quarantine additionally fences its active
                // reaper; another cooperating worker must not steal in-progress cleanup. PID reuse skips.
                if (match[2] && (!Number.isSafeInteger(Number(match[2])) || (options.probe ?? live)(Number(match[2])) !== 'dead')) {
                    report.skipped++;
                    continue;
                }
                const candidate = join(namespace, entry.name), prior = await marker(candidate, match[1]);
                if (!prior || (options.probe ?? live)(prior.body.pid) !== 'dead') {
                    report.skipped++;
                    continue;
                }
                await fence();
                check();
                const quarantine = join(namespace, `inc-${prior.body.nonce}-q-${String(process.pid)}-${nonce()}`);
                try {
                    await rename(candidate, quarantine);
                }
                catch (error) {
                    if (error.code === 'ENOENT') {
                        report.skipped++;
                        continue;
                    }
                    throw unavailable();
                }
                await options.afterQuarantine?.();
                const after = await marker(quarantine, prior.body.nonce);
                if (!after || !same(after.owner, prior.owner) || !same(after.stat, prior.stat) || JSON.stringify(after.body) !== JSON.stringify(prior.body))
                    throw unavailable();
                try {
                    await removeTree(quarantine, true);
                }
                catch (error) {
                    if (error instanceof Bound)
                        await rename(quarantine, candidate).catch(() => { throw unavailable(); });
                    throw error;
                }
                report.reclaimed++;
            }
        }
        catch (error) {
            if (error instanceof Bound)
                report.bounded = true;
            else
                throw unavailable();
        }
        await fence();
        const incarnationNonce = nonce(), incarnation = join(namespace, `inc-${incarnationNonce}`), publicIncarnation = join(namespacePath, `inc-${incarnationNonce}`);
        await mkdir(incarnation, { mode: 0o700 });
        const ownerStat = await privateDirectory(incarnation);
        const file = await open(join(incarnation, 'owner.json'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try {
            await file.writeFile(JSON.stringify({ version: 1, pid: process.pid, nonce: incarnationNonce, scope }));
            await file.sync();
        }
        finally {
            await file.close();
        }
        const allocations = new Map();
        return {
            report: Object.freeze(report),
            close: () => descriptorPaths ? scopeFd.close() : Promise.resolve(),
            async allocate() {
                await fence();
                if (!same(ownerStat, await privateDirectory(incarnation)))
                    throw unavailable();
                const anchored = await mkdtemp(join(incarnation, 'checks-recording-')), directory = join(publicIncarnation, basename(anchored));
                allocations.set(directory, anchored);
                return directory;
            },
            async dispose(directory) {
                if (!allocations.has(directory) || dirname(resolve(directory)) !== publicIncarnation || !basename(directory).startsWith('checks-recording-'))
                    throw unavailable();
                await fence();
                if (!same(ownerStat, await privateDirectory(incarnation)))
                    throw unavailable();
                // A leaf substituted by a symlink is unlinked, never followed.
                const anchored = allocations.get(directory);
                if (!anchored)
                    throw unavailable();
                await removeTree(anchored, false);
                allocations.delete(directory);
            },
        };
    }
    catch (error) {
        if (descriptorPaths)
            await scopeFd.close();
        throw error;
    }
}
//# sourceMappingURL=recordingScratch.js.map