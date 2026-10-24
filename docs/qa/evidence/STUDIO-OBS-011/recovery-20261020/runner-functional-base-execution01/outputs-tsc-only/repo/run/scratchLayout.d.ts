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
export declare const SCRATCH_SUBDIRECTORIES: {
    readonly profile: "browser-profile";
    readonly video: "video";
    readonly downloads: "downloads";
    readonly traces: "traces";
    readonly temp: "tmp";
};
export declare const BROWSER_PREFERENCES: Readonly<{
    credentials_enable_service: false;
    autofill: Readonly<{
        profile_enabled: false;
        credit_card_enabled: false;
    }>;
    session: Readonly<{
        restore_on_startup: 5;
    }>;
}>;
interface DirectoryPin {
    readonly path: string;
    readonly dev: number;
    readonly ino: number;
    readonly uid: number;
}
export interface BrowserProfileConfinement {
    readonly scratch: DirectoryPin;
    readonly profile: DirectoryPin;
    readonly defaultProfile: DirectoryPin;
}
/** The trusted parent calls this before capturing private video/scratch identities. */
export declare function secureScratchDirectory(path: string): string;
/** Only retained directory identities establish the expected effective Default path. */
export declare function browserProfileConfinement(profile: string): BrowserProfileConfinement;
export declare function releaseBrowserProfile(profile: string): void;
export declare function prepareBrowserProfile(scratchPath: string): string;
export declare function requireBrowserPreferences(profile: string): void;
export interface EffectiveBrowserPreferences {
    credentialsEnableService: unknown;
    autofillProfileEnabled: unknown;
    autofillCreditCardEnabled: unknown;
    restoreOnStartup: unknown;
}
export interface BrowserPreferenceEvidence {
    channel: 'chromium';
    browserVersion: string;
    activeProfilePath: string;
    executablePath: string;
    effective: EffectiveBrowserPreferences;
}
export declare function assertEffectiveBrowserPreferences(p: EffectiveBrowserPreferences): void;
export {};
