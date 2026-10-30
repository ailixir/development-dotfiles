/* global structuredClone */
// SPK-07 arm S2 (Stage-1 prototype): S1's outline + awareness nodes for interactive elements the collector did not export,
// and Playwright-engine verification instead of the collector's matches() (so no R4/R5 blocking).
//
//  - Extra nodes come from the Playwright engine's own ariaSnapshot (mode 'ai') in a SEPARATE isolated world. They get nodeIds
//    continuing the collector's numbering and NO locator hints (`loc=-`): awareness only, never targetable.
//  - executable = the engine resolves hintSelector(locator) to exactly one element AND that element is the picked node
//    (backendNodeId equality). F1 proved the engine agrees exactly with public Playwright locators; there is no fallback resolver.
//  - Uses the S1 contract and S1's lossless rendering of the collector's nodes.
import { backendNodeId, call, evaluateHandle, isolatedWorld } from '../cdp.mjs';
import { LIFTED_LIMITS, LIFTED_WORK_LIMITS } from '../collectorInstrumented.mjs';
import { engineExpression, hintSelector } from '../pwEngine.mjs';
import { privateInventoryFor, scrubEchoes } from '../perceive.mjs';
import { baseConfig, buildNextAction, interpretNextAction, observeWithOptions } from './A1.mjs';
import { renderOutline } from './S1.mjs';

export const id = 'S2';

const INTERACTIVE = 'button|link|textbox|searchbox|combobox|checkbox|radio|listbox|spinbutton|slider|switch|tab|menuitem|option';
const LINE = new RegExp(String.raw`^\s*- (${INTERACTIVE})\b(?: "((?:[^"\\]|\\.)*)")?[^\n]*?\[ref=(e\d+)\]`, 'u');
const ELEMENT_TYPE = { link: 'link', button: 'button', textbox: 'input', searchbox: 'input', checkbox: 'input', radio: 'input', spinbutton: 'input', slider: 'input', switch: 'input', combobox: 'select', listbox: 'select' };
const STRUCT = 'observed-structure-v1';

/** Interactive rows {role, name, ref} of the engine's AI-mode aria snapshot. */
export function parseInteractive(snapshot) {
  const rows = [];
  for (const line of snapshot.split('\n')) {
    const match = LINE.exec(line);
    if (!match) continue;
    let name = '';
    if (match[2] !== undefined) { try { name = JSON.parse(`"${match[2]}"`); } catch { name = match[2]; } }
    rows.push({ role: match[1], name, ref: match[3] });
  }
  return rows;
}

async function engineExtras({ cdp, engine, idMap }) {
  const snapshot = await call(cdp, engine, 'function() { return this.ariaSnapshot(document.documentElement, { mode: \'ai\' }); }');
  const known = new Set(Object.values(idMap));
  const extras = [];
  const rows = parseInteractive(snapshot);
  for (let i = 0; i < rows.length; i += 40) {
    await Promise.all(rows.slice(i, i + 40).map(async row => {
      const objectId = await call(cdp, engine, 'function(ref) { return this.querySelector(this.parseSelector(\'aria-ref=\' + ref), document, false); }', [row.ref], false);
      row.backend = objectId ? await backendNodeId(cdp, objectId) : null;
    }));
  }
  for (const row of rows) if (row.backend !== null && !known.has(row.backend)) { known.add(row.backend); extras.push(row); }
  return { extras, interactive: rows.length };
}

export async function observe({ page, cdp, task, step }) {
  const base = await baseConfig();
  const engineWorld = await isolatedWorld(cdp);
  const engine = await evaluateHandle(cdp, engineWorld, engineExpression());
  const extraStats = { withheldEchoing: 0, inventoryProduction: 'ok', inventoryError: null };
  const observed = await observeWithOptions({
    cdp, task, step, options: { ...base, limits: { ...LIFTED_LIMITS }, workLimits: { ...LIFTED_WORK_LIMITS } },
    render: async product => {
      const found = await engineExtras({ cdp, engine, idMap: product.idMap });
      const { interactive } = found;
      // Extra nodes carry Playwright-snapshot names, i.e. page text that can echo typed values (suggestion rows, URL prefill, red links).
      // Withhold any extra whose name echoes a private value (production inventory + page-side light inventory); count them.
      // Collector nodes are left exactly as production emits them.
      const derived = await privateInventoryFor(page, cdp);
      const { kept: extras, withheld } = scrubEchoes(found.extras, derived.inventory, { fields: item => [item.name] });
      extraStats.withheldEchoing = withheld.length; extraStats.inventoryProduction = derived.production; extraStats.inventoryError = derived.error;
      const observation = structuredClone(product.observation);
      const idMap = { ...product.idMap };
      const last = product.observation.nodes.at(-1)?.nodeId;
      const prefix = last ? last.slice(0, last.lastIndexOf('-') + 1) : `node-${observation.generation}-`;
      let counter = observation.nodes.reduce((max, node) => Math.max(max, Number(node.nodeId.slice(node.nodeId.lastIndexOf('-') + 1))), 0);
      for (const extra of extras) {
        const nodeId = `${prefix}${++counter}`;
        observation.nodes.push({ nodeId, documentId: observation.documentId, generation: observation.generation, role: extra.role, name: extra.name, elementType: ELEMENT_TYPE[extra.role] ?? 'other', controlType: 'none',
          classification: 'structuralOnly', policyRuleId: STRUCT, visible: true, actionable: true, depth: 0, parentNodeId: null, regionId: null, formId: null, labelNodeIds: [], locatorHints: [] });
        idMap[nodeId] = extra.backend;
      }
      const rendered = await renderOutline(product, { observation, idMap, extraNodes: extras.length });
      return { ...rendered, interactive };
    },
  });
  observed.meta.extraNodes = observed.internal.extraNodes;
  Object.assign(observed.meta, { extraWithheldEchoing: extraStats.withheldEchoing, extraInventoryProduction: extraStats.inventoryProduction, extraInventoryError: extraStats.inventoryError });
  observed.meta.outlineBytes = observed.meta.bytes;
  observed.internal.engine = engine;
  observed.internal.cdp = cdp;
  return observed;
}

export function buildRequest(args) { return buildNextAction({ ...args, system: args.observed.system }); }

/** Playwright-engine verification: exactly one match for the locator's selector and it is the picked element. */
export function engineVerify(observed) {
  return async (nodeId, locator) => {
    const { cdp, engine } = observed.internal;
    if (locator.exact !== true) return { executable: false, gateCodes: ['LOCATOR_NOT_EXACT'] };
    const valid = locator.kind === 'role' ? typeof locator.role === 'string' && typeof locator.name === 'string' : typeof locator.value === 'string';
    if (!valid) return { executable: false, gateCodes: ['LOCATOR_MALFORMED'] };
    let selector;
    try { selector = hintSelector(locator); } catch { return { executable: false, gateCodes: ['HINT_KIND_UNSUPPORTED'] }; }
    try {
      const count = await call(cdp, engine, 'function(s) { return this.querySelectorAll(this.parseSelector(s), document).length; }', [selector]);
      if (count !== 1) return { executable: false, gateCodes: [`ENGINE_COUNT_${count}`] };
      const objectId = await call(cdp, engine, 'function(s) { return this.querySelectorAll(this.parseSelector(s), document)[0]; }', [selector], false);
      const matched = objectId ? await backendNodeId(cdp, objectId) : null;
      return { executable: matched !== null && matched === observed.idMap[nodeId], gateCodes: matched === observed.idMap[nodeId] ? [] : ['ENGINE_WRONG_ELEMENT'] };
    } catch (error) { return { executable: false, gateCodes: [`ENGINE_ERROR:${String(error?.message ?? error).slice(0, 60)}`] }; }
  };
}
export async function interpret({ reply, observed }) { return interpretNextAction({ reply, observed, verify: engineVerify(observed) }); }
