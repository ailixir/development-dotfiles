/**
 * The navigation domain whitelist (STUDIO-FLEX-001): the only navigation control the runner has.
 *
 * It is per-environment deployment configuration (`STUDIO_RUNNER_ALLOWED_DOMAINS`), checked against
 * the runner's CURRENT list wherever an origin used to be compared with a per-test origin list:
 * author-directed navigation, observation, read grants, password fill and replay. An empty list
 * denies everything. Pages may use `http` or `https` on any port.
 *
 * The rules are identical to the backend's `AllowedDomains` and are pinned by the shared vectors in
 * `docs/specs/studio/allowed-domains-vectors.json`, which `test/allowedDomains.test.ts` runs in full.
 * An entry is one lowercase punycode host suffix. A host matches an entry when it equals it or ends
 * with `"." + entry`, on label boundaries only, so `evilciti.com` never matches `citi.com`.
 *
 * **Allow-all (`STUDIO_RUNNER_ALLOW_ALL_DOMAINS=true`).** A deployment option, ON by default for now (user decision 2026-10-25), that
 * lets navigation reach any host whose URL passes {@link hostOf} (an http(s) DNS name: still no
 * userinfo and no IP literal). The one list type every consumer already takes carries it as the
 * single-element list {@link ALL_DOMAINS}; `*` can never be a configured entry (the grammar refuses
 * wildcards), so it cannot arise from the list. Consumers never look inside the list: they call
 * {@link domainAllowed} / {@link entryForHost}, which are the only two places that decide, and the
 * in-page collector's `hostIn` mirrors the same rule for the read grants.
 */
import { domainToASCII } from 'node:url';

/** The most entries a list may have; the read profile carries one grant per entry. */
export const MAX_ALLOWED_DOMAINS = 32;

/** The environment key. Not a `GUIDED_*` key: replay needs the list too. */
export const ALLOWED_DOMAINS_ENV_KEY = 'STUDIO_RUNNER_ALLOWED_DOMAINS';

/** The environment key of the allow-all option. The chart renders it from the one value that also feeds the backend. */
export const ALLOW_ALL_DOMAINS_ENV_KEY = 'STUDIO_RUNNER_ALLOW_ALL_DOMAINS';

/** The list that means "every DNS-named http(s) host". Frozen; `*` is not a valid entry, so no configured list equals it. */
export const ALL_DOMAINS: readonly string[] = Object.freeze(['*']);

/** Whether `entries` is the allow-all list. */
export function isAllowAll(entries: readonly string[]): boolean {
  return entries.length === 1 && entries[0] === '*';
}

/** Normative entry grammar: the last label starts with a letter, so no IP literal can be an entry. */
const ENTRY = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const overlaps = (a: string, b: string): boolean => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/** Why `entries` is not a valid list, or `null` when it is. Never quotes an entry. */
export function allowedDomainsProblem(entries: readonly string[]): string | null {
  if (entries.length > MAX_ALLOWED_DOMAINS) return `at most ${String(MAX_ALLOWED_DOMAINS)} entries are allowed`;
  for (const [index, entry] of entries.entries()) {
    if (!ENTRY.test(entry)) {
      return `entry ${String(index + 1)} is not a lowercase punycode host suffix (no wildcard, IP literal, scheme, port, path, trailing dot, space or uppercase)`;
    }
  }
  for (const [index, entry] of entries.entries()) {
    if (entries.some((other, otherIndex) => otherIndex !== index && overlaps(entry, other))) {
      return `entry ${String(index + 1)} overlaps another entry (duplicates and sub-domains of an entry are refused)`;
    }
  }
  return null;
}

/** Like {@link allowedDomainsProblem}, for a list a consumer was handed: the allow-all list is valid too. */
export function allowedDomainListProblem(entries: readonly string[]): string | null {
  return isAllowAll(entries) ? null : allowedDomainsProblem(entries);
}

/**
 * The environment form: unset or empty is the empty list; anything else is split on `,` with no
 * trimming and every segment must be a valid entry.
 */
export function parseAllowedDomainsEnv(value: string | null | undefined): { readonly entries: readonly string[] } | { readonly problem: string } {
  if (value === undefined || value === null || value === '') return { entries: [] };
  const entries = value.split(',');
  const problem = allowedDomainsProblem(entries);
  return problem === null ? { entries } : { problem };
}

/**
 * The option form: unset or empty is ON for now (user decision 2026-10-25, matching the chart and
 * backend defaults); `true` and `false` (exactly, lowercase) are the only other values. Anything else
 * is a startup problem, so a typo never silently leaves the option off (or on).
 */
export function parseAllowAllDomainsEnv(value: string | null | undefined): { readonly allowAll: boolean } | { readonly problem: string } {
  if (value === 'false') return { allowAll: false };
  if (value === undefined || value === null || value === '' || value === 'true') return { allowAll: true };
  return { problem: 'must be true or false (or unset)' };
}

/**
 * The effective list for one deployment: the allow-list form and the allow-all option together. A
 * list that is invalid fails even when allow-all is on (the option does not hide a typo), but is
 * otherwise ignored then. Returns {@link ALL_DOMAINS} when the option is on.
 */
export function resolveAllowedDomains(
  listValue: string | null | undefined,
  allowAllValue: string | null | undefined,
): { readonly entries: readonly string[] } | { readonly problem: string } {
  const list = parseAllowedDomainsEnv(listValue);
  if ('problem' in list) return list;
  const allowAll = parseAllowAllDomainsEnv(allowAllValue);
  if ('problem' in allowAll) return allowAll;
  return { entries: applyAllowAll(list.entries, allowAll.allowAll) };
}

/** The effective list: {@link ALL_DOMAINS} when the option is on (the configured list is then ignored), else `entries`. */
export function applyAllowAll(entries: readonly string[], allowAll: boolean): readonly string[] {
  return allowAll ? ALL_DOMAINS : entries;
}

/**
 * The lowercase punycode host of an absolute http(s) URL, or `null`. `null` never matches. Refuses
 * userinfo, brackets, `%`, backslashes, spaces and control characters, a bad port, IP hosts, a
 * trailing dot and every other scheme.
 */
export function hostOf(url: string): string | null {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what the vectors refuse
  if (/[\u0000- \u007f\\]/u.test(url)) return null;
  const parsed = /^https?:\/\/([^/?#]*)/iu.exec(url);
  const authority = parsed?.[1];
  if (authority === undefined || authority === '' || /[@%[\]]/u.test(authority)) return null;
  let host = authority;
  const colon = host.indexOf(':');
  if (colon >= 0) {
    const port = host.slice(colon + 1);
    if (!/^[0-9]{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
    host = host.slice(0, colon);
  }
  const ascii = domainToASCII(host);
  return ascii !== '' && ENTRY.test(ascii) ? ascii : null;
}

/**
 * The entry a (punycode, lowercase) host falls under, or `null`. Entries never overlap, so at most
 * one matches. Under allow-all every host falls under itself: the "entry" is the host the page is on.
 */
export function entryForHost(entries: readonly string[], host: string): string | null {
  if (isAllowAll(entries)) return host;
  return entries.find((entry) => host === entry || host.endsWith(`.${entry}`)) ?? null;
}

/** Whether an absolute URL's host is on the list. */
export function domainAllowed(entries: readonly string[], url: string): boolean {
  const host = hostOf(url);
  return host !== null && entryForHost(entries, host) !== null;
}

/**
 * The main frame settled on a host outside the list and did not come back inside the return window.
 * Carries the host name only, which is all that may reach diagnostics.
 */
export class OriginNotAllowed extends Error {
  constructor(readonly host: string) {
    super('ORIGIN_NOT_ALLOWED');
    this.name = 'OriginNotAllowed';
  }
}
