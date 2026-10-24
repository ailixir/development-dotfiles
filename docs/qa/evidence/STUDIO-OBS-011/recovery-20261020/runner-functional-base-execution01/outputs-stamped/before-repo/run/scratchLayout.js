/**
 * Where the browser is allowed to write (AC-22, architecture §9.3, ADR-001 §9).
 *
 * Everything Chromium produces — its profile/user-data directory, the recording, downloads,
 * traces and its temporary files — lives under one of these names inside the **per-run** scratch
 * directory, which is created after admission and cleared on success, step failure, launch
 * failure, error and drain. `readOnlyRootFilesystem: true` and a writable `/dev/shm` are honoured
 * by construction: nothing here writes anywhere else.
 *
 * Declared in its own module because both halves of the child boundary need it — the parent, to
 * point `TMPDIR` at the run's own temp directory before spawning, and `src/run/browser.ts`, to
 * place the profile and the recording — and the parent must not import the one module that
 * imports Playwright (AC-1).
 *
 * Resolved variables and secrets are never written to any of them (§9.2).
 */
export const SCRATCH_SUBDIRECTORIES = {
    profile: 'browser-profile',
    video: 'video',
    downloads: 'downloads',
    traces: 'traces',
    temp: 'tmp',
};
import { mkdirSync, openSync, closeSync, fstatSync, lstatSync, realpathSync, readSync, writeSync, fsyncSync, fchmodSync, constants, existsSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
export const BROWSER_PREFERENCES = Object.freeze({
    credentials_enable_service: false,
    autofill: Object.freeze({ profile_enabled: false, credit_card_enabled: false }),
    session: Object.freeze({ restore_on_startup: 5 }),
});
const preparedProfiles = new Map();
const MAX_PREFERENCE_BYTES = 65536;
function refused() { throw new Error('PROFILE_PREFERENCES_REQUIRED'); }
function owned(stat) { return typeof process.getuid === 'function' && stat.uid === process.getuid(); }
function directory(path) { const stat = lstatSync(path); if (!stat.isDirectory() || stat.isSymbolicLink() || !owned(stat) || (stat.mode & 0o777) !== 0o700)
    refused(); return { path: realpathSync(path), dev: stat.dev, ino: stat.ino, uid: stat.uid }; }
function sameDirectory(pin) { const actual = directory(pin.path); if (actual.dev !== pin.dev || actual.ino !== pin.ino || actual.uid !== pin.uid)
    refused(); }
/** The trusted parent calls this before capturing private video/scratch identities. */
export function secureScratchDirectory(path) {
    try {
        const before = lstatSync(path);
        if (!before.isDirectory() || before.isSymbolicLink() || !owned(before) || (before.mode & 0o022) !== 0)
            refused();
        const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try {
            const actual = fstatSync(fd);
            if (actual.dev !== before.dev || actual.ino !== before.ino)
                refused();
            if ((actual.mode & 0o777) !== 0o700) {
                if (existsSync(join(path, 'runner-private')))
                    refused();
                fchmodSync(fd, 0o700);
            }
        }
        finally {
            closeSync(fd);
        }
        const secured = directory(path);
        if (secured.dev !== before.dev || secured.ino !== before.ino)
            refused();
        return secured.path;
    }
    catch {
        refused();
    }
}
function profileKey(profile) { if (basename(profile) !== SCRATCH_SUBDIRECTORIES.profile)
    refused(); return join(directory(dirname(profile)).path, SCRATCH_SUBDIRECTORIES.profile); }
/** Only retained directory identities establish the expected effective Default path. */
export function browserProfileConfinement(profile) {
    try {
        const pin = preparedProfiles.get(profileKey(profile));
        if (!pin)
            refused();
        sameDirectory(pin.scratch);
        sameDirectory(pin.profile);
        sameDirectory(pin.defaultProfile);
        if (pin.profile.path !== join(pin.scratch.path, SCRATCH_SUBDIRECTORIES.profile) || pin.defaultProfile.path !== join(pin.profile.path, 'Default'))
            refused();
        return pin;
    }
    catch {
        refused();
    }
}
export function releaseBrowserProfile(profile) { let key = resolve(profile); try {
    key = profileKey(profile);
}
catch { /* Confirmed teardown may have removed the root already. */ } preparedProfiles.delete(key); }
function createDirectory(path) { try {
    mkdirSync(path, { mode: 0o700 });
}
catch (error) {
    if (error.code !== 'EEXIST')
        throw error;
} directory(path); }
export function prepareBrowserProfile(scratchPath) {
    let preparedKey;
    try {
        const scratch = secureScratchDirectory(scratchPath), profile = join(scratch, SCRATCH_SUBDIRECTORIES.profile);
        preparedKey = profile;
        if (preparedProfiles.has(profile)) {
            requireBrowserPreferences(profile);
            return profile;
        }
        createDirectory(profile);
        createDirectory(join(profile, 'Default'));
        const confinement = { scratch: directory(scratch), profile: directory(profile), defaultProfile: directory(join(profile, 'Default')) }, filePath = join(profile, 'Default', 'Preferences'), bytes = Buffer.from(JSON.stringify(BROWSER_PREFERENCES));
        const fd = openSync(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        let stat;
        try {
            if (writeSync(fd, bytes) !== bytes.length)
                refused();
            fsyncSync(fd);
            stat = fstatSync(fd);
        }
        finally {
            closeSync(fd);
        }
        sameDirectory(confinement.scratch);
        sameDirectory(confinement.profile);
        sameDirectory(confinement.defaultProfile);
        preparedProfiles.set(profile, { ...confinement, file: { dev: stat.dev, ino: stat.ino, uid: stat.uid } });
        requireBrowserPreferences(profile);
        return profile;
    }
    catch {
        if (preparedKey)
            preparedProfiles.delete(preparedKey);
        refused();
    }
}
export function requireBrowserPreferences(profile) {
    let fd;
    try {
        const confinement = browserProfileConfinement(profile), pin = preparedProfiles.get(confinement.profile.path);
        if (!pin)
            refused();
        const path = join(confinement.defaultProfile.path, 'Preferences'), before = lstatSync(path);
        if (before.isSymbolicLink() || !before.isFile() || !owned(before) || before.nlink !== 1 || (before.mode & 0o777) !== 0o600 || before.dev !== pin.file.dev || before.ino !== pin.file.ino || before.uid !== pin.file.uid || before.size > MAX_PREFERENCE_BYTES)
            refused();
        fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.nlink !== 1 || !owned(stat) || (stat.mode & 0o777) !== 0o600)
            refused();
        const buffer = Buffer.alloc(MAX_PREFERENCE_BYTES + 1), count = readSync(fd, buffer, 0, buffer.length, 0);
        if (count !== stat.size || count > MAX_PREFERENCE_BYTES)
            refused();
        const actual = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count)));
        if (JSON.stringify(actual) !== JSON.stringify(BROWSER_PREFERENCES))
            refused();
        browserProfileConfinement(profile);
        const after = lstatSync(path);
        if (after.dev !== stat.dev || after.ino !== stat.ino || after.nlink !== 1 || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.isSymbolicLink() || !owned(after) || (after.mode & 0o777) !== 0o600)
            refused();
    }
    catch {
        refused();
    }
    finally {
        if (fd !== undefined)
            closeSync(fd);
    }
}
export function assertEffectiveBrowserPreferences(p) {
    if (p.credentialsEnableService !== false || p.autofillProfileEnabled !== false || p.autofillCreditCardEnabled !== false || p.restoreOnStartup !== 5)
        throw new Error('PROFILE_PREFERENCES_REQUIRED');
}
//# sourceMappingURL=scratchLayout.js.map