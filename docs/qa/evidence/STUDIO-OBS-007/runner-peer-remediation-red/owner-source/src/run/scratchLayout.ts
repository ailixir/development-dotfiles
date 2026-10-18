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
} as const;

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BROWSER_PREFERENCES = Object.freeze({
  credentials_enable_service: false,
  profile: { password_manager_enabled: false },
  autofill: { profile_enabled: false, credit_card_enabled: false },
  session: { restore_on_startup: 5 },
});
export function prepareBrowserProfile(scratchPath: string): string {
  const profile = join(scratchPath, SCRATCH_SUBDIRECTORIES.profile);
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  writeFileSync(join(profile, 'Preferences'), JSON.stringify(BROWSER_PREFERENCES), { mode: 0o600 });
  return profile;
}
export function requireBrowserPreferences(profile: string): void {
  try {
    const preferences = JSON.parse(readFileSync(join(profile, 'Preferences'), 'utf8')) as { credentials_enable_service: unknown; profile: {password_manager_enabled: unknown}; autofill: {profile_enabled: unknown;credit_card_enabled: unknown}; session: {restore_on_startup: unknown} };
    if (preferences.credentials_enable_service !== false || preferences.profile.password_manager_enabled !== false || preferences.autofill.profile_enabled !== false || preferences.autofill.credit_card_enabled !== false || preferences.session.restore_on_startup !== 5) throw new Error();
  } catch { throw new Error('PROFILE_PREFERENCES_REQUIRED'); }
}
