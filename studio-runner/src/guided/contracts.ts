import { createHash } from 'node:crypto';
import schemasJson from './schemas.json' with { type: 'json' };
import type { BridgeIdentity } from './types.js';

interface Schema {
  $id?: string; $ref?: string; const?: unknown; enum?: unknown[]; type?: string | string[];
  properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean | Schema;
  propertyNames?: Schema; minProperties?: number; maxProperties?: number; items?: Schema;
  minItems?: number; maxItems?: number; uniqueItems?: boolean; minLength?: number; maxLength?: number;
  minimum?: number; maximum?: number; pattern?: string; format?: string; oneOf?: Schema[]; allOf?: Schema[];
  not?: Schema; if?: Schema; then?: Schema; else?: Schema; definitions?: Record<string, Schema>; contains?: Schema;
  dependencies?: Record<string, Schema | string[] | boolean>
}
const schemas = schemasJson as Record<string, Schema>;
export function insist(condition: unknown, code = 'POLICY_DENIED'): asserts condition { if (!condition) throw new Error(code); }
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    insist(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), 'INVALID_UNICODE');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') { insist(Number.isSafeInteger(value) && !Object.is(value, -0), 'SCHEMA'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  insist(typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'SCHEMA');
  return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k,v]) => {
      insist(/^[\x20-\x7e]+$/u.test(k), 'SCHEMA');
      return `${JSON.stringify(k)}:${canonical(v)}`;
    }).join(',')}}`;
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
const supportedKeywords = new Set([
  '$id','$schema','$ref','title','description','default','const','enum','type','properties','propertyNames',
  'minProperties','maxProperties','required','additionalProperties','items','minItems','maxItems','uniqueItems',
  'minLength','maxLength','minimum','maximum','pattern','format','oneOf','allOf','not','if','then','else',
  'definitions','contains','dependencies'
]);
/** Audit the actually bundled wire subset at load time. Unknown semantics never degrade to {}. */
export function auditSchemaBundle(bundle: unknown): WeakMap<Schema, Schema> {
  insist(bundle && typeof bundle === 'object' && !Array.isArray(bundle), 'SCHEMA_CONFIGURATION');
  const documents = new Map<string, Schema>(); const references: { schema: Schema; base: string }[] = [];
  const visited = new Set<Schema>();
  const roots = Object.values(bundle as Record<string, unknown>);
  for (const root of roots) {
    insist(root && typeof root === 'object' && !Array.isArray(root), 'SCHEMA_CONFIGURATION');
    const schema=root as Schema; insist(typeof schema.$id==='string'&&!documents.has(schema.$id),'SCHEMA_CONFIGURATION');
    documents.set(schema.$id, schema);
  }
  const walk = (value: unknown, base: string): void => {
    insist(value && typeof value === 'object' && !Array.isArray(value), 'SCHEMA_CONFIGURATION');
    const schema = value as Schema; if (visited.has(schema)) return; visited.add(schema);
    const record = value as Record<string, unknown>;
    insist(Object.keys(record).every(key => supportedKeywords.has(key)), 'SCHEMA_CONFIGURATION');
    if (record.$schema !== undefined) insist(record.$schema === 'http://json-schema.org/draft-07/schema#', 'SCHEMA_CONFIGURATION');
    if (schema.$id !== undefined) insist(schema.$id === base, 'SCHEMA_CONFIGURATION');
    if (schema.$ref !== undefined) {
      insist(typeof schema.$ref === 'string' &&
        Object.keys(record).every(key => ['$ref','title','description'].includes(key)), 'SCHEMA_CONFIGURATION');
      references.push({schema,base});
    }
    if (schema.type !== undefined) insist(
      (Array.isArray(schema.type)?schema.type:[schema.type])
        .every(type=>['null','string','boolean','integer','object','array'].includes(type)), 'SCHEMA_CONFIGURATION');
    for (const keyword of ['minItems','maxItems','minLength','maxLength','minimum','maximum','minProperties','maxProperties'])
      if (record[keyword] !== undefined) insist(Number.isSafeInteger(record[keyword]), 'SCHEMA_CONFIGURATION');
    if (schema.additionalProperties !== undefined) insist(
      typeof schema.additionalProperties === 'boolean' || typeof schema.additionalProperties === 'object', 'SCHEMA_CONFIGURATION');
    if (record.uniqueItems !== undefined) insist(typeof record.uniqueItems === 'boolean', 'SCHEMA_CONFIGURATION');
    if (schema.required !== undefined) insist(Array.isArray(schema.required) &&
      schema.required.every(key=>typeof key==='string') && new Set(schema.required).size===schema.required.length, 'SCHEMA_CONFIGURATION');
    if (schema.enum !== undefined) insist(Array.isArray(schema.enum) && schema.enum.length>0, 'SCHEMA_CONFIGURATION');
    if (schema.pattern !== undefined) {
      insist(typeof schema.pattern==='string','SCHEMA_CONFIGURATION');
      try { new RegExp(schema.pattern,'u'); } catch { throw new Error('SCHEMA_CONFIGURATION'); }
    }
    if (schema.format !== undefined) insist(['date-time','uri','uuid'].includes(schema.format), 'SCHEMA_CONFIGURATION');
    for (const keyword of ['properties','definitions']) if (record[keyword] !== undefined) {
      const children=record[keyword]; insist(children && typeof children==='object' && !Array.isArray(children),'SCHEMA_CONFIGURATION');
      for (const child of Object.values(children)) walk(child,base);
    }
    for (const keyword of ['items','not','if','then','else','propertyNames','contains'])
      if (record[keyword] !== undefined) walk(record[keyword],base);
    if (schema.dependencies !== undefined) {
      insist(typeof schema.dependencies === 'object' && !Array.isArray(schema.dependencies), 'SCHEMA_CONFIGURATION');
      for (const dependency of Object.values(schema.dependencies)) {
        if (Array.isArray(dependency)) insist(
          dependency.every(key => typeof key === 'string') && new Set(dependency).size === dependency.length, 'SCHEMA_CONFIGURATION');
        else if (typeof dependency !== 'boolean') walk(dependency, base);
      }
    }
    const additional=record.additionalProperties;
    if (typeof additional === 'object') {
      insist(additional && !Array.isArray(additional) && Object.keys(additional).length > 0, 'SCHEMA_CONFIGURATION');
      walk(additional, base);
    }
    for (const keyword of ['oneOf','allOf']) if (record[keyword] !== undefined) {
      const children=record[keyword]; insist(Array.isArray(children)&&children.length>0,'SCHEMA_CONFIGURATION');
      for(const child of children)walk(child,base);
    }
  };
  for(const [base,root] of documents)walk(root,base);
  const resolved=new WeakMap<Schema,Schema>();
  for(const {schema,base} of references) {
    const url=new URL(schema.$ref ?? '',base); const fragment=url.hash.slice(1); url.hash='';
    let target: unknown=documents.get(url.href); insist(target,'SCHEMA_CONFIGURATION');
    if(fragment) {
      insist(fragment.startsWith('/'),'SCHEMA_CONFIGURATION');
      for(const raw of decodeURIComponent(fragment).slice(1).split('/')) {
        insist(!/~(?:[^01]|$)/u.test(raw),'SCHEMA_CONFIGURATION'); const key=raw.replace(/~1/gu,'/').replace(/~0/gu,'~');
        insist(target && typeof target==='object' && Object.hasOwn(target,key),'SCHEMA_CONFIGURATION');
        target=(target as Record<string,unknown>)[key];
      }
    }
    insist(visited.has(target as Schema),'SCHEMA_CONFIGURATION'); resolved.set(schema,target as Schema);
  }
  // Declarations are inventoried above, but definitions do not evaluate against an instance.
  // Only references and same-instance applicators can form a non-progressing recursion.
  const active=new Set<Schema>(),complete=new Set<Schema>();
  const acyclic=(schema:Schema):void=>{
    insist(!active.has(schema),'SCHEMA_CONFIGURATION');if(complete.has(schema))return;active.add(schema);
    const target=resolved.get(schema);if(target)acyclic(target);
    for(const child of [
      ...(schema.oneOf??[]),...(schema.allOf??[]),schema.not,schema.if,schema.then,schema.else,
      ...Object.values(schema.dependencies??{})
        .filter((dependency): dependency is Schema => typeof dependency === 'object' && !Array.isArray(dependency))
    ])if(child)acyclic(child);
    active.delete(schema);complete.add(schema);
  };
  for(const schema of visited)acyclic(schema);
  return resolved;
}
const resolvedReferences = auditSchemaBundle(schemas);
function matches(s: Schema, value: unknown): boolean {
  if (s.$ref) { const target = resolvedReferences.get(s); insist(target, 'SCHEMA_CONFIGURATION'); return matches(target, value); }
  if ('const' in s && canonical(value) !== canonical(s.const)) return false;
  if (s.enum && !s.enum.some(x => canonical(x) === canonical(value))) return false;
  if (s.oneOf && s.oneOf.filter(x => matches(x, value)).length !== 1) return false;
  if (s.allOf && !s.allOf.every(x => matches(x, value))) return false;
  if (s.not && matches(s.not, value)) return false;
  if (s.if && !matches(matches(s.if, value) ? s.then ?? {} : s.else ?? {}, value)) return false;
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some(t => t === 'null' ? value === null : t === 'array' ? Array.isArray(value) :
      t === 'integer' ? Number.isSafeInteger(value) :
      t === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value) : typeof value === t)) return false;
  }
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (length < (s.minLength ?? 0) || length > (s.maxLength ?? Infinity) ||
      (s.pattern && !new RegExp(s.pattern, 'u').test(value))) return false;
    if (s.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return false;
    if (s.format === 'date-time') {
      const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/u.exec(value);
      if (parts?.[0] !== value) return false;
      const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);
      const leap=year%4===0&&(year%100!==0||year%400===0);
      const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
      if(month<1||month>12||day<1||day>(days[month-1]??0)||Number(parts[4])>23||Number(parts[5])>59||Number(parts[6])>59)return false;
    }
    if (s.format === 'uri') { try { new URL(value); } catch { return false; } }
  }
  if (typeof value === 'number' && (value < (s.minimum ?? -Infinity) || value > (s.maximum ?? Infinity))) return false;
  if (Array.isArray(value) && s.contains && !value.some(item => matches(s.contains ?? {},item))) return false;
  if (Array.isArray(value) && (value.length < (s.minItems ?? 0) || value.length > (s.maxItems ?? Infinity) ||
    (s.items && !value.every(v => matches(s.items ?? {},v))) ||
    (s.uniqueItems && new Set(value.map(canonical)).size !== value.length))) return false;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const [key, dependency] of Object.entries(s.dependencies ?? {})) if (Object.hasOwn(record,key)) {
      if (Array.isArray(dependency) ? dependency.some(required => !Object.hasOwn(record,required)) :
        typeof dependency === 'boolean' ? !dependency : !matches(dependency,record)) return false;
    }
    if (Object.keys(record).length < (s.minProperties ?? 0) || Object.keys(record).length > (s.maxProperties ?? Infinity)) return false;
    if (s.propertyNames && !Object.keys(record).every(key => matches(s.propertyNames ?? {}, key))) return false;
    if (typeof s.additionalProperties === 'object' && Object.entries(record).some(([key, item]) =>
      !Object.hasOwn(s.properties ?? {}, key) && !matches(s.additionalProperties as Schema, item))) return false;
    if (s.required?.some(k => !Object.hasOwn(record,k))) return false;
    if (s.additionalProperties === false && Object.keys(record).some(k => !Object.hasOwn(s.properties ?? {},k))) return false;
    if (Object.entries(s.properties ?? {}).some(([k,v]) => Object.hasOwn(record,k) && !matches(v,record[k]))) return false;
  }
  return true;
}
/** Exact frozen schemas, including unknown-field rejection. Never echo validator input or errors. */
// The caller supplies its schema-corresponding wire type; validation is the narrowing boundary.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function validate<T>(name: string, value: unknown, definition?: string): T {
  let nodes=0;const pending:{value:unknown;depth:number}[]=[{value,depth:0}];
  while(pending.length){
    const entry=pending.pop();insist(entry&&entry.depth<=64&&++nodes<=1000000,'SCHEMA');
    if(entry.value&&typeof entry.value==='object')
      for(const child of Object.values(entry.value))pending.push({value:child,depth:entry.depth+1});
  }
  canonical(value);
  const root = schemas[`${name}.schema.json`];
  const schema=definition?root?.definitions?.[definition]:root;
  insist(schema && matches(schema,value), 'SCHEMA');
  return value as T;
}
export const identityKeys = [
  'schemaVersion','sessionId','workerId','ownerFence','scopeHash','contextId','contextRevision',
  'sourceRevision','configurationRevision','versions'
] as const;
export function identity(value: BridgeIdentity): BridgeIdentity {
  return Object.fromEntries(identityKeys.map(k => [k,value[k]])) as unknown as BridgeIdentity;
}
export function sameIdentity(a: BridgeIdentity, b: BridgeIdentity): boolean { return canonical(identity(a)) === canonical(identity(b)); }
