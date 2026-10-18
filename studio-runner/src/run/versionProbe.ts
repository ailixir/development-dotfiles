/**
 * The trusted `chrome://version/` read behind the profile-confinement probe (STUDIO-OBS-015 REL-001).
 *
 * The page fills `#profile_path` and `#executable_path` asynchronously, so both elements exist and are
 * empty when `load` fires until the browser's reply lands. Reading them straight after `goto` raced that
 * reply and failed the launch (`PROFILE_PREFERENCES_REQUIRED`) whenever the browser was slow. This waits,
 * for at most {@link VERSION_FIELDS_TIMEOUT_MS}, until both fields hold text, and only then reads them. It
 * relaxes no check: the caller still compares the values exactly, and a page that never fills them fails
 * the launch when the wait times out.
 *
 * Playwright-free on purpose: only the slice of `Page` and `Locator` used here is named, so the unit tier
 * can drive it with a fake page (AC-25 keeps `browser.ts` itself out of that tier).
 */
export interface VersionProbeLocator {
  filter(options: { hasText: RegExp }): VersionProbeLocator;
  waitFor(options: { state: 'attached'; timeout: number }): Promise<void>;
  textContent(): Promise<string | null>;
}
export interface VersionProbePage {
  locator(selector: string): VersionProbeLocator;
}
export interface VersionPaths {
  readonly profilePath: string | undefined;
  readonly executablePath: string | undefined;
}

/**
 * Per field. A cold launch took 0.9 s to draw its UI where the others took 0.2 s, so this is several
 * times the worst lag seen, and it stays well inside the backend's 15 s context-push deadline: a wait
 * that outlived that deadline would keep the single worker slot busy after the backend gave up.
 */
export const VERSION_FIELDS_TIMEOUT_MS = 5_000;

const PROFILE_PATH = '#profile_path';
const EXECUTABLE_PATH = '#executable_path';

export async function readVersionPaths(page: VersionProbePage): Promise<VersionPaths> {
  for (const selector of [PROFILE_PATH, EXECUTABLE_PATH]) await page.locator(selector).filter({ hasText: /\S/u }).waitFor({ state: 'attached', timeout: VERSION_FIELDS_TIMEOUT_MS });
  const profile = await page.locator(PROFILE_PATH).textContent();
  const executable = await page.locator(EXECUTABLE_PATH).textContent();
  return { profilePath: profile?.trim(), executablePath: executable?.trim() };
}
