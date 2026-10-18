import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseDocumentJson} from './documentJson.js';
/**
 * A YAML reader and a JSON-Schema conformance checker, for AC-1.
 *
 * ## The reader
 *
 * `yaml` (a pinned **devDependency**, YAML 1.2, zero runtime dependencies of its own) parses the
 * document. It replaced a hand-rolled YAML subset reader that story 10.6 shipped while story
 * 10.1's contract was still unmerged: written against a small stub, it could not read the real
 * 1188-line document — `'409': { description: Ownership, sequence or transition conflict }` split
 * on the unquoted comma and threw. Five stories code against that contract and it keeps growing,
 * so a parser that has to be extended every time the document does is a liability, and the reader
 * is now a real one.
 *
 * **This does not spend AC-22a.** That gate is an allowlist over the resolved *production*
 * dependency closure, read off the lockfile entries npm did not mark `dev`. A devDependency never
 * enters that closure, never enters the image, and never runs in the browser-facing process; the
 * closure remains `playwright`, `playwright-core`, `typescript`, and `test/isolation.test.ts`
 * asserts exactly that on every run.
 *
 * It stays **deliberately strict**, because that is the property MED-3 was raised about: a parse
 * error *or a warning* throws, so a contract this cannot read fails the test loudly instead of
 * passing vacuously. Duplicate keys throw (`uniqueKeys`), and alias expansion is bounded.
 *
 * ## What the checker supports
 *
 * `$ref` (local), `type` (including 3.1 type arrays and 3.0 `nullable`), `required`, `properties`,
 * `additionalProperties`, `items`, `enum`, `const`, `allOf`, `anyOf`, `oneOf`. Unknown keywords
 * are ignored, which is safe: ignoring a keyword can only make the check weaker for that one
 * keyword, never wrong about the ones it does read.
 */
import { parseDocument } from 'yaml';

export type YamlValue = string | number | boolean | null | YamlValue[] | YamlMapping;
export interface YamlMapping {
  [key: string]: YamlValue;
}

function isMapping(value: unknown): value is YamlMapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a YAML document.
 *
 * Throws on anything the parser reports — errors and warnings alike — rather than returning a
 * partial tree. A document that cannot be read in full must not become a green conformance run.
 */
export function parseYaml(text: string): YamlValue {
  const document = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
  const problems = [...document.errors, ...document.warnings];
  if (problems.length > 0) {
    throw new Error(
      ['The YAML document could not be read:', ...problems.map((p) => `  ${p.message}`)].join('\n'),
    );
  }
  // `maxAliasCount` bounds alias expansion; an unbounded one is a denial-of-service on the parse.
  const value: unknown = document.toJS({ maxAliasCount: 100 });
  registerContext(value as YamlValue,value as YamlValue);
  return value as YamlValue;
}

// ── Schema conformance ────────────────────────────────────────────────────────────────────────

/**
 * Follows a chain of local `$ref`s from `node` to the node it names.
 *
 * Throws on a non-local pointer, a circular chain, and — the reason `contract-integrity.test.ts`
 * walks it over the whole document — a pointer that names nothing, with the message
 * `` `$ref does not resolve: ${pointer}` ``.
 *
 * Exported for that walk. It stays the *same* function the conformance checker below calls, so
 * the walk proves the resolver the checker actually uses, not a copy of it.
 */
const referenceContexts=new WeakMap<object,YamlValue>();
const documentIds=new WeakMap<object,number>();let nextDocumentId=0;
const observedBase='https://checks.citi.example/contracts/observed/v3/';
const observedDirectory=new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/',import.meta.url);
// The one contract generation (STUDIO-OBS-012A): every closed v3 schema the public document may
// name, listed once from the directory, plus the publication examples. Nothing else is readable.
const observedFiles=new Set([...readdirSync(fileURLToPath(observedDirectory)).filter(name=>/^[a-z-]+\.schema\.json$/u.test(name)),'publication-fixtures.json']);
const externalDocuments=new Map<string,YamlValue>();
function registerContext(node:YamlValue,document:YamlValue,seen=new WeakSet(),depth=0):void {
  if(typeof node!=='object'||node===null||seen.has(node))return;
  if(depth>64)throw new Error('Reference document depth exceeds64');seen.add(node);referenceContexts.set(node,document);
  for(const child of Object.values(node))registerContext(child,document,seen,depth+1);
}
function loadObservedDocument(file:string):YamlValue {
  if(!observedFiles.has(file)||file.includes('/')||file.includes('\\')||file.includes('%'))throw new Error('Observed reference file is not allowlisted');
  const cached=externalDocuments.get(file);if(cached!==undefined)return cached;
  const bytes=readFileSync(fileURLToPath(new URL(file,observedDirectory)));const limit=file==='publication-fixtures.json'?33554432:8388608;if(bytes.length>limit)throw new Error('Observed reference file exceeds bound');
  const document=parseDocumentJson(bytes,limit) as YamlValue;
  if(file.endsWith('.schema.json')&&(!isMapping(document)||document.$id!==observedBase+file))throw new Error('Observed canonical schema identity mismatch');
  registerContext(document,document);externalDocuments.set(file,document);return document;
}
export function resolveRef(document: YamlValue, node: YamlValue): YamlValue {
  let current=node;const seen=new Set<string>();
  for(let count=0;isMapping(current)&&typeof current.$ref==='string';count++){
    if(count>=64)throw new Error('Reference chain exceeds64');
    const pointer=current.$ref;let root=referenceContexts.get(current)??document,fragment=pointer;
    if(!pointer.startsWith('#/')){
      const prefix=pointer.startsWith('../studio-observed-authoring/contracts/v3/')?'../studio-observed-authoring/contracts/v3/':pointer.startsWith(observedBase)?observedBase:null;
      if(prefix===null)throw new Error(`Only local $ref is supported: ${pointer}`);
      const rest=pointer.slice(prefix.length),hash=rest.indexOf('#'),file=hash<0?rest:rest.slice(0,hash);fragment=hash<0?'':rest.slice(hash);root=loadObservedDocument(file);
    }
    if(typeof root!=='object'||root===null)throw new Error(`$ref does not resolve: ${pointer}`);
    if(!documentIds.has(root))documentIds.set(root,++nextDocumentId);
    const identity=String(documentIds.get(root))+':'+fragment;if(seen.has(identity))throw new Error(`Circular $ref: ${pointer}`);seen.add(identity);
    let target:YamlValue=root;
    if(fragment){if(!fragment.startsWith('#/'))throw new Error('Unsupported reference fragment');for(const raw of decodeURIComponent(fragment.slice(2)).split('/')){
      const segment=raw.replace(/~1/gu,'/').replace(/~0/gu,'~');if(['.','..','__proto__','prototype','constructor'].includes(segment))throw new Error('Unsafe reference segment');
      if(Array.isArray(target)){if(!/^(0|[1-9][0-9]*)$/u.test(segment))throw new Error(`$ref does not resolve: ${pointer}`);const next:YamlValue|undefined=target[Number(segment)];if(next===undefined)throw new Error(`$ref does not resolve: ${pointer}`);target=next;}
      else{if(!isMapping(target)||!Object.hasOwn(target,segment))throw new Error(`$ref does not resolve: ${pointer}`);const next:YamlValue|undefined=target[segment];if(next===undefined)throw new Error(`$ref does not resolve: ${pointer}`);target=next;}
    }}
    current=target;
  }
  return current;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(expected: string, value: unknown): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return expected === actual;
}

function asList(value: YamlValue | undefined): YamlValue[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Validates `value` against `schema`, resolving `$ref` against `document`.
 *
 * @returns every violation found, each prefixed with its JSON path. An empty array is conformance.
 */
export function validateAgainstSchema(
  value: unknown,
  schema: YamlValue,
  document: YamlValue,
  path = '$',
  depth = 0,
): string[] {
  if(depth>64)return [`${path}: schema recursion exceeds64`];
  const resolved = resolveRef(document, schema);
  if (!isMapping(resolved)) return [`${path}: schema is not an object`];
  const violations: string[] = [];

  const declared = resolved.type;
  const nullable = resolved.nullable === true;
  if (declared !== undefined && declared !== null) {
    const accepted = asList(declared).filter((entry): entry is string => typeof entry === 'string');
    const permitted = nullable ? [...accepted, 'null'] : accepted;
    if (permitted.length > 0 && !permitted.some((entry) => typeMatches(entry, value))) {
      violations.push(`${path}: expected type ${permitted.join('|')}, got ${typeOf(value)}`);
      // A type mismatch makes every nested check noise; report it and stop here.
      return violations;
    }
  }

  if (resolved.const !== undefined && value !== resolved.const) {
    violations.push(`${path}: expected const ${JSON.stringify(resolved.const)}`);
  }

  const enumValues = resolved.enum;
  if (Array.isArray(enumValues) && !enumValues.some((entry) => entry === value)) {
    violations.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(enumValues)}`);
  }

  if (isMapping(value) && !Array.isArray(value)) {
    const properties = isMapping(resolved.properties) ? resolved.properties : {};
    const patterns = isMapping(resolved.patternProperties) ? resolved.patternProperties : {};
    if (typeof resolved.maxProperties === 'number' && Object.keys(value).length > resolved.maxProperties) {
      violations.push(`${path}: too many properties`);
    }
    for (const name of asList(resolved.required)) {
      if (typeof name === 'string' && !Object.hasOwn(value, name)) {
        violations.push(`${path}.${name}: required property is missing`);
      }
    }
    for (const [name, entry] of Object.entries(value)) {
      const propertySchema = properties[name];
      if (propertySchema !== undefined) {
        violations.push(
          ...validateAgainstSchema(entry, propertySchema, document, `${path}.${name}`, depth+1),
        );
        continue;
      }
      const matchingPatterns = Object.entries(patterns).filter(([pattern]) => new RegExp(pattern, 'u').test(name));
      if (matchingPatterns.length > 0) {
        for (const [, patternSchema] of matchingPatterns) {
          violations.push(...validateAgainstSchema(entry, patternSchema, document, `${path}.${name}`, depth+1));
        }
        continue;
      }
      const additional = resolved.additionalProperties;
      if (additional === false) {
        violations.push(`${path}.${name}: property is not permitted by the contract`);
      } else if (isMapping(additional)) {
        violations.push(...validateAgainstSchema(entry, additional, document, `${path}.${name}`, depth+1));
      }
    }
  }

  if (Array.isArray(value) && resolved.items !== undefined && resolved.items !== null) {
    for (const [index, entry] of value.entries()) {
      violations.push(
        ...validateAgainstSchema(entry, resolved.items, document, `${path}[${String(index)}]`, depth+1),
      );
    }
  }

  for (const entry of asList(resolved.allOf)) {
    violations.push(...validateAgainstSchema(value, entry, document, path, depth+1));
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const branches = asList(resolved[keyword]);
    if (branches.length === 0) continue;
    const passing = branches.filter(
      (branch) => validateAgainstSchema(value, branch, document, path, depth+1).length === 0,
    );
    if (passing.length === 0) violations.push(`${path}: matches no ${keyword} branch`);
    if (keyword === 'oneOf' && passing.length > 1) {
      violations.push(`${path}: matches ${String(passing.length)} oneOf branches`);
    }
  }

  return violations;
}

// ── OpenAPI navigation ────────────────────────────────────────────────────────────────────────

export interface OperationLocation {
  readonly path: string;
  readonly method: string;
}

function operationAt(document: YamlValue, where: OperationLocation): YamlMapping {
  if (!isMapping(document)) throw new Error('The contract document is not a mapping.');
  const paths = document.paths;
  if (!isMapping(paths)) throw new Error('The contract document declares no paths.');
  const item = paths[where.path];
  if (!isMapping(item)) throw new Error(`The contract declares no path ${where.path}.`);
  const operation = item[where.method.toLowerCase()];
  if (!isMapping(operation)) {
    throw new Error(`The contract declares no ${where.method.toUpperCase()} ${where.path}.`);
  }
  return operation;
}

/** Whether the operation carries the `internal` tag AC-1 scopes conformance to. */
export function isInternal(document: YamlValue, where: OperationLocation): boolean {
  const tags = asList(operationAt(document, where).tags);
  return tags.some((tag) => tag === 'internal');
}

/** The `application/json` request-body schema of an `internal`-tagged operation. */
export function requestSchema(document: YamlValue, where: OperationLocation): YamlValue {
  const operation = operationAt(document, where);
  const body = resolveRef(document, operation.requestBody ?? null);
  if (!isMapping(body)) {
    throw new Error(`${where.method} ${where.path} declares no request body.`);
  }
  const content = resolveRef(document, body.content ?? null);
  if (!isMapping(content)) throw new Error(`${where.method} ${where.path} declares no content.`);
  const media = resolveRef(document, content['application/json'] ?? null);
  if (!isMapping(media) || media.schema === undefined) {
    throw new Error(`${where.method} ${where.path} declares no application/json request schema.`);
  }
  return media.schema;
}

/** The `application/json` response schema for one status code. */
export function responseSchema(
  document: YamlValue,
  where: OperationLocation,
  status: number,
): YamlValue {
  const operation = operationAt(document, where);
  const responses = resolveRef(document, operation.responses ?? null);
  if (!isMapping(responses)) {
    throw new Error(`${where.method} ${where.path} declares no responses.`);
  }
  const entry = resolveRef(document, responses[String(status)] ?? null);
  if (!isMapping(entry)) {
    throw new Error(`${where.method} ${where.path} declares no ${String(status)} response.`);
  }
  const content = resolveRef(document, entry.content ?? null);
  if (!isMapping(content)) {
    throw new Error(`${where.method} ${where.path} ${String(status)} declares no content.`);
  }
  const media = resolveRef(document, content['application/json'] ?? null);
  if (!isMapping(media) || media.schema === undefined) {
    throw new Error(
      `${where.method} ${where.path} ${String(status)} declares no application/json schema.`,
    );
  }
  return media.schema;
}
