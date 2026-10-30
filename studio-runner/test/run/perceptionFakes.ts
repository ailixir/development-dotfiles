/**
 * Test doubles for the perception modules: a tiny DSL for Playwright AI-snapshot trees and a scripted CDP session
 * that answers the page programs the modules send (the real programs run in the perception tier).
 */
import type { CdpSession } from '../../src/run/playwrightEngine.js';
import type { Box, CollectedPage, ElementCandidateFacts, ElementFacts, PageInventory, SnapshotNode } from '../../src/run/perceptionInPage.js';

export type Child = SnapshotNode | string;

export const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

/** `n('button', { name: 'Save', ref: 'e1' }, 'children…')` */
export function n(role: string, attrs: Partial<SnapshotNode> = {}, ...children: Child[]): SnapshotNode {
  return { role, ...attrs, ...(children.length ? { children } : {}) };
}

export const elementFacts = (tag: string, extra: Partial<ElementFacts> = {}): ElementFacts => ({
  tag, valueControl: false, editable: false, editableRoot: false, sensitive: false, inSelect: false, valueAttr: false, ...extra,
});

export function page(json: SnapshotNode[], facts: Record<string, ElementFacts> = {}, extra: Partial<CollectedPage> = {}): CollectedPage {
  return { json, facts, echo: [], viewport: { width: 1280, height: 720 }, origin: 'https://example.test', canvases: 0, ...extra };
}

/** All text a rendered outline carries, for leak scans. */
export const everything = (...parts: unknown[]): string => parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');

export interface Script {
  collected: CollectedPage;
  inventory?: PageInventory;
  backendIds?: Record<string, number>;
  candidateFacts?: (ref: string) => ElementCandidateFacts | null;
  check?: (ref: string, selectors: string[]) => ({ count: number; index: number } | { error: true })[];
  options?: (ref: string) => unknown;
}

export interface FakeCall {
  method: string;
  params: Record<string, unknown> | undefined;
}

/** A CDP session that answers the calls of openEngine, perceive, backendNodeIdsFor, synthesize and the G1 listing. */
export class ScriptedCdp implements CdpSession {
  readonly calls: FakeCall[] = [];
  private readonly arrays = new Map<string, string[]>();
  constructor(private readonly script: Script) {}

  send(method: string, params?: object): Promise<unknown> {
    try {
      return Promise.resolve(this.handle(method, params));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handle(method: string, params?: object): unknown {
    const p = params as Record<string, unknown> | undefined;
    this.calls.push({ method, params: p });
    switch (method) {
      case 'Page.getFrameTree': return { frameTree: { frame: { id: 'frame-1' } } };
      case 'Page.createIsolatedWorld': return { executionContextId: 9 };
      case 'Runtime.evaluate': {
        const expression = String(p?.expression);
        if (expression.includes('new (module.exports.InjectedScript())')) return { result: { objectId: 'engine' } };
        return { result: { value: this.script.inventory ?? { entries: [], oversize: false } } };
      }
      case 'Runtime.callFunctionOn': return this.callFunctionOn(p ?? {});
      case 'Runtime.getProperties': {
        const refs = this.arrays.get(String(p?.objectId)) ?? [];
        return { result: refs.map((ref, index) => ({ name: String(index), value: { objectId: `el:${ref}` } })) };
      }
      case 'DOM.describeNode': {
        const ref = String(p?.objectId).slice(3);
        const id = this.script.backendIds?.[ref];
        if (id === undefined) throw new Error('no node');
        return { node: { backendNodeId: id } };
      }
      default: return {};
    }
  }

  private callFunctionOn(p: Record<string, unknown>): unknown {
    const declaration = String(p.functionDeclaration);
    const args = (p.arguments as { value: unknown }[] | undefined ?? []).map((a) => a.value);
    const byValue = p.returnByValue === true;
    if (declaration.includes('ariaSnapshotJSON')) return { result: { value: this.script.collected } };
    if (declaration.includes('function resolveRefs')) {
      const id = `array:${String(this.arrays.size)}`;
      this.arrays.set(id, args[0] as string[]);
      return { result: { objectId: id } };
    }
    if (declaration.includes('function elementCandidateFacts')) {
      return { result: { value: this.script.candidateFacts?.(String(args[0])) ?? null } };
    }
    if (declaration.includes('function checkSelectors')) {
      const selectors = args[1] as string[];
      return { result: { value: this.script.check ? this.script.check(String(args[0]), selectors) : selectors.map(() => ({ count: 1, index: 0 })) } };
    }
    if (declaration.includes('function listOptions')) return { result: { value: this.script.options?.(String(args[0])) ?? null } };
    void byValue;
    throw new Error('unscripted page program');
  }
}
