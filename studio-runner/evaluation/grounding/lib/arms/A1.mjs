/* global Buffer */
// SPK-07 arm A1 (baseline): today's production collector with the size/time limits lifted, today's contract and schema.
// payload = the Observation object exactly as the product sends it (canonical-v1 form, same bytes the runner would export);
// executable = the SAME collector instance's production matches(target, locator).
//
// This module also holds the helpers shared by A0, S1 and S2 (they differ only in limits, rendering and verification).
import { randomUUID } from 'node:crypto';
import { LIFTED_LIMITS, LIFTED_WORK_LIMITS, loadProduction, openCollector } from '../collectorInstrumented.mjs';
import { bodyMetrics, buildNextActionRequest, resolveCursor, stubCursor } from '../requests.mjs';

export const id = 'A1';
export const SCOPE_HASH = 'a'.repeat(64);
export const PRODUCT_BYTES = 32768;
export const PRODUCT_NODES = 500;
export const PRODUCT_DEPTH = 8;

/** CollectorOptions for a benchmark page: allow-all domains and the allow-all read profile, mirroring the allow-all deployment. */
export async function baseConfig() {
  const { observationReadProfile } = await loadProduction();
  return { sessionId: 'spk07', scopeHash: SCOPE_HASH, allowedDomains: ['*'], rules: [], knownSecrets: [], readProfile: observationReadProfile(['*']) };
}

/** Production gate for the product observation: bytes <= 32768, nodes <= 500, depth <= 8 (and the collector did not truncate). */
export function productionAdmission(observation, bytes) {
  const depth = observation.nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  return bytes <= PRODUCT_BYTES && observation.nodes.length <= PRODUCT_NODES && depth <= PRODUCT_DEPTH && observation.coverage?.truncated !== true;
}

/**
 * Collect once with the given options and package the result. `options` is a complete CollectorOptions.
 * Returns the pieces every arm needs; arms add their own payload rendering.
 */
export async function collectProduct({ cdp, options }) {
  const { canonicalObservation } = await loadProduction();
  const collector = await openCollector({ cdp, options });
  let raw;
  try { raw = await collector.collect({ documentId: randomUUID(), generation: 1 }); } catch (error) { await collector.dispose(); return { collector, error: String(error?.message ?? error).split('\n')[0], observation: null, json: '', bytes: 0, ms: 0, idMap: {}, emptied: true }; }
  const json = canonicalObservation(raw.observation); // the exact export form; refuses invalid Unicode like the product
  const observation = JSON.parse(json);
  const bytes = Buffer.byteLength(json, 'utf8');
  const idMap = await collector.backendIds(observation.nodes.map(node => node.nodeId));
  return { collector, observation, json, bytes, ms: raw.ms, idMap, emptied: observation.nodes.length === 0, error: null };
}

/** Admission estimate for the full request before any SOURCE_PLAN exists (replaced by the real figure in buildRequest). */
export function estimateGateway(task, step, observationPayload, buildOptions = {}) {
  const cursor = stubCursor(task, step);
  const request = buildNextActionRequest({ ...cursor, observation: observationPayload, ...buildOptions });
  return bodyMetrics(request.body);
}

/** Shared buildRequest for the arms: context.observation = observed.payload; system = observed.system ?? the real contract. */
export function buildNextAction({ task, step, obligations, observed, attempt = 1, repairCodes = [], system }) {
  const cursor = resolveCursor({ task, step, obligations });
  const request = buildNextActionRequest({ ...cursor, observation: observed.payload, observationJson: observed.internal.observation, attempt, repairCodes, system });
  const metrics = bodyMetrics(request.body);
  Object.assign(observed.meta, { gatewayInputAdmitted: metrics.gatewayInputAdmitted, translationInputAdmitted: metrics.translationInputAdmitted, requestBodyBytes: metrics.bodyBytes, gatewayInputBytes: metrics.gatewayInputBytes, translationInputBytes: metrics.translationInputBytes });
  return request.body;
}

const STATUSES = new Set(['ACTION', 'CLARIFICATION', 'COMPLETE', 'UNSUPPORTED']);

/**
 * Shared reply interpretation. `verify(nodeId, locator)` -> { executable, gateCodes } decides executability for the arm.
 * pickedBackendNodeId comes from the arm's idMap; an unknown nodeId makes the reply INVALID (the product's validator would refuse it).
 */
export async function interpretNextAction({ reply, observed, verify }) {
  const out = { status: 'INVALID', pickedId: null, pickedBackendNodeId: null, locator: null, locatorTier: null, executable: false, gateCodes: [], obligationId: null, operation: null };
  if (!reply || typeof reply !== 'object' || reply.kind !== 'NEXT_ACTION' || !STATUSES.has(reply.status)) { out.gateCodes.push('REPLY_UNPARSEABLE'); return out; }
  out.status = reply.status;
  if (reply.status !== 'ACTION') return out;
  out.obligationId = reply.obligationId ?? null;
  out.operation = reply.action?.operation ?? null;
  const target = reply.action?.target;
  if (!target || typeof target !== 'object') { out.status = 'INVALID'; out.gateCodes.push('ACTION_WITHOUT_TARGET'); return out; }
  if (typeof target.nodeId !== 'string') { out.gateCodes.push('NON_NODE_TARGET'); return out; }
  out.pickedId = target.nodeId;
  const backend = observed.idMap[target.nodeId];
  if (backend === undefined) { out.status = 'INVALID'; out.gateCodes.push('NODE_ID_UNKNOWN'); return out; }
  out.pickedBackendNodeId = backend;
  const locator = target.locator;
  if (!locator || typeof locator !== 'object' || typeof locator.kind !== 'string') { out.gateCodes.push('LOCATOR_MALFORMED'); return out; }
  out.locator = locator;
  out.locatorTier = locator.kind;
  const verdict = await verify(target.nodeId, locator);
  out.executable = verdict.executable === true;
  out.gateCodes.push(...(verdict.gateCodes ?? []));
  return out;
}

/** The production matches() on the same collector instance that produced the observation. */
export function productionVerify(observed) {
  return async (nodeId, locator) => {
    const { documentId, generation } = observed.internal.observation;
    try { return { executable: (await observed.internal.collector.matches({ documentId, generation, nodeId }, locator)) === true, gateCodes: [] }; } catch (error) { return { executable: false, gateCodes: [`MATCHES_ERROR:${String(error?.message ?? error).slice(0, 60)}`] }; }
  };
}

/** Arm-level observe for A1 (and the base for A0 with other options). */
export async function observeWithOptions({ cdp, task, step, options, render = null }) {
  const product = await collectProduct({ cdp, options });
  const { observation, json, bytes, collector } = product;
  const rendered = render && observation ? await render(product) : null;
  const payload = rendered ? rendered.payload : observation;
  const meta = {
    bytes: rendered ? rendered.bytes : bytes, jsonBytes: bytes, nodes: observation ? observation.nodes.length : 0, ms: product.ms,
    admittedUnderProductionLimits: observation ? productionAdmission(observation, bytes) : false,
    gatewayInputAdmitted: false, translationInputAdmitted: false, emptied: product.emptied, error: product.error,
  };
  if (observation && !product.emptied) {
    const estimate = estimateGateway(task, step, payload, { system: rendered?.system });
    Object.assign(meta, { gatewayInputAdmitted: estimate.gatewayInputAdmitted, translationInputAdmitted: estimate.translationInputAdmitted, translationInputBytes: estimate.translationInputBytes });
  }
  return {
    payload, images: undefined, idMap: rendered?.idMap ?? product.idMap, meta,
    // Non-interface extras for the orchestrator and the scorers: the product-form observation and the live collector facade.
    internal: { observation, json, collector, rendered, extraNodes: rendered?.extraNodes ?? 0 },
    system: rendered?.system,
    dispose: () => collector.dispose(),
  };
}

export async function observe({ cdp, task, step }) {
  const base = await baseConfig();
  return observeWithOptions({ cdp, task, step, options: { ...base, limits: { ...LIFTED_LIMITS }, workLimits: { ...LIFTED_WORK_LIMITS } } });
}
export function buildRequest(args) { return buildNextAction({ ...args, system: args.observed.system }); }
export async function interpret({ reply, observed }) { return interpretNextAction({ reply, observed, verify: productionVerify(observed) }); }
