/**
 * Per field. A cold launch took 0.9 s to draw its UI where the others took 0.2 s, so this is several
 * times the worst lag seen, and it stays well inside the backend's 15 s context-push deadline: a wait
 * that outlived that deadline would keep the single worker slot busy after the backend gave up.
 */
export const VERSION_FIELDS_TIMEOUT_MS = 5_000;
const PROFILE_PATH = '#profile_path';
const EXECUTABLE_PATH = '#executable_path';
export async function readVersionPaths(page) {
    for (const selector of [PROFILE_PATH, EXECUTABLE_PATH])
        await page.locator(selector).filter({ hasText: /\S/u }).waitFor({ state: 'attached', timeout: VERSION_FIELDS_TIMEOUT_MS });
    const profile = await page.locator(PROFILE_PATH).textContent();
    const executable = await page.locator(EXECUTABLE_PATH).textContent();
    return { profilePath: profile?.trim(), executablePath: executable?.trim() };
}
//# sourceMappingURL=versionProbe.js.map