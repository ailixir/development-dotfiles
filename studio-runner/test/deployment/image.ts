/**
 * Facts read **out of the built image**, for the criteria that must not compare against a literal.
 *
 * AC-4a part 2 says the rendered mount paths are asserted disjoint from the image's browser
 * registry path and from the image's `HOME` *"by comparison against the values read out of the
 * built image rather than against hardcoded strings"*. A test that hardcodes `/ms-playwright`
 * asserts nothing about the image it will actually deploy: the base image is `ED-05`'s to replace,
 * and a replacement that moves the registry would leave that test green and the control gone.
 */
import { execFileSync } from 'node:child_process';

/** The image under test. CI passes the tag it just built (`ci/stages.md` stage 7). */
export const RUNNER_IMAGE = process.env.STUDIO_RUNNER_IMAGE ?? 'put-checks-studio-runner:10.18a-local';

export interface ImageFacts {
  /** Where the image tells Playwright its browsers live (ADR-001 §4.2). */
  readonly browsersPath: string;
  /** The image's `HOME`, which `studio-runner/Dockerfile` sets to `/home/pwuser`. */
  readonly home: string;
  /** The user the image runs as. */
  readonly user: string;
}

let cached: ImageFacts | null | undefined;

export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', RUNNER_IMAGE], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the image's own environment, from the image, once.
 *
 * `docker image inspect` rather than `docker run`: the values are a property of the image
 * configuration and reading them must not depend on the container starting — which is a separate
 * fact, and one AC-5a asserts on its own terms.
 */
export function imageFacts(): ImageFacts {
  if (cached !== undefined && cached !== null) return cached;
  const raw = execFileSync(
    'docker',
    ['image', 'inspect', '--format', '{{json .Config}}', RUNNER_IMAGE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const config = JSON.parse(raw) as { Env?: string[]; User?: string };
  const environment = new Map(
    (config.Env ?? []).map((entry) => {
      const index = entry.indexOf('=');
      return [entry.slice(0, index), entry.slice(index + 1)] as const;
    }),
  );
  const browsersPath = environment.get('PLAYWRIGHT_BROWSERS_PATH');
  const home = environment.get('HOME');
  if (browsersPath === undefined || browsersPath === '') {
    throw new Error(
      'the image declares no PLAYWRIGHT_BROWSERS_PATH; ADR-001 §4.2 makes it the mechanism by ' +
        'which the image tells the library where its browsers are, so its absence is a finding',
    );
  }
  if (home === undefined || home === '') {
    throw new Error('the image declares no HOME; the runner Dockerfile sets it and must keep it');
  }
  cached = { browsersPath, home, user: config.User ?? '' };
  return cached;
}
