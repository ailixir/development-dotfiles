import { createHash } from 'node:crypto';
import schemasJson from './observedSchemas.json' with { type: 'json' };
import { parseWireJson } from '../guided/json.js';
import type { BuildIdentity, Profile } from '../executor/observedOperations.js';
export const OBSERVED_LIMITS = Object.freeze({ artifact: 1048576, policy: 524288, basis: 6291456, validation: 8388608, verdict: 65536, job: 4194304, launch: 131072, execute: 2097152, ready: 4096, step: 8192, result: 65536, inputs: 262144 });
export type ObservedErrorCode = 'INVALID_CONTRACT' | 'EVIDENCE_MISMATCH' | 'OPERATION_MISMATCH' | 'REFERENCE_MISMATCH' | 'PROFILE_MISMATCH' | 'LIMIT_EXCEEDED' | 'AUTHORIZATION_EXPIRED' | 'POLICY_REFUSED' | 'TARGET_DRIFT' | 'READ_REFUSED' | 'REFERENCE_REFUSED' | 'ASSERTION_FAILED' | 'CANCELLED' | 'TIMEOUT' | 'OUTCOME_UNKNOWN' | 'INTERNAL_ERROR' | 'LOGIN_REQUIRED' | 'PASSWORD_CONTROL_READ_REFUSED';
export class ObservedRefusal extends Error {
    constructor(readonly code: ObservedErrorCode, readonly reason?: string, readonly noEffect=false) { super(code); this.name = 'ObservedRefusal'; }
}
export function demand(value: unknown, code: ObservedErrorCode = 'INVALID_CONTRACT'): asserts value { if (!value)
    throw new ObservedRefusal(code); }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function validUnicode(value: string): boolean { return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value); }
export function canonicalObserved(value: unknown): string {
    if (value === null || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'string') {
        demand(validUnicode(value));
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        demand(Number.isSafeInteger(value) && !Object.is(value, -0));
        return String(value);
    }
    if (Array.isArray(value))
        return '[' + value.map(canonicalObserved).join(',') + ']';
    demand(isRecord(value));
    return '{' + Object.keys(value).sort().map(key => { demand(/^[\x20-\x7e]+$/u.test(key)); return JSON.stringify(key) + ':' + canonicalObserved(value[key]); }).join(',') + '}';
}
export function hashObserved(value: unknown): string { return createHash('sha256').update(canonicalObserved(value), 'utf8').digest('hex'); }
export function equalObserved(a: unknown, b: unknown): boolean { return canonicalObserved(a) === canonicalObserved(b); }
export function boundedObserved(value: unknown, maxBytes: number): number {
    let json: string | undefined;
    try {
        json = JSON.stringify(value);
    }
    catch {
        throw new ObservedRefusal('INVALID_CONTRACT');
    }
    demand(typeof json === 'string');
    demand(Buffer.byteLength(json, 'utf8') <= maxBytes, 'LIMIT_EXCEEDED');
    let nodes = 0;
    function walk(v: unknown, depth: number): void {
        demand(depth <= 32 && ++nodes <= 1000000, 'LIMIT_EXCEEDED');
        if (typeof v === 'string')
            demand(validUnicode(v));
        else if (typeof v === 'number')
            demand(Number.isFinite(v) && !Object.is(v, -0));
        else if (Array.isArray(v))
            for (const item of v)
                walk(item, depth + 1);
        else if (isRecord(v))
            for (const [key, child] of Object.entries(v)) {
                demand(validUnicode(key));
                walk(child, depth + 1);
            }
        else
            demand(v === null || typeof v === 'boolean');
    }
    walk(value, 0);
    return Buffer.byteLength(json, 'utf8');
}
export function parseObservedBytes(bytes: Uint8Array, maxBytes: number): unknown {
    demand(bytes.byteLength <= maxBytes, 'LIMIT_EXCEEDED');
    let parsed: unknown;
    try {
        parsed = parseWireJson(bytes);
    }
    catch {
        throw new ObservedRefusal('INVALID_CONTRACT');
    }
    boundedObserved(parsed, maxBytes);
    return parsed;
}
interface Schema {
    $id?: string;
    $schema?: string;
    $ref?: string;
    const?: unknown;
    enum?: unknown[];
    type?: string | string[];
    properties?: Record<string, Schema>;
    patternProperties?: Record<string, Schema>;
    maxProperties?: number;
    required?: string[];
    additionalProperties?: boolean | Schema;
    propertyNames?: Schema;
    minProperties?: number;
    items?: Schema;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    format?: string;
    oneOf?: Schema[];
    anyOf?: Schema[];
    allOf?: Schema[];
    not?: Schema;
    if?: Schema;
    then?: Schema;
    else?: Schema;
    contains?: Schema;
    definitions?: Record<string, Schema>;
    dependencies?: Record<string, Schema | string[] | boolean>;
}
const schemas = schemasJson as Record<string, Schema>;
const schemaById = new Map(Object.values(schemas).map(s => [s.$id, s]));
const base = 'https://checks.citi.example/contracts/observed/v3/';
function resolve(reference: string, baseId: string): {
    schema: Schema;
    baseId: string;
} {
    const url = new URL(reference, baseId), fragment = url.hash;
    url.hash = '';
    demand(url.href.startsWith(base));
    let value: unknown = schemaById.get(url.href);
    demand(value);
    if (fragment)
        for (const part of decodeURIComponent(fragment.slice(2)).split('/')) {
            demand(typeof value === 'object' && value !== null);
            const key = part.replace(/~1/gu, '/').replace(/~0/gu, '~');
            demand(Object.hasOwn(value, key));
            value = (value as Record<string, unknown>)[key];
        }
    demand(isRecord(value));
    return { schema: value as Schema, baseId: url.href };
}
const supportedKeywords = new Set(['$schema', '$id', '$ref', 'title', 'description', 'default', 'const', 'enum', 'type', 'properties', 'patternProperties', 'maxProperties', 'minProperties', 'propertyNames', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'pattern', 'format', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else', 'contains', 'definitions', 'dependencies']);
function audit(s: Schema, baseId: string, visiting: Set<Schema>): void {
    demand(!visiting.has(s));
    visiting.add(s);
    demand(Object.keys(s).every(key => supportedKeywords.has(key)));
    if (s.patternProperties) {
        demand(isRecord(s.patternProperties) && Object.keys(s.patternProperties).length === 1 && Object.hasOwn(s.patternProperties, '^[A-Za-z0-9_.-]{1,64}$'));
    }
    if (s.maxProperties !== undefined) demand(Number.isSafeInteger(s.maxProperties) && s.maxProperties >= 0 && s.maxProperties <= 100);
    if (s.minProperties !== undefined) demand(Number.isSafeInteger(s.minProperties) && s.minProperties >= 0);
    if (s.format !== undefined) demand(['date-time','uri','uuid'].includes(s.format));
    if (s.dependencies !== undefined) {
        demand(isRecord(s.dependencies));
        for (const dependency of Object.values(s.dependencies)) {
            if (Array.isArray(dependency)) demand(dependency.every(key => typeof key === 'string') && new Set(dependency).size === dependency.length);
            else if (typeof dependency !== 'boolean') audit(dependency, baseId, visiting);
        }
    }
    if (s.$ref) {
        const resolved = resolve(s.$ref, baseId);
        audit(resolved.schema, resolved.baseId, visiting);
    }
    for (const child of [...Object.values(s.properties ?? {}), ...Object.values(s.patternProperties ?? {}), ...(s.oneOf ?? []), ...(s.anyOf ?? []), ...(s.allOf ?? []), s.propertyNames, typeof s.additionalProperties === 'object' ? s.additionalProperties : undefined, s.items, s.not, s.if, s.then, s.else, s.contains])
        if (child)
            audit(child, baseId, visiting);
    visiting.delete(s);
}
for (const s of Object.values(schemas)) {
    demand(s.$id);
    audit(s, s.$id, new Set());
    for (const definition of Object.values(s.definitions ?? {}))
        audit(definition, s.$id, new Set());
}
function dateTime(value: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.exec(value);
    if (!m || !Number.isFinite(Date.parse(value)))
        return false;
    const y = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    const date = new Date(0);
    date.setUTCFullYear(y, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === y && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60;
}
function matches(s: Schema, value: unknown, baseId: string): boolean {
    if (s.$ref) {
        const target = resolve(s.$ref, baseId);
        return matches(target.schema, value, target.baseId);
    }
    if (Object.hasOwn(s, 'const') && !equalObserved(s.const, value))
        return false;
    if (s.enum && !s.enum.some(v => equalObserved(v, value)))
        return false;
    if (s.oneOf && s.oneOf.filter(v => matches(v, value, baseId)).length !== 1)
        return false;
    if (s.anyOf && !s.anyOf.some(v => matches(v, value, baseId)))
        return false;
    if (s.allOf && !s.allOf.every(v => matches(v, value, baseId)))
        return false;
    if (s.not && matches(s.not, value, baseId))
        return false;
    if (s.if && !matches(matches(s.if, value, baseId) ? s.then ?? {} : s.else ?? {}, value, baseId))
        return false;
    if (s.type && !(Array.isArray(s.type) ? s.type : [s.type]).some(t => t === 'object' ? isRecord(value) : t === 'array' ? Array.isArray(value) : t === 'null' ? value === null : t === 'integer' ? Number.isSafeInteger(value) : t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t))
        return false;
    if (typeof value === 'string') {
        const length = Array.from(value).length;
        if (s.minLength !== undefined && length < s.minLength || s.maxLength !== undefined && length > s.maxLength || s.pattern && !new RegExp(s.pattern, 'u').test(value))
            return false;
        if (s.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return false;
        if (s.format === 'date-time' && !dateTime(value))
            return false;
        if (s.format === 'uri') {
            try {
                new URL(value);
            }
            catch {
                return false;
            }
        }
    }
    if (typeof value === 'number' && (s.minimum !== undefined && value < s.minimum || s.maximum !== undefined && value > s.maximum))
        return false;
    if (Array.isArray(value)) {
        if (s.minItems !== undefined && value.length < s.minItems || s.maxItems !== undefined && value.length > s.maxItems)
            return false;
        if (s.uniqueItems && new Set(value.map(canonicalObserved)).size !== value.length)
            return false;
        if (s.items && !value.every(item => matches(s.items ?? {}, item, baseId)))
            return false;
        if (s.contains && !value.some(item => matches(s.contains ?? {}, item, baseId)))
            return false;
    }
    if (isRecord(value)) {
        for (const [key,dependency] of Object.entries(s.dependencies ?? {})) if (Object.hasOwn(value,key)) {
            if (Array.isArray(dependency) ? dependency.some(required => !Object.hasOwn(value,required)) : typeof dependency === 'boolean' ? !dependency : !matches(dependency,value,baseId)) return false;
        }
        if (s.minProperties !== undefined && Object.keys(value).length < s.minProperties) return false;
        if (s.propertyNames && !Object.keys(value).every(key => matches(s.propertyNames ?? {}, key, baseId))) return false;
        if (typeof s.additionalProperties === 'object' && Object.entries(value).some(([key, item]) => !Object.hasOwn(s.properties ?? {}, key) && !Object.entries(s.patternProperties ?? {}).some(([pattern]) => new RegExp(pattern, 'u').test(key)) && !matches(s.additionalProperties as Schema, item, baseId))) return false;
        if (s.maxProperties !== undefined && Object.keys(value).length > s.maxProperties) return false;
        const patterns = Object.entries(s.patternProperties ?? {}).map(([pattern, child]) => ({ expression: new RegExp(pattern, 'u'), child }));
        for (const [key, entry] of Object.entries(value)) for (const pattern of patterns) if (pattern.expression.test(key) && !matches(pattern.child, entry, baseId)) return false;
        if (s.required?.some(key => !Object.hasOwn(value, key)))
            return false;
        if (s.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(s.properties ?? {}, key) && !patterns.some(pattern => pattern.expression.test(key))))
            return false;
        for (const [key, child] of Object.entries(s.properties ?? {}))
            if (Object.hasOwn(value, key) && !matches(child, value[key], baseId))
                return false;
    }
    return true;
}
// The generic is the caller's closed schema DTO; the complete runtime shape is checked here.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function validateObserved<T>(name: string, value: unknown, maxBytes: number = OBSERVED_LIMITS.artifact): T {
    boundedObserved(value, maxBytes);
    const [file, fragment] = name.split('#');
    const s = schemas[file ?? ''];
    demand(s?.$id);
    const target = fragment ? resolve('#' + fragment, s.$id) : { schema: s, baseId: s.$id };
    demand(matches(target.schema, value, target.baseId));
    return value as T;
}
export const OBSERVED_PROFILE: Profile = Object.freeze(Object.fromEntries(Object.entries(schemas['replay-profile']?.properties ?? {}).map(([key, s]) => [key, s.const])) as unknown as Profile);
export const OBSERVED_SCHEMA_BUNDLE_HASH = hashObserved(schemasJson);
export function assertProfile(value: unknown): asserts value is Profile { validateObserved('replay-profile', value); demand(equalObserved(value, OBSERVED_PROFILE), 'PROFILE_MISMATCH'); }
export function assertBuild(value: unknown, expected: BuildIdentity): asserts value is BuildIdentity {
    validateObserved('replay-profile#/definitions/BuildIdentity', value);
    demand(equalObserved(value, expected) && expected.profileHash === hashObserved(OBSERVED_PROFILE) && expected.schemaBundleHash === OBSERVED_SCHEMA_BUNDLE_HASH, 'PROFILE_MISMATCH');
}
export function canonicalOrigin(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    }
    catch {
        throw new ObservedRefusal('POLICY_REFUSED');
    }
    demand(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.origin === value, 'POLICY_REFUSED');
    return value;
}
