import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRedactor } from '../executor/redaction.js';
import { hash } from './contracts.js';
export function redactFailure(error, knownValues) {
    const redactor = 'redact' in knownValues ? knownValues : createRedactor(knownValues);
    const text = error instanceof Error ? redactor.redact(error.name) + ': ' + redactor.redact(error.message) : 'Unknown error: ' + typeof error;
    // Scalar redaction precedes interpolation; re-scrub any variant spanning the safe fields.
    const redacted = redactor.redact(text).replace(/\s+/gu, ' ')
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu, '�').trim();
    let bytes = 0, bounded = '';
    for (const character of redacted) {
        const length = Buffer.byteLength(character);
        if (bytes + length > 2048 || Array.from(bounded).length >= 2048)
            break;
        bounded += character;
        bytes += length;
    }
    return bounded || 'Unknown error';
}
/**
 * The start-up refusal the worker answers on the wire (`CONTEXT_LOST`), with everything that caused it
 * kept as `cause`. The wire code and message are unchanged; only the worker's own log reads the rest.
 * `phase` and `loss` come from closed vocabularies owned by the runtime (REL-001).
 */
export class GuidedStartFailure extends Error {
    phase;
    loss;
    constructor(phase, loss, cause) {
        super('CONTEXT_LOST', { cause });
        this.phase = phase;
        this.loss = loss;
        this.name = 'GuidedStartFailure';
    }
}
const CLOSED_CODE = /^[A-Z][A-Z0-9_]{2,47}$/u;
const ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/u;
const ERRNO_CODE = /^E[A-Z0-9]{2,31}$/u;
const PROCESS_EXIT = /process did exit: exitCode=(-?\d{1,3}|null), signal=(SIG[A-Z0-9]{2,10}|null)/u;
const TIMEOUT = /Timeout \d{1,7}ms exceeded/u;
const MAX_LINKS = 6;
/** One link of a cause chain as fixed labels only. Free text is classified here, never echoed. */
function describeLink(error) {
    if (!(error instanceof Error))
        return { name: 'NonError' };
    const link = { name: ERROR_NAME.test(error.name) ? error.name : 'Error' };
    if (CLOSED_CODE.test(error.message))
        link.code = error.message;
    const fields = error;
    if (typeof fields.code === 'string' && ERRNO_CODE.test(fields.code))
        link.errno = fields.code;
    if (typeof fields.phase === 'string' && CLOSED_CODE.test(fields.phase))
        link.phase = fields.phase;
    if (typeof fields.loss === 'string' && CLOSED_CODE.test(fields.loss))
        link.loss = fields.loss;
    if (error.message.includes('Target page, context or browser has been closed'))
        link.kind = 'TARGET_CLOSED';
    else if (TIMEOUT.test(error.message))
        link.kind = 'TIMEOUT';
    const exit = PROCESS_EXIT.exec(error.message);
    if (exit) {
        const [, exitCode, signal] = exit;
        link.exitCode = exitCode === undefined || exitCode === 'null' ? null : Number(exitCode);
        link.signal = signal === undefined || signal === 'null' ? null : signal;
    }
    return link;
}
/**
 * One value-free line for a refused `assign` or `context` (REL-001): the route, a hash prefix of the
 * session (the sidecar file name uses the full hash), the elapsed milliseconds and the cause chain as
 * closed codes, error class names, errno codes, the failed step and, for a browser process that
 * exited, its exit code and signal. No message text, path, URL or session id is ever written.
 */
export function describeStartFailure(error, facts) {
    const links = [];
    const seen = new Set();
    let current = error;
    while (links.length < MAX_LINKS && !seen.has(current)) {
        seen.add(current);
        links.push(describeLink(current));
        current = current instanceof Error ? current.cause : undefined;
        if (current === undefined)
            break;
    }
    const operation = facts.operation === 'assign' || facts.operation === 'context' ? facts.operation : 'other';
    return 'GUIDED_START_FAILED ' + JSON.stringify({
        operation, session: hash(facts.sessionId).slice(0, 16), elapsedMs: Math.max(0, Math.round(facts.elapsedMs)), links
    }) + '\n';
}
/** Bounded, non-authoritative sidecar. Consumption/recovery never reads this file. */
export class GuidedDiagnostics {
    directory;
    maxRecords;
    maxBytes;
    records = 0;
    bytes = 0;
    path;
    constructor(directory, sessionId, maxRecords = 200, maxBytes = 262144) {
        this.directory = directory;
        this.maxRecords = maxRecords;
        this.maxBytes = maxBytes;
        this.path = join(directory, hash(sessionId) + '.diagnostic.jsonl');
    }
    async record(identity, error, knownValues, stderr) {
        const errorMessage = redactFailure(error, knownValues);
        const line = JSON.stringify({ ...identity, errorMessage }) + '\n', bytes = Buffer.byteLength(line);
        if (this.records >= this.maxRecords || this.bytes + bytes > this.maxBytes)
            return errorMessage;
        this.records++;
        this.bytes += bytes;
        try {
            stderr(errorMessage + '\n');
        }
        catch { /* Diagnostic delivery never changes the verdict. */ }
        try {
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            await appendFile(this.path, line, { mode: 0o600, flag: 'a' });
        }
        catch { /* No authority or replay state is stored here. */ }
        return errorMessage;
    }
}
//# sourceMappingURL=diagnostics.js.map