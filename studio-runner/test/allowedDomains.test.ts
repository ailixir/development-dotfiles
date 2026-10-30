import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  ALL_DOMAINS,
  allowedDomainListProblem,
  allowedDomainsProblem,
  domainAllowed,
  entryForHost,
  hostOf,
  isAllowAll,
  MAX_ALLOWED_DOMAINS,
  parseAllowAllDomainsEnv,
  parseAllowedDomainsEnv,
  resolveAllowedDomains,
} from '../src/allowedDomains.js';

/** The vectors the backend (Java) and this runner both run: docs/specs/studio/allowed-domains-vectors.json. */
interface Vectors {
  readonly schemaVersion: number;
  readonly entryGrammar: string;
  readonly limits: { readonly maxEntries: number };
  readonly configCases: readonly { readonly name: string; readonly entries: readonly string[]; readonly valid: boolean; readonly reason?: string }[];
  readonly envCases: readonly { readonly name: string; readonly value: string | null; readonly valid: boolean; readonly entries?: readonly string[] }[];
  readonly hostCases: readonly { readonly name: string; readonly url: string; readonly host: string | null }[];
  readonly matchCases: readonly { readonly name: string; readonly entries: readonly string[]; readonly url: string; readonly match: boolean }[];
  readonly allowAllEnvCases: readonly { readonly name: string; readonly value: string | null; readonly valid: boolean; readonly allowAll?: boolean }[];
  readonly allowAllMatchCases: readonly { readonly name: string; readonly entries: readonly string[]; readonly url: string; readonly match: boolean }[];
}
const vectors = JSON.parse(readFileSync(new URL('../../docs/specs/studio/allowed-domains-vectors.json', import.meta.url), 'utf8')) as Vectors;

describe('the shared allowed-domains vectors', () => {
  it('are the version and bounds this implementation was written against', () => {
    expect(vectors.schemaVersion).toBe(1);
    expect(vectors.limits.maxEntries).toBe(MAX_ALLOWED_DOMAINS);
    expect(vectors.configCases.length + vectors.envCases.length + vectors.hostCases.length + vectors.matchCases.length).toBeGreaterThan(200);
    expect(vectors.allowAllEnvCases.length).toBeGreaterThan(15);
    expect(vectors.allowAllMatchCases.length).toBeGreaterThan(25);
  });

  it.each(vectors.configCases.map((c) => [c.name, c] as const))('config: %s', (_name, c) => {
    expect(allowedDomainsProblem(c.entries) === null).toBe(c.valid);
  });

  it.each(vectors.envCases.map((c) => [c.name, c] as const))('runner env: %s', (_name, c) => {
    const parsed = parseAllowedDomainsEnv(c.value);
    if (c.valid) expect('entries' in parsed ? parsed.entries : null).toEqual(c.entries);
    else expect('problem' in parsed).toBe(true);
  });

  it.each(vectors.hostCases.map((c) => [c.name, c] as const))('host extraction: %s', (_name, c) => {
    expect(hostOf(c.url)).toBe(c.host);
  });

  it.each(vectors.matchCases.map((c) => [c.name, c] as const))('match: %s', (_name, c) => {
    expect(allowedDomainsProblem(c.entries)).toBeNull();
    expect(domainAllowed(c.entries, c.url)).toBe(c.match);
  });

  it.each(vectors.allowAllEnvCases.map((c) => [c.name, c] as const))('allow-all env: %s', (_name, c) => {
    const parsed = parseAllowAllDomainsEnv(c.value);
    if (c.valid) expect('allowAll' in parsed ? parsed.allowAll : null).toBe(c.allowAll);
    else expect('problem' in parsed).toBe(true);
  });

  it.each(vectors.allowAllMatchCases.map((c) => [c.name, c] as const))('allow-all match: %s', (_name, c) => {
    // The configured list is irrelevant under allow-all, but it is a valid list in every case.
    expect(allowedDomainsProblem(c.entries)).toBeNull();
    const effective = resolveAllowedDomains(c.entries.join(','), 'true');
    expect('entries' in effective ? effective.entries : null).toBe(ALL_DOMAINS);
    expect(domainAllowed(ALL_DOMAINS, c.url)).toBe(c.match);
  });

  it('runs every case of every group (nothing was skipped by the name filter)', () => {
    const names = (group: readonly { readonly name: string }[]): number => new Set(group.map((c) => c.name)).size;
    for (const group of [vectors.configCases, vectors.envCases, vectors.hostCases, vectors.matchCases, vectors.allowAllEnvCases, vectors.allowAllMatchCases]) expect(names(group)).toBe(group.length);
  });
});

describe('the rest of the matching surface', () => {
  it('finds the one entry a host falls under (read grants are keyed by entry)', () => {
    const entries = ['citi.com', 'localhost'];
    expect(entryForHost(entries, 'www.citi.com')).toBe('citi.com');
    expect(entryForHost(entries, 'citi.com')).toBe('citi.com');
    expect(entryForHost(entries, 'localhost')).toBe('localhost');
    expect(entryForHost(entries, 'evilciti.com')).toBeNull();
    expect(entryForHost(entries, 'citi.com.evil.com')).toBeNull();
    expect(entryForHost([], 'citi.com')).toBeNull();
  });

  it('denies everything for the empty list', () => {
    expect(domainAllowed([], 'https://citi.com/')).toBe(false);
  });
});

describe('the allow-all option (STUDIO_RUNNER_ALLOW_ALL_DOMAINS, on by default for now)', () => {
  it('is the single wildcard list, which no configured list can equal', () => {
    expect(ALL_DOMAINS).toEqual(['*']);
    expect(Object.isFrozen(ALL_DOMAINS)).toBe(true);
    expect(isAllowAll(ALL_DOMAINS)).toBe(true);
    for (const list of [[], ['citi.com'], ['*', 'citi.com'], ['*.citi.com']]) expect(isAllowAll(list)).toBe(false);
    // '*' is not an entry: the env form and the list grammar still refuse it, only a handed-over allow-all list is valid.
    expect('problem' in parseAllowedDomainsEnv('*')).toBe(true);
    expect(allowedDomainsProblem(ALL_DOMAINS)).not.toBeNull();
    expect(allowedDomainListProblem(ALL_DOMAINS)).toBeNull();
    expect(allowedDomainListProblem(['*', 'citi.com'])).not.toBeNull();
  });

  it('decides in the two places every consumer goes through: any DNS-named http(s) host passes, and a host is its own entry', () => {
    expect(domainAllowed(ALL_DOMAINS, 'https://anything.example/x')).toBe(true);
    expect(entryForHost(ALL_DOMAINS, 'www.citi.com')).toBe('www.citi.com');
    // The same parsing as the list: nothing the list refuses to parse is admitted.
    for (const url of ['http://10.0.0.1/', 'http://[::1]/', 'https://u@citi.com/', 'ftp://citi.com/', 'about:blank', 'https://citi.com./']) {
      expect(domainAllowed(ALL_DOMAINS, url), url).toBe(false);
    }
  });

  it('is ON when unset or empty (the default for now), off only for exactly false, and anything else is a startup problem', () => {
    expect(parseAllowAllDomainsEnv(undefined)).toEqual({ allowAll: true });
    expect(parseAllowAllDomainsEnv(null)).toEqual({ allowAll: true });
    expect(parseAllowAllDomainsEnv('')).toEqual({ allowAll: true });
    expect(parseAllowAllDomainsEnv('true')).toEqual({ allowAll: true });
    expect(parseAllowAllDomainsEnv('false')).toEqual({ allowAll: false });
    for (const bad of ['TRUE', 'FALSE', '1', '0', 'yes', ' true', 'false ']) expect('problem' in parseAllowAllDomainsEnv(bad), bad).toBe(true);
  });

  it('resolves to the configured list only for false, and ignores the list otherwise (an invalid list still fails)', () => {
    expect(resolveAllowedDomains('citi.com,localhost', 'false')).toEqual({ entries: ['citi.com', 'localhost'] });
    expect(resolveAllowedDomains('', 'false')).toEqual({ entries: [] });
    expect(resolveAllowedDomains('citi.com', undefined)).toEqual({ entries: ALL_DOMAINS });
    expect(resolveAllowedDomains('', undefined)).toEqual({ entries: ALL_DOMAINS });
    expect(resolveAllowedDomains('', 'true')).toEqual({ entries: ALL_DOMAINS });
    expect(resolveAllowedDomains('citi.com', 'true')).toEqual({ entries: ALL_DOMAINS });
    expect('problem' in resolveAllowedDomains('*.citi.com', 'true')).toBe(true);
    expect('problem' in resolveAllowedDomains('*.citi.com', undefined)).toBe(true);
    expect('problem' in resolveAllowedDomains('citi.com', 'maybe')).toBe(true);
  });
});
