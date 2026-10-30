/* global Buffer */
// SPK-07 request builders: faithful JS ports of what the Studio backend sends to the model. Screening evidence only.
//
// Ported sources (backend/src/main/java/com/citi/put/checks/studio/guided/...):
//  - translation/GuidedPromptAssembler.java   buildPositiveContext (field order, projections), providerSchema(kind)
//  - translation/GuidedAuthoredUriCandidates  the `sourceReferences` suggestions of an initial SOURCE_PLAN
//  - translation/GuidedSourceInputResolver    quotedSpans
//  - bridge/GuidedSourceReferenceValidator    Source.approves / resolveSourceOnly (source-only checks)
//  - bridge/SourceTemplate, navigation/AllowedDomains (hostOf, allows)
//  - translation/GuidedProposalValidator      admitPlan (obligationId assignment) ; GuidedTranslationService.capturePromptInputsLocked
//  - translation/GenAiGuidedLlmGatewayClient  payload() envelope and config()
// Wire shape: contents[0].parts[0].text = JSON {kind, requestId, attempt, context}; systemInstruction = guided-output-contract.md;
// generationConfig = {maxOutputTokens:4096, responseMimeType, responseJsonSchema, thinkingConfig:{thinkingLevel:'LOW'}}; no temperature.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The production inputs are read from a byte copy frozen with SPK-07 (guided-output-contract.md sha256 bbb6726e...), never from the live files:
// later production edits must not change the frozen spike. contracts/ is hashed by freeze.mjs, so the copy is tamper-evident.
const FROZEN_PRODUCTION = new URL('../contracts/frozen-production/', import.meta.url);
export const CONTRACT_PATH = fileURLToPath(new URL('guided-output-contract.md', FROZEN_PRODUCTION));
export const SCHEMA_DIR = fileURLToPath(new URL('v3/', FROZEN_PRODUCTION));
const TEMPLATES = new URL('../templates/', import.meta.url);
export const MAX_OUTPUT_TOKENS = 4096;
export const GATEWAY_MAX_INPUT_BYTES = 262144;
export const TRANSLATION_MAX_INPUT_BYTES = 65536;
const SCHEMA_URL_PREFIX = 'https://checks.citi.example/contracts/observed/v3/';

const deepCopy = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// ---------------------------------------------------------------------------------------------------------------------
// canonical-v1 (GuidedContracts.canonical): sorted keys, JSON.stringify strings. Only the length and equality are used.
export function canonical(node) {
  if (Array.isArray(node)) return `[${node.map(canonical).join(',')}]`;
  if (node && typeof node === 'object') return `{${Object.keys(node).sort().map(key => `${JSON.stringify(key)}:${canonical(node[key])}`).join(',')}}`;
  return JSON.stringify(node);
}
export const sha256Hex = text => createHash('sha256').update(text).digest('hex');
export const canonicalHash = node => sha256Hex(canonical(node));

// ---------------------------------------------------------------------------------------------------------------------
// providerSchema(kind): GuidedPromptAssembler.buildProviderSchema.
let schemaInputs = null;
function inputs() {
  if (!schemaInputs) {
    schemaInputs = new Map();
    for (const name of ['guided-model-response.schema.json', 'source-selection.schema.json', 'planning-context.schema.json']) schemaInputs.set(name, JSON.parse(readFileSync(SCHEMA_DIR + name, 'utf8')));
  }
  return schemaInputs;
}
const DROPPED = new Set(['$schema', '$id', 'title', 'description', 'allOf', 'if', 'then', 'else', 'not', 'pattern', 'uniqueItems', 'maxItems', 'minLength', 'maxLength']);

function providerNode(node) {
  if (Array.isArray(node)) return node.map(providerNode);
  if (node === null || typeof node !== 'object') return deepCopy(node);
  if ('$ref' in node) {
    const reference = String(node.$ref);
    if (!reference.startsWith(SCHEMA_URL_PREFIX)) throw new Error('Unsupported pinned guided schema reference');
    const local = reference.slice(SCHEMA_URL_PREFIX.length).split('#');
    if (local.length > 2 || !/^[a-z0-9-]+\.schema\.json$/u.test(local[0]) || (local.length === 2 && !/^\/definitions\/[A-Za-z0-9]+$/u.test(local[1]))) throw new Error('Unsupported pinned guided schema reference');
    if (!inputs().has(local[0])) inputs().set(local[0], JSON.parse(readFileSync(SCHEMA_DIR + local[0], 'utf8')));
    let referenced = inputs().get(local[0]);
    if (local.length === 2) referenced = referenced?.definitions?.[local[1].slice('/definitions/'.length)];
    if (referenced === null || typeof referenced !== 'object' || Array.isArray(referenced)) throw new Error('Missing pinned guided schema');
    return providerNode(referenced);
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    if (key === 'const') {
      if (typeof value === 'string') { result.type = 'string'; result.enum = [value]; }
      else if (Number.isInteger(value)) { result.type = 'integer'; result.minimum = value; result.maximum = value; }
      else if (typeof value === 'boolean') result.type = 'boolean';
      else if (value === null) result.type = 'null';
    } else if (key === 'properties') {
      result.properties = {};
      for (const [name, property] of Object.entries(value)) result.properties[name] = providerNode(property);
    } else result[key === 'oneOf' ? 'anyOf' : key] = providerNode(value);
  }
  return result;
}

function countSchemas(node, counts, shapes) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const text = canonical(node);
    if ('type' in node && text.length > 120) { counts.set(text, (counts.get(text) ?? 0) + 1); if (!shapes.has(text)) shapes.set(text, node); }
    for (const child of Object.values(node)) countSchemas(child, counts, shapes);
  } else if (Array.isArray(node)) for (const child of node) countSchemas(child, counts, shapes);
}

function compactSchema(node, names, defining) {
  if (Array.isArray(node)) return node.map(child => compactSchema(child, names, defining));
  if (node === null || typeof node !== 'object') return deepCopy(node);
  const text = canonical(node);
  if (names.has(text) && text !== defining) return { $ref: `#/$defs/${names.get(text)}` };
  const result = {};
  for (const [key, value] of Object.entries(node)) result[key] = compactSchema(value, names, defining);
  return result;
}

const providerSchemas = new Map();
export function providerSchema(kind) {
  if (!providerSchemas.has(kind)) {
    const alternatives = [];
    for (const candidate of inputs().get('guided-model-response.schema.json').oneOf ?? []) {
      const kindSchema = candidate?.properties?.kind ?? {};
      if (kindSchema.const === kind || (kindSchema.enum ?? []).includes(kind)) alternatives.push(providerNode(candidate));
    }
    const expanded = alternatives.length === 1 ? alternatives[0] : { anyOf: alternatives };
    const counts = new Map(); const shapes = new Map();
    countSchemas(expanded, counts, shapes);
    const names = new Map();
    for (const [shape, count] of counts) if (count > 1) names.set(shape, `Shape${names.size}`);
    const compact = compactSchema(expanded, names, null);
    if (names.size > 0) {
      compact.$defs = {};
      for (const [shape, name] of names) compact.$defs[name] = compactSchema(shapes.get(shape), names, shape);
    }
    providerSchemas.set(kind, compact);
  }
  return deepCopy(providerSchemas.get(kind));
}

export function outputContract() { return readFileSync(CONTRACT_PATH, 'utf8'); }

// ---------------------------------------------------------------------------------------------------------------------
// sourceReferences suggestions (GuidedAuthoredUriCandidates). Source-only: no configuration values are read.
const REFERENCE_CAP = 200;
const LITERAL_SLOTS = ['fill.value', 'selectOption.value', 'assert.expected'];
// Java: Character.isWhitespace(cp) || Character.isSpaceChar(cp) = Zs|Zl|Zp plus \t \n \u000B \f \r and U+001C..U+001F.
const isSpace = codePoint => /^[\p{Zs}\p{Zl}\p{Zp}]$/u.test(String.fromCodePoint(codePoint)) || (codePoint >= 9 && codePoint <= 13) || (codePoint >= 28 && codePoint <= 31);
const isQuote = c => c === '"' || c === '\'' || c === '`';
const startsWithAt = (text, prefix, at) => text.startsWith(prefix, at);
const scheme = (text, at) => startsWithAt(text, 'http://', at) || startsWithAt(text, 'https://', at);
const charCount = codePoint => (codePoint > 0xffff ? 2 : 1);

function tokenEnd(text, from) {
  let at = from;
  while (at < text.length && !isSpace(text.codePointAt(at))) at += charCount(text.codePointAt(at));
  return at;
}
function ambiguousUnquoted(value) {
  if ('.,;:!?)]}>'.includes(value[value.length - 1])) return true;
  for (let at = 0; at < value.length; at++) {
    const c = value[at];
    if (isQuote(c) || '()[]{}<>,;\\'.includes(c) || (at > 0 && scheme(value, at))) return true;
  }
  return false;
}

/** GuidedAuthoredUriCandidates.literals: URI-looking literals, quoted or bare. */
export function literals(text) {
  const result = [];
  let at = 0;
  while (at < text.length) {
    if (isSpace(text.codePointAt(at))) { at += charCount(text.codePointAt(at)); continue; }
    let start = at; let end;
    const quote = text[at];
    if (isQuote(quote)) {
      start++; end = start;
      let ambiguous = false;
      while (end < text.length && text[end] !== quote) { ambiguous ||= isQuote(text[end]) || text[end] === '\\'; end += charCount(text.codePointAt(end)); }
      if (end === text.length) break;
      at = tokenEnd(text, end + 1);
      for (let suffix = end + 1; suffix < at; suffix++) ambiguous ||= isQuote(text[suffix]) || text[suffix] === '\\';
      if (!ambiguous && scheme(text, start) && end > start) result.push([start, end]);
    } else {
      end = tokenEnd(text, at); at = end;
      if (scheme(text, start) && !ambiguousUnquoted(text.slice(start, end))) result.push([start, end]);
    }
  }
  return result;
}

const CLOSING = { '"': '"', '\'': '\'', '`': '`', '“': '”', '‘': '’' };
/** GuidedSourceInputResolver.quotedSpans: content offsets of each non-empty quoted literal. */
export function quotedSpans(text) {
  const found = [];
  for (let i = 0; i < text.length; i++) {
    const close = CLOSING[text[i]];
    const end = close === undefined ? -1 : text.indexOf(close, i + 1);
    if (end > i + 1) { found.push([i + 1, end]); i = end; }
  }
  return found;
}

/** AllowedDomains.hostOf: lowercase punycode-shaped DNS host of an http(s) URL, or null (IP literals refused). */
export function hostOf(url) {
  if (typeof url !== 'string') return null;
  for (let i = 0; i < url.length; i++) { const c = url.charCodeAt(i); if (c === 0x5c || c <= 0x20 || c === 0x7f) return null; }
  let schemeLength;
  if (/^https:\/\//iu.test(url)) schemeLength = 8; else if (/^http:\/\//iu.test(url)) schemeLength = 7; else return null;
  let end = url.length;
  for (let i = schemeLength; i < url.length; i++) { if ('/?#'.includes(url[i])) { end = i; break; } }
  const authority = url.slice(schemeLength, end);
  if (!authority || /[@%[\]]/u.test(authority)) return null;
  let host = authority;
  const colon = authority.indexOf(':');
  if (colon >= 0) {
    host = authority.slice(0, colon);
    const port = authority.slice(colon + 1);
    if (!/^\d{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  }
  let ascii;
  try { ascii = new URL(`http://${host}`).hostname; } catch { return null; } // WHATWG domainToASCII is the IDN.toASCII stand-in
  ascii = ascii.toLowerCase();
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(ascii) ? ascii : null;
}
/** Deployment default today: allow-all on. `domains` may be { allowAll, entries } or a custom predicate for tests. */
export function makeAllows(domains = { allowAll: true, entries: [] }) {
  if (typeof domains === 'function') return domains;
  return url => {
    const host = hostOf(url);
    if (host === null) return false;
    if (domains.allowAll) return true;
    return (domains.entries ?? []).some(entry => host === entry || host.endsWith(`.${entry}`));
  };
}

const VARIABLE = /<var\s+([A-Za-z0-9_.-]{1,64})>/gu;
const SECRET = /<secret\s+[A-Za-z0-9_.-]{1,64}>/gu;
const tokens = (pattern, text) => [...text.matchAll(pattern)].map(m => ({ start: m.index, end: m.index + m[0].length, name: m[1] ?? '' }));
const variableNames = (text, start, end) => tokens(VARIABLE, text).filter(t => t.start >= start && t.end <= end);

/** GuidedSourceReferenceValidator.Source.approves, over the classifier's regions (text between <var>/<secret> tokens). */
function regionsOf(text) {
  const regions = []; let previous = 0;
  for (const match of text.matchAll(/<(var|secret)\s+([A-Za-z0-9_.-]{1,64})>/gu)) {
    if (previous < match.index) regions.push([previous, match.index]);
    previous = match.index + match[0].length;
  }
  if (previous < text.length) regions.push([previous, text.length]);
  return regions;
}
function approves(source, start, end) {
  if (source.regions.some(([a, b]) => a <= start && b >= end)) return true;
  const { text } = source;
  const vars = tokens(VARIABLE, text);
  const has = vars.some(t => t.start >= start && t.end <= end);
  const whole = vars.some(t => t.start === start && t.end === end);
  const splits = vars.some(t => (t.start < start && start < t.end) || (t.start < end && end < t.end));
  const overlapsSecret = tokens(SECRET, text).some(t => start < t.end && end > t.start);
  if (!has || whole || splits || overlapsSecret) return false;
  const cover = [...source.regions, ...vars.map(t => [t.start, t.end])].sort((x, y) => x[0] - y[0]);
  let from = -1; let to = -1;
  for (const [a, b] of cover) {
    if (a > to) { if (from <= start && to >= end) return true; from = a; to = b; } else to = Math.max(to, b);
  }
  return from <= start && to >= end;
}
const boundary = (text, offset) => offset === 0 || offset === text.length || !(/[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
const wellFormed = text => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);

/** resolveSourceOnly, reduced to the checks that can refuse a source-only suggestion. Returns a closed refusal code or null. */
function sourceOnlyRefusal(source, candidate, allows) {
  const { startUtf16: start, endUtf16: end, kind } = candidate;
  if (!(start < end && end <= source.text.length && boundary(source.text, start) && boundary(source.text, end))) return 'INVALID_CONTRACT';
  if (!approves(source, start, end)) return 'FORBIDDEN_SCOPE';
  const template = variableNames(source.text, start, end).length > 0;
  if (template && kind === 'destination') return 'FORBIDDEN_SCOPE';
  const value = source.text.slice(start, end);
  if (Buffer.byteLength(value, 'utf8') > 4096) return 'INVALID_CONTRACT';
  if (!wellFormed(value)) return 'INVALID_CONTRACT';
  if (kind === 'destination' && !(value.length <= 2048 && allows(value))) return 'ORIGIN_NOT_ALLOWED';
  return null;
}

/**
 * GuidedAuthoredUriCandidates.candidates(session, manifest): the initial SOURCE_PLAN suggestions.
 * @param {{stepId:string,text:string}[]} sourceSteps  @param {{sourceRevision:string, allows?:(url:string)=>boolean, stepIds?:Set<string>}} options
 */
export function sourceReferenceCandidates(sourceSteps, { sourceRevision = '1', allows = makeAllows(), stepIds = null } = {}) {
  const result = [];
  if (!Array.isArray(sourceSteps) || sourceSteps.length > 100) return result;
  const sources = new Map();
  for (const step of sourceSteps) {
    if (typeof step.text !== 'string' || step.text.length > 4000 || !wellFormed(step.text)) return result;
    if (sources.has(step.stepId)) return result;
    sources.set(step.stepId, { text: step.text, regions: regionsOf(step.text) });
  }
  const seen = new Set();
  let checked = 0;
  const make = (stepId, [start, end], kind, intendedSlot) => ({ referenceKind: 'sourceSpan', sourceRevision, stepId, startUtf16: start, endUtf16: end, kind, intendedSlot });
  for (const [stepId, source] of sources) {
    if (stepIds && !stepIds.has(stepId)) continue;
    for (const span of literals(source.text)) {
      if (!approves(source, span[0], span[1])) continue;
      const candidate = make(stepId, span, 'destination', 'navigate.destination');
      const key = canonical(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      if (checked === REFERENCE_CAP) return result;
      checked++;
      const refusal = sourceOnlyRefusal(source, candidate, allows);
      if (refusal === null) result.push(candidate);
      else if (!['INVALID_CONTRACT', 'ORIGIN_NOT_ALLOWED', 'FORBIDDEN_SCOPE', 'REVISION_CONFLICT'].includes(refusal)) throw new Error(refusal);
    }
  }
  for (const [stepId, source] of sources) {
    if (stepIds && !stepIds.has(stepId)) continue;
    for (const span of quotedSpans(source.text)) {
      if (scheme(source.text, span[0])) continue; // already offered above as a destination
      if (!approves(source, span[0], span[1])) continue;
      for (const slot of LITERAL_SLOTS) {
        const candidate = make(stepId, span, 'nonsecretText', slot);
        if (checked === REFERENCE_CAP) return result;
        checked++;
        const refusal = sourceOnlyRefusal(source, candidate, allows);
        if (refusal === null) { const key = canonical(candidate); if (!seen.has(key)) { seen.add(key); result.push(candidate); } }
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------
// buildPositiveContext: field order and projections exactly as GuidedPromptAssembler.buildPositiveContext.
const maskSecretTokens = text => text.replace(/<secret\s+[A-Za-z0-9_.-]{1,64}>/gu, match => ' '.repeat(match.length));
const OBLIGATION_KEYS = ['obligationId', 'stepId', 'occurrence', 'operationKind', 'targetIntent', 'scopeIntent', 'referenceIndex', 'needId', 'predicate'];

/**
 * @param {'SOURCE_PLAN'|'NEXT_ACTION'} kind
 * @param {object} session  {sessionId, scopeHash, scope:{sourceRevision, configurationRevision}, sourceSteps:[{stepId}]}
 * @param {object} progress {stepIndex, translationOrdinal, contextRevision, observation?, executionEvidence?, authoredInputsHash?, learningWindow?}
 * @param {object} state    {manifest:{sourceSteps:[{stepId,text}], configurationReferences, authoringContext}, plan?:{sourceReferences, needs}}
 */
export function buildPositiveContext(kind, session, progress, state, safeInputs, remaining, selectedSources, repairCodes, { allows = makeAllows() } = {}) {
  const context = { schemaVersion: 3, sessionId: session.sessionId, scopeHash: session.scopeHash };
  for (const key of ['sourceRevision', 'configurationRevision']) context[key] = session.scope?.[key];
  const manifest = state.manifest ?? {};
  context.sourceSteps = (manifest.sourceSteps ?? []).map(step => ({ stepId: step.stepId, text: maskSecretTokens(step.text) }));
  context.configurationReferences = manifest.configurationReferences ?? [];
  context.authoringContext = manifest.authoringContext ?? [];
  context.clarificationSelections = selectedSources;
  context.inputs = safeInputs;
  if (kind === 'SOURCE_PLAN' && progress.learningWindow !== undefined) context.learningWindow = progress.learningWindow;
  if (kind === 'SOURCE_PLAN') {
    const references = [];
    if (state.plan) throw new Error('SPK07_UNSUPPORTED existing-plan SOURCE_PLAN (incremental re-learn) is outside this benchmark');
    if (progress.learningWindow === undefined && Array.isArray(selectedSources) && selectedSources.length === 0) {
      references.push(...sourceReferenceCandidates(manifest.sourceSteps ?? [], { sourceRevision: manifest.sourceRevision ?? session.scope?.sourceRevision, allows }));
    }
    context.sourceReferences = references;
  }
  context.obligations = remaining.map(item => { const safe = {}; for (const key of OBLIGATION_KEYS) safe[key] = item[key] ?? null; if ('selectedLocator' in item) safe.selectedLocator = item.selectedLocator; return safe; });
  context.needs = (state.plan?.needs ?? []).map(need => ({ needId: need.needId, producerStepId: need.producerStepId, consumers: need.consumers, bindingId: need.bindingId ?? null }));
  context.observation = progress.observation ?? null;
  context.executionEvidence = progress.executionEvidence ?? null;
  const steps = session.sourceSteps;
  context.coordinate = { stepId: steps[Math.min(progress.stepIndex ?? 0, steps.length - 1)].stepId, ordinal: progress.translationOrdinal ?? 0 };
  context.authoredInputsHash = progress.authoredInputsHash ?? null;
  context.contextRevision = progress.contextRevision ?? 0;
  context.repairCodes = [...repairCodes];
  return context;
}

// ---------------------------------------------------------------------------------------------------------------------
// Vertex wire body (GenAiGuidedLlmGatewayClient.payload/config; shape confirmed against the captured bodies).
export function wireBody({ kind, requestId, attempt, context, observation, system }) {
  const ctx = observation === undefined ? context : { ...context, observation };
  const envelope = { kind, requestId, attempt, context: ctx };
  return {
    contents: [{ parts: [{ text: JSON.stringify(envelope) }], role: 'user' }],
    systemInstruction: { parts: [{ text: system ?? outputContract() }], role: 'user' },
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: 'application/json', responseJsonSchema: providerSchema(kind), thinkingConfig: { thinkingLevel: 'LOW' } },
  };
}

/** The pieces of a wire body that decide admission: the gateway checks utf8(payload) + utf8(outputContract) against its input cap. */
export function bodyMetrics(body) {
  const payloadBytes = Buffer.byteLength(body.contents[0].parts[0].text, 'utf8');
  const systemBytes = Buffer.byteLength(body.systemInstruction.parts[0].text, 'utf8');
  const bodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
  // GuidedTranslationService (~l.1620-1636) refuses BUDGET_EXCEEDED before the gateway when
  // utf8({contents: <payload string>, systemInstruction, responseJsonSchema}) + 2048 > translation.maxInputBytes (default 65536,
  // no override in application*.yml; the validated maximum is 131072). That is tighter than the gateway's own 262144 cap.
  const wire = { contents: body.contents[0].parts[0].text, systemInstruction: body.systemInstruction.parts[0].text, responseJsonSchema: body.generationConfig.responseJsonSchema };
  const translationInputBytes = Buffer.byteLength(JSON.stringify(wire), 'utf8') + 2048;
  return { payloadBytes, systemBytes, bodyBytes, gatewayInputBytes: payloadBytes + systemBytes, gatewayInputAdmitted: payloadBytes + systemBytes <= GATEWAY_MAX_INPUT_BYTES && bodyBytes <= GATEWAY_MAX_INPUT_BYTES,
    translationInputBytes, translationInputAdmitted: translationInputBytes <= TRANSLATION_MAX_INPUT_BYTES };
}

export const newRequestId = () => `translation-${sha256Hex(randomUUID())}`;

/** A benchmark "session": stable ids for one task (step ids, session id, scope hash, context id). */
export function makeSession(task, { steps = null } = {}) {
  const chosen = steps ?? task.steps.map(step => step.text);
  const sourceSteps = chosen.map(text => ({ stepId: randomUUID(), text }));
  const sessionId = randomUUID();
  return { sessionId, scopeHash: sha256Hex(`spk07:${task.id}`), contextId: randomUUID(), scope: { sourceRevision: '1', configurationRevision: '1' }, sourceSteps, manifest: { sourceRevision: '1', configurationRevision: '1', sourceSteps: sourceSteps.map(s => ({ stepId: s.stepId, text: s.text })), configurationReferences: [], authoringContext: [] } };
}

/** SOURCE_PLAN request as the backend sends it for a first learn (no plan, no observation, no inputs). */
export function buildSourcePlanRequest({ session, attempt = 1, repairCodes = [], requestId = newRequestId(), allows } = {}) {
  const state = { manifest: session.manifest };
  const progress = { stepIndex: 0, translationOrdinal: 0, contextRevision: 0 };
  const context = buildPositiveContext('SOURCE_PLAN', session, progress, state, [], [], [], repairCodes, { allows });
  return { kind: 'SOURCE_PLAN', requestId, attempt, context, body: wireBody({ kind: 'SOURCE_PLAN', requestId, attempt, context }) };
}

const NEED_SLOTS = { fill: 'fill.value', selectOption: 'selectOption.value', assert: 'assert.expected' };
const VALUE_PREDICATES = new Set(['containsText', 'hasValue', 'url', 'title']);

/**
 * GuidedProposalValidator.deriveNeeds (ADR-SC-007 WI-1): the server, not the model, derives `needs` from the obligations that
 * share a needId. Producer = the read; consumers = fill, selectOption and assert-with-an-expected-value obligations carrying that
 * needId, as {stepId, argumentSlot} deduped by (stepId, slot); order = first appearance of the read. Never throws.
 */
export function deriveNeeds(obligations) {
  const needs = new Map();
  for (const o of obligations) {
    if (o.operationKind === 'read' && typeof o.needId === 'string' && !needs.has(o.needId)) needs.set(o.needId, { needId: o.needId, producerStepId: o.stepId, consumers: [] });
  }
  for (const o of obligations) {
    const slot = NEED_SLOTS[o.operationKind];
    const consumes = slot !== undefined && typeof o.needId === 'string' && (o.operationKind !== 'assert' || VALUE_PREDICATES.has(o.predicate));
    const need = consumes ? needs.get(o.needId) : undefined;
    if (need && !need.consumers.some(c => c.stepId === o.stepId && c.argumentSlot === slot)) need.consumers.push({ stepId: o.stepId, argumentSlot: slot });
  }
  return [...needs.values()];
}

/**
 * GuidedProposalValidator.admitPlan, reduced to what NEXT_ACTION needs: copy the plan fields from the reply, assign each
 * obligation a fresh obligationId (the server, never the model, owns it) and derive `needs` from the needIds. A stray `needs`
 * field on the reply is ignored, not copied and not rejected (the product's strict parser is the place that refuses it; the
 * harness fakes in the protected tests still return `needs: []`). Structural refusals here are reported, not thrown;
 * the real verdict comes from the Java scoring test (workstream D).
 */
export function admitPlan(reply) {
  const plan = { sourceReferences: deepCopy(reply?.sourceReferences ?? []), obligations: deepCopy(reply?.obligations ?? []), needs: [] };
  for (const obligation of plan.obligations) obligation.obligationId = randomUUID();
  plan.needs = deriveNeeds(plan.obligations);
  // GuidedDependencyPlanner.allocate: every need gets a server-allocated bindingId (a UUID, GuidedBindingStore) at admission (deviation 11).
  for (const need of plan.needs) need.bindingId = randomUUID();
  return plan;
}

/** One safe input per distinct reference used by an obligation, in plan order: {inputId, sourceStepId, kind, intendedSlot}. */
export function authoredInputs(plan) {
  const inputs = []; const byReference = new Map();
  for (const obligation of plan.obligations) {
    const index = obligation.referenceIndex;
    if (index === null || index === undefined || byReference.has(index)) continue;
    const reference = plan.sourceReferences[index];
    if (!reference) continue;
    const input = { inputId: randomUUID(), sourceStepId: reference.stepId, kind: reference.kind, intendedSlot: reference.intendedSlot };
    byReference.set(index, input.inputId);
    inputs.push(input);
  }
  return { inputs, byReference };
}

/**
 * NEXT_ACTION request for one step. `done` = obligations of this step already fulfilled (they are excluded from `remaining`
 * and counted into coordinate.ordinal, as capturePromptInputsLocked does).
 * @param {{ session:object, plan:object, stepIndex:number, done?:number, observation:object|string|null, observationJson?:object|null,
 *           attempt?:number, repairCodes?:string[], requestId?:string, evidence?:object|null, allows?:Function }} args
 * `observation` is what goes in context.observation (object for the product, outline string for S1+). `observationJson` is the
 * product-form Observation used for executionEvidence (origin/documentId/generation/hash); defaults to `observation` when an object.
 */
export function buildNextActionRequest({ session, plan, stepIndex, done = 0, observation, observationJson = null, attempt = 1, repairCodes = [], requestId = newRequestId(), evidence = undefined, system = undefined }) {
  const stepId = session.sourceSteps[stepIndex].stepId;
  const own = plan.obligations.filter(o => o.stepId === stepId);
  const remaining = own.slice(done);
  const { inputs } = authoredInputs(plan);
  const structured = observationJson ?? (observation && typeof observation === 'object' ? observation : null);
  let executionEvidence = evidence;
  if (executionEvidence === undefined) {
    executionEvidence = structured === null ? null : { kind: 'observedDocument', origin: structured.origin, contextId: session.contextId, sessionId: session.sessionId, documentId: structured.documentId, generation: structured.generation, observationHash: sha256Hex(canonical(structured)) };
  }
  const progress = { stepIndex, translationOrdinal: done, contextRevision: 1, authoredInputsHash: canonicalHash({ inputs }), observation, executionEvidence };
  const state = { manifest: session.manifest, plan: { sourceReferences: plan.sourceReferences, needs: plan.needs } };
  const context = buildPositiveContext('NEXT_ACTION', session, progress, state, inputs, remaining, [], repairCodes);
  return { kind: 'NEXT_ACTION', requestId, attempt, context, remaining, inputs, body: wireBody({ kind: 'NEXT_ACTION', requestId, attempt, context, system }) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Arm-facing helpers. A "plan cursor" is what the orchestrator hands an arm after SOURCE_PLAN: the benchmark session, the
// admitted plan (admitPlan result, obligations carry their obligationId), the index of the step being performed and how many of
// its obligations are already fulfilled: { session, plan, stepIndex, done }.
export function resolveCursor({ task, step, obligations }) {
  if (obligations && !Array.isArray(obligations) && obligations.plan) {
    const { session, plan, stepIndex = 0, done = 0 } = obligations;
    return { session, plan, stepIndex, done };
  }
  const session = step?.session ?? task?.session;
  if (!session || !Array.isArray(obligations)) throw new Error('PLAN_CURSOR_REQUIRED: pass obligations = { session, plan, stepIndex, done } (see lib/requests.mjs)');
  const stepIndex = Math.max(0, session.sourceSteps.findIndex(s => s.stepId === obligations[0]?.stepId));
  return { session, plan: { sourceReferences: [], obligations, needs: [] }, stepIndex, done: 0 };
}

/** Size-accurate stand-in for the NEXT_ACTION request of a step, used before any SOURCE_PLAN reply exists (admission estimates). */
export function stubCursor(task, step) {
  const session = makeSession(task);
  const stepIndex = Math.max(0, task.steps.indexOf(step));
  const literal = quotedSpans(step.text)[0];
  const target = literal ? step.text.slice(literal[0], literal[1]) : step.text;
  const plan = { sourceReferences: [], needs: [], obligations: [{ obligationId: randomUUID(), stepId: session.sourceSteps[stepIndex].stepId, occurrence: 0, operationKind: step.operation?.kind ?? 'click', targetIntent: target, scopeIntent: null, referenceIndex: null, needId: null, predicate: step.operation?.predicate ?? null }] };
  return { session, plan, stepIndex, done: 0 };
}

// ---------------------------------------------------------------------------------------------------------------------
// Templates (real captured request bodies; loopback fixtures, nothing sensitive).
export function loadTemplate(name) { return JSON.parse(readFileSync(fileURLToPath(new URL(`${name}.req.json`, TEMPLATES)), 'utf8')); }
export const templateEnvelope = template => JSON.parse(template.contents[0].parts[0].text);
