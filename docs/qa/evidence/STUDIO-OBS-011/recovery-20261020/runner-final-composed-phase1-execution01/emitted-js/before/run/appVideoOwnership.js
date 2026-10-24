import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync, mkdirSync, readSync, writeSync, fsyncSync, linkSync, unlinkSync, existsSync, createReadStream } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { parseWireJson } from '../guided/json.js';
import { evidenceFor, hasWebmHeader } from './recording.js';
const PRIVATE = 'runner-private', RECEIPT = 'app-video-owner.json', MAX_BYTES = 4096;
const KEYS = ['schemaVersion', 'kind', 'runId', 'attemptId', 'admissionId', 'runnerInstanceId', 'parentPid', 'childPid', 'scratchDev', 'scratchIno', 'videoBasename'].sort().join(',');
function refuse() { throw new Error('RECORDING_FAILED'); }
function noLink(path) { const stat = lstatSync(path, { bigint: true }); if (stat.isSymbolicLink())
    refuse(); return stat; }
function pinDirectory(path, mode) { const stat = noLink(path); if (!stat.isDirectory() || mode !== undefined && (stat.mode & 511n) !== mode)
    refuse(); return { path: realpathSync(path), dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode }; }
function sameDirectory(pin) { const now = pinDirectory(pin.path); if (now.dev !== pin.dev || now.ino !== pin.ino || now.uid !== pin.uid || now.mode !== pin.mode)
    refuse(); }
function registryAt(scratchPath) { const scratch = pinDirectory(scratchPath), privateDirectory = pinDirectory(join(scratch.path, PRIVATE), 448n), video = pinDirectory(join(scratch.path, 'video'), 448n); if (privateDirectory.uid !== scratch.uid || video.uid !== scratch.uid)
    refuse(); return { scratch, private: privateDirectory, video }; }
function checkRegistry(registry) { sameDirectory(registry.scratch); sameDirectory(registry.private); sameDirectory(registry.video); if (registry.private.path !== join(registry.scratch.path, PRIVATE) || registry.video.path !== join(registry.scratch.path, 'video'))
    refuse(); }
/** Parent-only, before spawn: exclusive registry freshness, no reusable stale receipt. */
export function createAppVideoRegistry(scratchPath) {
    const root = pinDirectory(scratchPath);
    mkdirSync(join(root.path, PRIVATE), { mode: 0o700 });
    if (!existsSync(join(root.path, 'video')))
        mkdirSync(join(root.path, 'video'), { mode: 0o700 });
    return registryAt(root.path);
}
function safeBasename(value) { return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 255 && /^[A-Za-z0-9@_-][A-Za-z0-9@_.-]*\.webm$/u.test(value) && !value.includes('..'); }
export function validateAppVideoPath(scratchPath, path) {
    const root = pinDirectory(scratchPath), video = pinDirectory(join(root.path, 'video'));
    const name = basename(path);
    if (!safeBasename(name) || realpathSync(dirname(path)) !== video.path || resolve(path) !== join(dirname(path), name))
        refuse();
    const candidate = join(video.path, name);
    try {
        const file = noLink(candidate);
        if (!file.isFile() || file.nlink !== 1n || file.uid !== root.uid)
            refuse();
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
    return candidate;
}
function closedOwner(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).sort().join(',') !== KEYS)
        refuse();
    const v = value, uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
    if (v.schemaVersion !== 1 || v.kind !== 'observed-app-video' || ![v.runId, v.attemptId, v.admissionId].every(id => typeof id === 'string' && uuid.test(id)) || typeof v.runnerInstanceId !== 'string' || v.runnerInstanceId.length < 1 || v.runnerInstanceId.length > 256 || ![v.parentPid, v.childPid].every(pid => typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0 && pid <= 2147483647) || ![v.scratchDev, v.scratchIno].every(n => typeof n === 'string' && /^(?:0|[1-9][0-9]{0,30})$/u.test(n)) || !safeBasename(v.videoBasename))
        refuse();
    return v;
}
function expectedOwner(launch, registry, name, pids) { return closedOwner({ schemaVersion: 1, kind: 'observed-app-video', runId: launch.runId, attemptId: launch.attemptId, admissionId: launch.admission.admissionId, runnerInstanceId: launch.admission.request.runnerInstanceId, parentPid: pids.ppid, childPid: pids.pid, scratchDev: String(registry.scratch.dev), scratchIno: String(registry.scratch.ino), videoBasename: name }); }
/** Child-only synchronous bounded publication: no timed-out async writer can recreate scratch. */
export function publishAppVideoOwner(launch, path, live, pids = { pid: process.pid, ppid: process.ppid }) {
    live();
    const registry = registryAt(launch.scratchPath);
    checkRegistry(registry);
    const native = validateAppVideoPath(launch.scratchPath, path), owner = expectedOwner(launch, registry, basename(native), pids), bytes = Buffer.from(JSON.stringify(owner), 'utf8');
    if (bytes.length > MAX_BYTES)
        refuse();
    const temporary = join(registry.private.path, 'app-video-owner.tmp'), target = join(registry.private.path, RECEIPT);
    let fd, created = false;
    try {
        fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
        if (writeSync(fd, bytes) !== bytes.length)
            refuse();
        fsyncSync(fd);
        closeSync(fd);
        fd = undefined;
        live();
        checkRegistry(registry);
        linkSync(temporary, target);
        unlinkSync(temporary);
        created = false;
        const directory = openSync(registry.private.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            fsyncSync(directory);
        }
        finally {
            closeSync(directory);
        }
        live();
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
        if (created)
            unlinkSync(temporary);
    }
}
function readReceipt(registry) {
    checkRegistry(registry);
    const fd = openSync(join(registry.private.path, RECEIPT), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const stat = fstatSync(fd, { bigint: true });
        if (!stat.isFile() || stat.nlink !== 1n || stat.uid !== registry.private.uid || (stat.mode & 511n) !== 384n || stat.size > BigInt(MAX_BYTES))
            refuse();
        const bytes = Buffer.alloc(MAX_BYTES + 1);
        const count = readSync(fd, bytes, 0, bytes.length, 0);
        if (count > MAX_BYTES || BigInt(count) !== stat.size)
            refuse();
        const content = bytes.subarray(0, count).toString('utf8'), owner = closedOwner(parseWireJson(bytes.subarray(0, count)));
        return { owner, pin: { dev: stat.dev, ino: stat.ino, uid: stat.uid, content } };
    }
    finally {
        closeSync(fd);
    }
}
/** One immutable cut before stop/kill. Absence at that cut cannot be repaired by late writes. */
export function sealAppVideoOwner(registry, launch, childPid, parentPid = process.pid) {
    try {
        checkRegistry(registry);
        try {
            lstatSync(join(registry.private.path, RECEIPT));
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return { kind: 'absent' };
            throw error;
        }
        if (childPid === null)
            refuse();
        const { owner, pin } = readReceipt(registry), expected = expectedOwner(launch, registry, owner.videoBasename, { pid: childPid, ppid: parentPid });
        if (JSON.stringify(owner) !== JSON.stringify(expected)) {
            // Parse key ordering is immaterial; every closed scalar must match retained launch identity.
            if (Object.keys(expected).some(k => owner[k] !== expected[k]))
                refuse();
        }
        return { kind: 'owned', owner: Object.freeze(owner), receipt: pin, registry, path: join(registry.video.path, owner.videoBasename) };
    }
    catch {
        return { kind: 'invalid' };
    }
}
function stableReceipt(snapshot) { const current = readReceipt(snapshot.registry); if (current.pin.dev !== snapshot.receipt.dev || current.pin.ino !== snapshot.receipt.ino || current.pin.uid !== snapshot.receipt.uid || current.pin.content !== snapshot.receipt.content)
    refuse(); }
/** Four-byte inspection only, after the parent has proved writer/process-tree quiescence. */
export function observeOwnedAppRecording(snapshot, reportedPath, orderlyClose, quiescent) {
    if (snapshot.kind === 'absent')
        return { path: null, bytes: null, error: null, state: 'UNAVAILABLE', partial: false };
    if (snapshot.kind === 'invalid' || !quiescent)
        return { path: null, bytes: null, error: 'RECORDING_FAILED', state: 'FAILED', partial: false };
    let fd;
    try {
        stableReceipt(snapshot);
        if (reportedPath !== undefined && reportedPath !== null && validateAppVideoPath(snapshot.registry.scratch.path, reportedPath) !== snapshot.path)
            refuse();
        const path = validateAppVideoPath(snapshot.registry.scratch.path, snapshot.path);
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = fstatSync(fd, { bigint: true });
        if (!stat.isFile() || stat.nlink !== 1n || stat.uid !== snapshot.registry.scratch.uid || stat.size > BigInt(Number.MAX_SAFE_INTEGER))
            refuse();
        const bytes = Number(stat.size), head = Buffer.alloc(4);
        readSync(fd, head, 0, 4, 0);
        const evidence = evidenceFor({ attempted: true, path, bytes, header: hasWebmHeader(head), error: null, orderlyClose });
        const verifiedFile = { bytes, open() { stableReceipt(snapshot); const current = validateAppVideoPath(snapshot.registry.scratch.path, path), opened = openSync(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); try {
                const now = fstatSync(opened, { bigint: true });
                if (!now.isFile() || now.nlink !== 1n || now.dev !== stat.dev || now.ino !== stat.ino || now.size !== stat.size || now.mtimeNs !== stat.mtimeNs)
                    refuse();
                return createReadStream(path, { fd: opened, autoClose: true });
            }
            catch (error) {
                closeSync(opened);
                throw error;
            } } };
        return { ...evidence, ...(evidence.state === 'PENDING' ? { verifiedFile } : {}) };
    }
    catch {
        return { path: null, bytes: null, error: 'RECORDING_FAILED', state: 'FAILED', partial: false };
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
//# sourceMappingURL=appVideoOwnership.js.map