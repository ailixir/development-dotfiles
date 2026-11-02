/**
 * The observation read profile: what a page's observation may expose, the same for every test.
 *
 * Structural discovery is on (the observation lists roles, names and locator hints). Visible text
 * is readable in the application region of every whitelisted domain, and nothing else is: no field
 * value is readable, so a typed or pre-filled input never reaches an observation.
 *
 * Learning (`guided/runtime.ts`) and replay (`observedReplayAdapter.ts`) take their profile from
 * here and from nowhere else: one grant per whitelist entry, matched on the page's hostname. A
 * learned read recipe names the grant that let it read, and replay accepts the recipe only under
 * the same grant id, so the ids must be a pure function of the entry. They are: the same entry
 * gives the same id in every session, run and process, and a list that no longer holds the entry
 * has no such grant, so the read is refused (`READ_REFUSED`).
 *
 * Under allow-all (`STUDIO_RUNNER_ALLOW_ALL_DOMAINS`, the list is `ALL_DOMAINS` = `['*']`) there is no
 * entry to key a grant by, so the profile carries ONE grant for the entry `*`, and the collector
 * matches it against the host of the page it is on at observation time (`hostIn` treats `*` as every
 * host). Its id is `readGrantId('*')`, still a pure function of the entry, so learning and replay
 * agree; a read recipe learned under one list is refused under allow-all and the other way round,
 * exactly as it is when a list loses the entry. Which page a read came from is still pinned by the
 * step's origin guard, not by the grant.
 */
import { createHash } from 'node:crypto';
const STRUCTURE_RULE_ID = 'observed-structure-v1';
/** Stable id of the read grant for a whitelist `entry` (at most 256 characters, as the collector requires). */
export function readGrantId(entry) {
    return `observed-read-v1-${createHash('sha256').update(entry, 'utf8').digest('hex')}`;
}
export function observationReadProfile(allowedDomains) {
    return {
        policyRuleId: STRUCTURE_RULE_ID,
        allowStructuralDiscovery: true,
        readGrants: allowedDomains.map((domain) => ({
            policyRuleId: readGrantId(domain),
            domain,
            region: { kind: 'application' },
            visibleText: { classification: 'permittedBusinessData' },
        })),
    };
}
//# sourceMappingURL=observationReadProfile.js.map