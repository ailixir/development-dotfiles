/**
 * Where the browser was when a step failed (VAL-013).
 *
 * A failure message that does not say which page the run ended on sends the reader to the video
 * for the one fact a line of text could have carried — a run that ended on a CAPTCHA interstitial
 * reads exactly like a run whose locator was wrong. This module turns the adapter's raw reading
 * into a short, redacted suffix for the step's failure message.
 *
 * **What is emitted, and what never is.** A URL can carry credentials and tokens in its query,
 * its fragment and its userinfo, and a `<secret NAME>` value may have been typed into the page it
 * names. So:
 *
 * - only `origin + pathname` of an `http`/`https` URL — never the query, the fragment or the
 *   userinfo. `about:blank` is kept verbatim; any other scheme (`data:`, `blob:`, `file:`…) is
 *   reduced to the scheme, because its "path" can be the whole document;
 * - the title whitespace-collapsed and cut to {@link MAX_TITLE_LENGTH}, with every URL-like token
 *   in it (`http(s)://…`, `//host/…`, `www.…`) reduced by the same rule (VAL-020: a page whose
 *   title *is* a URL — Google's `/sorry` interstitial — would otherwise leak the query through
 *   the title); a title that then equals the location is dropped as noise;
 * - both through the run's redactor **before** they are cut, so truncation cannot split a known
 *   value into a prefix the redactor no longer recognises;
 * - and the reading is best-effort and bounded: a page that is closed, crashed or hung costs at
 *   most {@link DEFAULT_PAGE_LOCATION_TIMEOUT_MS} and never turns a step failure into a run fault.
 *
 * Nothing here crosses the child↔parent boundary as a new field: the suffix is part of the
 * step's `failure` string, which already crosses it, and the parent redacts it again.
 */
import type { BrowserAdapter, PageLocation } from './adapters/BrowserAdapter.js';
import type { Redactor } from './redaction.js';
import { safeMessage } from './redaction.js';

export const MAX_TITLE_LENGTH = 120;
export const MAX_LOCATION_URL_LENGTH = 200;
export const DEFAULT_PAGE_LOCATION_TIMEOUT_MS = 500;

function cut(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

/** `origin + pathname` for http(s), `about:blank` verbatim, the bare scheme otherwise. */
export function locationOf(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    // `origin` never carries userinfo; `pathname` never carries the query or the fragment.
    return `${parsed.origin}${parsed.pathname}`;
  }
  if (parsed.href === 'about:blank') return 'about:blank';
  return parsed.protocol;
}

/** URL-like tokens: `http(s)://…`, protocol-relative `//…`, and `www.…` (optionally after userinfo). */
const URL_LIKE = /(?:https?:)?\/\/[^\s"'<>]+|(?:[^\s"'<>/@]+@)?www\.[^\s"'<>]+/giu;
/** Trailing punctuation that belongs to the surrounding prose, not to the URL. */
const TRAILING_PUNCTUATION = /[).,;:!'"\]]+$/u;

/** String-level reduction for tokens `URL` cannot parse: no userinfo, no query, no fragment. */
function stripUrlTails(token: string): string {
  const noTail = token.replace(/[?#].*$/su, '');
  return noTail
    .replace(/^((?:https?:)?\/\/)[^/]*@/iu, '$1')
    .replace(/^[^/]*@(?=www\.)/iu, '');
}

function sanitizeUrlToken(match: string): string {
  const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
  const token = match.slice(0, match.length - trailing.length);
  if (/^https?:\/\//iu.test(token)) {
    const where = locationOf(token);
    if (where !== null) return `${where}${trailing}`;
  }
  return `${stripUrlTails(token)}${trailing}`;
}

/** The title with every URL-like token reduced to origin + path; non-URL text is unchanged. */
export function sanitizeTitle(title: string): string {
  return title.replace(URL_LIKE, sanitizeUrlToken);
}

/** The ` (page: … — "…")` suffix, or `''` when there is nothing safe to say. */
export function formatPageLocation(location: PageLocation, redactor: Redactor): string {
  const where = locationOf(location.url);
  if (where === null) return '';
  const url = cut(redactor.redact(where), MAX_LOCATION_URL_LENGTH);
  const rawTitle =
    location.title === null ? '' : sanitizeTitle(location.title.replace(/\s+/gu, ' ').trim());
  if (rawTitle === '' || rawTitle === where) return ` (page: ${url})`;
  const title = cut(redactor.redact(rawTitle), MAX_TITLE_LENGTH);
  return ` (page: ${url} — ${JSON.stringify(title)})`;
}

/**
 * Reads the adapter's page location, bounded and best-effort.
 *
 * Resolves `null` when the adapter has no reading, when the reading throws or rejects, and when it
 * has not answered within `timeoutMs`. The timer is cleared either way, so a fast answer leaves
 * nothing pending.
 */
export async function readPageLocation(
  adapter: BrowserAdapter,
  timeoutMs: number,
): Promise<PageLocation | null> {
  if (adapter.pageLocation === undefined) return null;
  let reading: Promise<PageLocation | null>;
  try {
    reading = adapter.pageLocation().catch(() => null);
  } catch {
    return null;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);
  });
  try {
    return await Promise.race([reading, expiry]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The step's failure message with the page location appended, within `maxLength`.
 *
 * The location is the part a reader cannot recover from the rest of the message, so the error text
 * gives way to it — but never below half the budget: a very long location is cut instead.
 */
export async function failureWithLocation(
  error: unknown,
  adapter: BrowserAdapter,
  redactor: Redactor,
  maxLength: number,
  timeoutMs: number,
): Promise<string> {
  const location = await readPageLocation(adapter, timeoutMs);
  const suffix = location === null ? '' : formatPageLocation(location, redactor);
  if (suffix === '') return safeMessage(error, redactor, maxLength);
  const budget = Math.max(Math.floor(maxLength / 2), maxLength - suffix.length);
  return cut(`${safeMessage(error, redactor, budget)}${suffix}`, maxLength);
}
