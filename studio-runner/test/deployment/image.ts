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
  /** Every `Config.Env` NAME the image declares (values are never needed and never returned). */
  readonly envNames: readonly string[];
  /** `Config.Cmd` as the image stores it. `null` when the image declares none. */
  readonly cmd: readonly string[] | null;
  /** `Config.Entrypoint`. The A6 CMD is asserted together with "no ENTRYPOINT wrapper". */
  readonly entrypoint: readonly string[] | null;
}

let cached: ImageFacts | null | undefined;

/**
 * Why the image cannot be used, or `null` when it can.
 *
 * **Absence is a FAILURE, never a skip.** QA pointed `STUDIO_RUNNER_IMAGE` at a tag that does not
 * exist and the SEC-2 file reported *1 passed / 3 skipped, in 1 ms*, **green** — with the attack
 * @po named this story's weakest criterion silently not run. The reason is returned rather than a
 * boolean so the failure message says which of the two things is missing: `docker` itself, or the
 * image stage 7 was supposed to build and pass in.
 */
export function imageUnavailableReason(): string | null {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe' });
  } catch {
    return (
      '`docker` is not available. SEC-2 (AC-4a part 3) is @qa\'s shim attack RUN against the built ' +
      'image in both directions; without a container runtime it is not run at all, and a control ' +
      'whose removal changes nothing observable is not a control.'
    );
  }
  try {
    execFileSync('docker', ['image', 'inspect', RUNNER_IMAGE], { stdio: 'pipe' });
  } catch {
    return (
      `the image \`${RUNNER_IMAGE}\` does not exist locally. Build it first (\`ci/stages.md\` stage 7, ` +
      '`docker build -t <tag> studio-runner/`) and pass the tag as `STUDIO_RUNNER_IMAGE`. This is a ' +
      'failure and not a skip: a wrong tag used to make this file green in one millisecond.'
    );
  }
  return null;
}

/** Throws unless `docker` and the image are both present. */
export function requireImage(): void {
  const reason = imageUnavailableReason();
  if (reason !== null) throw new Error(`deployment tier prerequisite missing: ${reason}`);
}

/**
 * Reads the image's own environment, from the image, once.
 *
 * `docker image inspect` rather than `docker run`: the values are a property of the image
 * configuration and reading them must not depend on the container starting — which is a separate
 * fact, and one AC-5a asserts on its own terms.
 */
export function imageFacts(): ImageFacts {
  requireImage();
  if (cached !== undefined && cached !== null) return cached;
  const raw = execFileSync(
    'docker',
    ['image', 'inspect', '--format', '{{json .Config}}', RUNNER_IMAGE],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const config = JSON.parse(raw) as {
    Env?: string[];
    User?: string;
    Cmd?: string[] | null;
    Entrypoint?: string[] | null;
  };
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
  cached = {
    browsersPath,
    home,
    user: config.User ?? '',
    envNames: [...environment.keys()],
    cmd: config.Cmd ?? null,
    entrypoint: config.Entrypoint ?? null,
  };
  return cached;
}
