/** Types for `evaluation/fixture-server.mjs` (see `report.d.mts` for the precedent). */

export declare const FIXTURE_VERSION: string;
export interface FixtureServer {
  readonly fixtureVersion: string;
  /** Loopback origin of the synthetic target the generated test may visit. */
  readonly targetOrigin: string;
  /** Separately authenticated reset/snapshot interface; never given to the model. */
  readonly controlUrl: string;
  close(): Promise<void>;
}
export declare function startFixtureServer(options: {
  token: string;
  targetPort?: number;
  controlPort?: number;
}): Promise<FixtureServer>;
