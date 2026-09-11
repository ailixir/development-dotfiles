/**
 * Types for `scripts/check-pins.mjs`, following the `eslint.boundary-rules.d.ts` precedent:
 * build-time scripts stay plain ESM so they run with bare `node`, and their contract is declared
 * here so the type-checked tests can import them.
 */

export interface PinCopies {
  readonly declared: string | null;
  readonly locked: string | null;
  readonly image: string | null;
  readonly recorded: string | null;
  readonly declaredTypescript: string | null;
  readonly engines: string | null;
  readonly nvmrc: string | null;
  readonly runtime: Record<string, unknown> | null;
  readonly runtimePresent: boolean;
}

export interface PinCheckResult {
  readonly ok: boolean;
  /** One entry per disagreement; each names the disagreeing copies and their values. */
  readonly failures: string[];
  /** Copies that could not be asserted here (image-only values, or a missing build). */
  readonly notAsserted: string[];
  readonly pins: PinCopies;
}

export declare function collectPins(root: string): PinCopies;
export declare function engineFloorMajor(range: unknown): string | null;
export declare function checkPins(
  root: string,
  options?: { requireImage?: boolean },
): PinCheckResult;
/** Runs the CLI and returns the exit code (0 = every asserted copy agrees). */
export declare function runCli(argv: readonly string[]): number;
