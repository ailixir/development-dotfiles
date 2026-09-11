/**
 * Claims this surface may never make (story 10.10, AC-9).
 *
 * Architecture §4.1: static validation *"cannot prove the locator matches the application or the
 * assertion captures the user's intent"*; §4.5: *"This restriction limits executable
 * capabilities, not semantic mistakes"*; ADR-002 §16.9 item 6 binds it on this story by name. The
 * realized risk BRD §8 records is *"Users treat AI-generated code confirmation as a rubber
 * stamp"*, owned by Product — so the phrases below are seeded from the risk's own language and
 * from the epic's, not from the component's copy. A list written by the author of the copy
 * contains the phrases they already thought not to use.
 *
 * **This is a floor, not a proof.** It catches "verified" and misses "looks right". AC-9 says so.
 * The assertion runs against **rendered text**, never against the component source or the JSX:
 * an assertion that greps source text is the shape this epic has already been bitten by.
 */
export const FORBIDDEN_CLAIM_PATTERNS: readonly RegExp[] = [
  /\bverified\b/i,
  /\bverifies\b/i,
  /\bcorrect\b/i,
  /\bcorrectly\b/i,
  /\bguaranteed?\b/i,
  /\bwill pass\b/i,
  /\bconfirmed working\b/i,
  /\bknown good\b/i,
  /\brubber[- ]stamp\b/i,
  /\btested\b/i,
  /\bproven\b/i,
  /\bvalidated to do\b/i,
  /\bdoes what you meant\b/i,
];

/** Returns the patterns that matched, so a failure names the phrase rather than just failing. */
export function forbiddenClaimsIn(text: string): string[] {
  return FORBIDDEN_CLAIM_PATTERNS.filter((pattern) => pattern.test(text)).map((p) => p.source);
}
