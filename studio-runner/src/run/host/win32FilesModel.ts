/**
 * Pure logic of the win32 file host (ADR-SC-009), kept free of I/O so it is unit-tested on every OS: the `whoami` SID
 * parse, the `icacls` grant, the SDDL read-back evaluation of a private root, the Windows `isInside`, and the
 * sharing-violation classification. Paths are always handled with `path.win32`, never the running OS's `path`.
 */
import { win32 } from 'node:path';

/** NT AUTHORITY\SYSTEM. */
export const SYSTEM_SID = 'S-1-5-18';
/** BUILTIN\Administrators. */
export const ADMINISTRATORS_SID = 'S-1-5-32-544';

const SID = /^S-1-\d+(?:-\d+)+$/u;
/** The SDDL aliases that can name one of the allowed principals; any other alias is some other principal. */
const ALIASES: Readonly<Record<string, string>> = Object.freeze({ SY: SYSTEM_SID, BA: ADMINISTRATORS_SID });

/** The current user's SID from `whoami /user /fo csv /nh` (`"domain\user","S-1-5-21-…"`), or null when not exactly one. */
export function parseWhoamiSid(stdout: string): string | null {
  const rows = stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
  if (rows.length !== 1) return null;
  const sid = /,"(S-1-[0-9-]+)"$/u.exec(rows[0] ?? '')?.[1];
  return sid !== undefined && SID.test(sid) ? sid : null;
}

/** `icacls` arguments that make `path` protected (inheritance removed) and grant full control, inherited by every child, to the user, SYSTEM and Administrators only. */
export function privateRootGrantArguments(path: string, userSid: string): readonly string[] {
  return [path, '/inheritance:r', '/grant:r', `*${userSid}:(OI)(CI)F`, `*${SYSTEM_SID}:(OI)(CI)F`, `*${ADMINISTRATORS_SID}:(OI)(CI)F`];
}

/**
 * The DACL line of an `icacls <path> /save <file>` file. icacls writes it as UTF-16LE (with or without a BOM): the
 * object name on one line, then its SDDL. Null unless exactly one `D:` line is present.
 */
export function sddlFromIcaclsSave(bytes: Buffer): string | null {
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes.length > 1 && bytes[1] === 0);
  const text = (utf16 ? bytes.toString('utf16le') : bytes.toString('utf8')).replace(/^\uFEFF/u, '');
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.startsWith('D:'));
  return lines.length === 1 ? (lines[0] ?? null) : null;
}

interface Ace { readonly type: string; readonly flags: string; readonly rights: string; readonly sid: string }
interface Sddl { readonly owner: string | null; readonly daclFlags: string | null; readonly aces: readonly Ace[] }

/** Splits on `separator` outside parentheses (conditional ACEs and resource attributes nest). */
function splitTopLevel(text: string, separator: string): string[] | null {
  const parts: string[] = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return null;
    else if (c === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  if (depth !== 0) return null;
  parts.push(text.slice(start));
  return parts;
}

function sidOf(token: string): string {
  const upper = token.toUpperCase();
  return ALIASES[upper] ?? upper;
}

/** O:, G:, D: and S: sections at the top level; the DACL as its flags and ACEs. Null when the string is not SDDL. */
function parseSddl(sddl: string): Sddl | null {
  const sections = new Map<string, string>(); let depth = 0, key: string | null = null, start = 0;
  const close = (end: number): void => { if (key !== null) sections.set(key, sddl.slice(start, end)); };
  for (let i = 0; i < sddl.length; i++) {
    const c = sddl[i];
    if (c === '(') depth++;
    else if (c === ')') { if (--depth < 0) return null; }
    else if (depth === 0 && sddl[i + 1] === ':' && (c === 'O' || c === 'G' || c === 'D' || c === 'S')) {
      if (sections.has(c) || key === c) return null;
      close(i); key = c; start = i + 2; i++;
    } else if (key === null) return null;
  }
  if (depth !== 0 || key === null) return null;
  close(sddl.length);
  const dacl = sections.get('D');
  if (dacl === undefined) return { owner: sections.get('O') ?? null, daclFlags: null, aces: [] };
  const open = dacl.indexOf('(');
  const daclFlags = open < 0 ? dacl : dacl.slice(0, open), body = open < 0 ? '' : dacl.slice(open);
  const aces: Ace[] = [];
  for (let rest = body; rest.length > 0;) {
    if (!rest.startsWith('(')) return null;
    let level = 0, end = -1;
    for (let i = 0; i < rest.length; i++) { if (rest[i] === '(') level++; else if (rest[i] === ')' && --level === 0) { end = i; break; } }
    if (end < 0) return null;
    const fields = splitTopLevel(rest.slice(1, end), ';');
    if (fields === null || fields.length < 6) return null;
    aces.push({ type: (fields[0] ?? '').toUpperCase(), flags: (fields[1] ?? '').toUpperCase(), rights: (fields[2] ?? '').toUpperCase(), sid: sidOf(fields[5] ?? '') });
    rest = rest.slice(end + 1);
  }
  return { owner: sections.has('O') ? sidOf(sections.get('O') ?? '') : null, daclFlags, aces };
}

/** DACL control flags as tokens (`PAI` is P + AI). Null when an unknown token is present. */
function daclTokens(flags: string): readonly string[] | null {
  const tokens: string[] = [];
  for (let rest = flags.toUpperCase(); rest.length > 0;) {
    const token = ['NO_ACCESS_CONTROL', 'AR', 'AI', 'P'].find((candidate) => rest.startsWith(candidate));
    if (token === undefined) return null;
    tokens.push(token); rest = rest.slice(token.length);
  }
  return tokens;
}

/** ACE flags as two-letter tokens (`OICI` is OI + CI). */
const aceTokens = (flags: string): readonly string[] => flags.match(/.{2}/gu) ?? [];
const FULL_CONTROL = new Set(['FA', 'GA', '0X1F01FF', '0X10000000']);

export type SddlVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether `sddl` (a DACL, optionally with owner and group) is the private root {@link privateRootGrantArguments} made:
 * the DACL is protected (`P`) and not null; it holds only explicit (not inherited) **allow** ACEs, each for the user,
 * SYSTEM or Administrators; and the user has full control inherited by files and directories (`OI` and `CI`). A deny
 * ACE, an audit or object ACE, any other principal, or an owner other than those three refuses: nothing but our own
 * grant may be there, so anything else means the grant did not land as written (fail closed).
 */
export function evaluatePrivateRootSddl(sddl: string, userSid: string): SddlVerdict {
  const refuse = (reason: string): SddlVerdict => ({ ok: false, reason });
  const user = userSid.toUpperCase();
  if (!SID.test(user)) return refuse('the user SID is not a SID');
  const allowed = new Set([user, SYSTEM_SID, ADMINISTRATORS_SID]);
  const parsed = parseSddl(sddl.trim());
  if (parsed === null) return refuse('the security descriptor is not SDDL');
  if (parsed.owner !== null && !allowed.has(parsed.owner)) return refuse('the owner is another principal');
  if (parsed.daclFlags === null) return refuse('there is no DACL');
  const flags = daclTokens(parsed.daclFlags);
  if (flags === null) return refuse('the DACL has unknown control flags');
  if (flags.includes('NO_ACCESS_CONTROL')) return refuse('the DACL is null (everyone has access)');
  if (!flags.includes('P')) return refuse('the DACL is not protected (it inherits from its parent)');
  if (parsed.aces.length === 0) return refuse('the DACL is empty');
  for (const ace of parsed.aces) {
    if (ace.type !== 'A') return refuse(`the DACL holds a non-allow ACE (${ace.type})`);
    if (!allowed.has(ace.sid)) return refuse('the DACL allows another principal');
    if (aceTokens(ace.flags).includes('ID')) return refuse('the DACL holds an inherited ACE');
  }
  const userFull = parsed.aces.some((ace) => ace.sid === user && FULL_CONTROL.has(ace.rights) && aceTokens(ace.flags).includes('OI') && aceTokens(ace.flags).includes('CI') && !aceTokens(ace.flags).includes('IO'));
  return userFull ? { ok: true } : refuse('the user lacks inherited full control');
}

/**
 * Whether resolved `child` is strictly inside resolved `parent` on Windows: by `path.win32.relative`, which compares
 * case-insensitively and normalises `/` to `\`. Equality, a parent's sibling, and another drive or UNC share are not inside.
 */
export function isInsideWin32(parent: string, child: string): boolean {
  const relative = win32.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative);
}

const SHARING_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);
const SHARING_SYSCALLS = new Set(['rename', 'unlink', 'rmdir', 'rm']);

/**
 * Whether `error` is a removal or rename that Windows refused because another process holds the file (ffmpeg, Defender,
 * the indexer, a lingering handle). libuv maps ERROR_SHARING_VIOLATION to EBUSY, and ERROR_ACCESS_DENIED, which Windows
 * also returns for a file opened without FILE_SHARE_DELETE or already pending deletion, to EPERM; EACCES covers the
 * lock-violation family. Only these syscalls count, so an open or a read that is refused is never classified as one.
 */
export function isSharingViolationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, syscall } = error as NodeJS.ErrnoException;
  return typeof code === 'string' && SHARING_CODES.has(code) && typeof syscall === 'string' && SHARING_SYSCALLS.has(syscall);
}
