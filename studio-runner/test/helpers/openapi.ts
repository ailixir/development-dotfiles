/**
 * A YAML-subset reader and a JSON-Schema conformance checker, for AC-1.
 *
 * ## Why this exists rather than a dependency
 *
 * AC-22a allowlists the resolved **production** dependency closure, and the story shipped with
 * zero dependencies added on either side of the line. Pulling in a YAML parser and a schema
 * validator to check a contract would spend that, so the two things the check actually needs are
 * written here instead, in `test/` where they are outside the image and outside the coverage gate.
 *
 * ## What the reader supports
 *
 * The subset an OpenAPI document uses: block mappings, block sequences, quoted and plain scalars,
 * flow sequences and mappings (`tags: [internal]`), `|`/`>` block scalars for descriptions, `#`
 * comments and `---` markers. It is **deliberately strict** — anything it does not recognise
 * throws rather than being skipped, so a contract it cannot read fails the test loudly instead of
 * passing vacuously. That is the failure mode MED-3 was raised about in the first place.
 *
 * ## What the checker supports
 *
 * `$ref` (local), `type` (including 3.1 type arrays and 3.0 `nullable`), `required`, `properties`,
 * `additionalProperties`, `items`, `enum`, `const`, `allOf`, `anyOf`, `oneOf`. Unknown keywords
 * are ignored, which is safe: ignoring a keyword can only make the check weaker for that one
 * keyword, never wrong about the ones it does read.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | YamlMapping;
export interface YamlMapping {
  [key: string]: YamlValue;
}

interface Line {
  readonly indent: number;
  readonly content: string;
  readonly raw: string;
  readonly number: number;
}

function isMapping(value: unknown): value is YamlMapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strips a trailing `#` comment that is not inside quotes. */
function stripComment(text: string): string {
  let quote: string | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '#' && (index === 0 || text[index - 1] === ' ')) {
      return text.slice(0, index);
    }
  }
  return text;
}

function unquote(text: string): string {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text
      .slice(1, -1)
      .replace(/\\n/gu, '\n')
      .replace(/\\"/gu, '"')
      .replace(/\\\\/gu, '\\');
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/gu, "'");
  }
  return text;
}

/** Splits on top-level separators, respecting quotes and nested flow brackets. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const character of text) {
    if (quote !== null) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '[' || character === '{') depth += 1;
    if (character === ']' || character === '}') depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

function parseScalar(text: string): YamlValue {
  const value = text.trim();
  if (value === '' || value === '~' || value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error(`Unterminated flow sequence: ${value}`);
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner, ',').map((item) => parseScalar(item));
  }
  if (value.startsWith('{')) {
    if (!value.endsWith('}')) throw new Error(`Unterminated flow mapping: ${value}`);
    const inner = value.slice(1, -1).trim();
    const mapping: YamlMapping = {};
    if (inner === '') return mapping;
    for (const entry of splitTopLevel(inner, ',')) {
      const split = splitKey(entry.trim());
      if (split === null) throw new Error(`Malformed flow mapping entry: ${entry}`);
      mapping[split.key] = parseScalar(split.rest);
    }
    return mapping;
  }
  if (/^-?\d+$/u.test(value)) return Number(value);
  if (/^-?\d*\.\d+$/u.test(value)) return Number(value);
  return unquote(value);
}

/** Finds the `key:` separator that is outside quotes and outside flow brackets. */
function splitKey(text: string): { key: string; rest: string } | null {
  let quote: string | null = null;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') depth += 1;
    if (character === ']' || character === '}') depth -= 1;
    if (character === ':' && depth === 0) {
      const next = text[index + 1];
      if (next === undefined || next === ' ') {
        return { key: unquote(text.slice(0, index).trim()), rest: text.slice(index + 1).trim() };
      }
    }
  }
  return null;
}

/**
 * Normalises the document into logical lines, splitting `- key: value` into a `-` marker line and
 * the entry at the column the entry actually starts in. Everything downstream then sees sequences
 * and mappings in one shape.
 */
function toLines(text: string): Line[] {
  const lines: Line[] = [];
  const rawLines = text.split('\n');
  for (const [offset, raw] of rawLines.entries()) {
    const withoutComment = stripComment(raw);
    if (withoutComment.trim() === '' || withoutComment.trim() === '---') continue;
    let indent = withoutComment.length - withoutComment.trimStart().length;
    let content = withoutComment.trim();
    if (withoutComment.includes('\t')) {
      throw new Error(`Tab indentation on line ${String(offset + 1)} is not valid YAML.`);
    }
    while (content === '-' || content.startsWith('- ')) {
      lines.push({ indent, content: '-', raw, number: offset + 1 });
      if (content === '-') {
        content = '';
        break;
      }
      const after = content.slice(1);
      const trimmed = after.trimStart();
      indent += 1 + (after.length - trimmed.length);
      content = trimmed;
    }
    if (content === '') continue;
    lines.push({ indent, content, raw, number: offset + 1 });
  }
  return lines;
}

interface Cursor {
  index: number;
}

function parseBlock(lines: readonly Line[], cursor: Cursor, indent: number): YamlValue {
  const line = lines[cursor.index];
  if (line === undefined) return null;
  if (line.content === '-') return parseSequence(lines, cursor, indent);
  if (splitKey(line.content) !== null) return parseMapping(lines, cursor, indent);
  // A bare scalar block — the item of a sequence of plain strings. Valid only as a lone line at
  // this indentation; anything else is a shape the reader does not understand, and it says so
  // rather than guessing.
  const next = lines[cursor.index + 1];
  if (next !== undefined && next.indent >= indent) {
    throw new Error(`Line ${String(line.number)} is not a mapping entry: ${line.content}`);
  }
  cursor.index += 1;
  return parseScalar(line.content);
}

function parseSequence(lines: readonly Line[], cursor: Cursor, indent: number): YamlValue[] {
  const items: YamlValue[] = [];
  while (cursor.index < lines.length) {
    const line = lines[cursor.index];
    if (line?.indent !== indent || line.content !== '-') break;
    cursor.index += 1;
    const next = lines[cursor.index];
    if (next !== undefined && next.indent > indent) {
      items.push(parseBlock(lines, cursor, next.indent));
    } else {
      items.push(null);
    }
  }
  return items;
}

/** Consumes a `|` or `>` block scalar's body: every following line indented past the key. */
function parseBlockScalar(
  lines: readonly Line[],
  cursor: Cursor,
  indent: number,
  folded: boolean,
): string {
  const parts: string[] = [];
  while (cursor.index < lines.length) {
    const line = lines[cursor.index];
    if (line === undefined || line.indent <= indent) break;
    parts.push(line.content);
    cursor.index += 1;
  }
  return folded ? parts.join(' ') : parts.join('\n');
}

function parseMapping(lines: readonly Line[], cursor: Cursor, indent: number): YamlMapping {
  const mapping: YamlMapping = {};
  while (cursor.index < lines.length) {
    const line = lines[cursor.index];
    if (line?.indent !== indent || line.content === '-') break;
    const split = splitKey(line.content);
    if (split === null) {
      throw new Error(`Line ${String(line.number)} is not a mapping entry: ${line.content}`);
    }
    cursor.index += 1;
    const { key, rest } = split;
    if (rest.startsWith('|') || rest.startsWith('>')) {
      mapping[key] = parseBlockScalar(lines, cursor, indent, rest.startsWith('>'));
      continue;
    }
    if (rest !== '') {
      mapping[key] = parseScalar(rest);
      continue;
    }
    const next = lines[cursor.index];
    if (next === undefined || (next.indent < indent && next.content !== '-')) {
      mapping[key] = null;
      continue;
    }
    if (next.indent > indent) {
      mapping[key] = parseBlock(lines, cursor, next.indent);
      continue;
    }
    if (next.indent === indent && next.content === '-') {
      // A sequence written at the key's own indentation, which YAML permits.
      mapping[key] = parseSequence(lines, cursor, indent);
      continue;
    }
    mapping[key] = null;
  }
  return mapping;
}

/** Parses the YAML subset an OpenAPI document uses. Throws on anything it does not recognise. */
export function parseYaml(text: string): YamlValue {
  const lines = toLines(text);
  if (lines.length === 0) return null;
  const cursor: Cursor = { index: 0 };
  const value = parseBlock(lines, cursor, lines[0]?.indent ?? 0);
  if (cursor.index !== lines.length) {
    const line = lines[cursor.index];
    throw new Error(
      `Unconsumed content at line ${String(line?.number ?? 0)}: ${line?.content ?? ''}`,
    );
  }
  return value;
}

// ── Schema conformance ────────────────────────────────────────────────────────────────────────

function resolveRef(document: YamlValue, node: YamlValue): YamlValue {
  let current = node;
  const seen = new Set<string>();
  while (isMapping(current) && typeof current.$ref === 'string') {
    const pointer = current.$ref;
    if (!pointer.startsWith('#/')) throw new Error(`Only local $ref is supported: ${pointer}`);
    if (seen.has(pointer)) throw new Error(`Circular $ref: ${pointer}`);
    seen.add(pointer);
    let target: YamlValue = document;
    for (const rawSegment of pointer.slice(2).split('/')) {
      const segment = rawSegment.replace(/~1/gu, '/').replace(/~0/gu, '~');
      if (!isMapping(target)) throw new Error(`$ref does not resolve: ${pointer}`);
      const next = target[segment];
      if (next === undefined) throw new Error(`$ref does not resolve: ${pointer}`);
      target = next;
    }
    current = target;
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
): string[] {
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
    for (const name of asList(resolved.required)) {
      if (typeof name === 'string' && !Object.hasOwn(value, name)) {
        violations.push(`${path}.${name}: required property is missing`);
      }
    }
    for (const [name, entry] of Object.entries(value)) {
      const propertySchema = properties[name];
      if (propertySchema !== undefined) {
        violations.push(
          ...validateAgainstSchema(entry, propertySchema, document, `${path}.${name}`),
        );
        continue;
      }
      const additional = resolved.additionalProperties;
      if (additional === false) {
        violations.push(`${path}.${name}: property is not permitted by the contract`);
      } else if (isMapping(additional)) {
        violations.push(...validateAgainstSchema(entry, additional, document, `${path}.${name}`));
      }
    }
  }

  if (Array.isArray(value) && resolved.items !== undefined && resolved.items !== null) {
    for (const [index, entry] of value.entries()) {
      violations.push(
        ...validateAgainstSchema(entry, resolved.items, document, `${path}[${String(index)}]`),
      );
    }
  }

  for (const entry of asList(resolved.allOf)) {
    violations.push(...validateAgainstSchema(value, entry, document, path));
  }
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const branches = asList(resolved[keyword]);
    if (branches.length === 0) continue;
    const passing = branches.filter(
      (branch) => validateAgainstSchema(value, branch, document, path).length === 0,
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
