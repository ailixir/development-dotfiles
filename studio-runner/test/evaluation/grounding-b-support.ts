/* eslint-disable no-restricted-syntax -- SPK-07 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths, so no .d.mts declaration files are needed; no artifact content reaches a loader. */
/**
 * SPK-07 workstream B test support: typed views of the evaluation/grounding modules (plain .mjs).
 * The Chromium launcher moved to test/fixtures-tier/spike-live/support.ts (ADR-SC-007 WI-4 D-12: the unit tier is browser-free, AC-25).
 */
import { createHash } from 'node:crypto';

export const live = process.env.SPK07_LIVE === '1';

export interface Box { x: number; y: number; width: number; height: number }
export interface RenderedNode {
  i: number; parent: number; kids: number[]; kind: 'node' | 'text' | 'password' | 'withheld' | 'unsupported'; role?: string; name?: string; rawName?: string; ref?: string;
  text?: string; near?: string; inHint?: string | null; ownText?: string; placeholder?: string; box: Box | null; interactive?: boolean; depth: number;
  states?: string[]; url?: string; tag?: string; withheld?: boolean; headers?: string[]; groupName?: string;
}
/** A raw Playwright AI-snapshot node, as lib/perceive.mjs reads it. */
export interface RawSnapshotNode { role: string; name?: string; ref?: string; text?: string; url?: string; placeholder?: string; cursor?: string; box?: Box; children?: (RawSnapshotNode | string)[] }
export interface PerceiveCounters { withheldPrivate: number; withheldKept: number; withheldSensitive: number; echoScrubbed: number; valuesStripped: number; unsupported: number; passwordControls: number }
export interface Perceived {
  outline: string; nodes: RenderedNode[]; byRef: Map<string, RenderedNode>; idMap: Record<string, number>;
  handle: { cdp: Cdp; engine: string }; origin: string; viewport: { width: number; height: number };
  meta: Record<string, number | boolean | string | null>;
}
export interface Cdp { send(method: string, params?: object): Promise<{ result: { value: string } }> }
export interface Page {
  setContent(html: string): Promise<void>; goto(url: string, options?: object): Promise<unknown>; evaluate<T>(fn: () => T): Promise<T>;
  locator(selector: string): Locator; context(): { close(): Promise<void> }; screenshot(options?: object): Promise<Buffer>; waitForTimeout(ms: number): Promise<void>;
}
export interface Locator { fill(value: string): Promise<void>; first(): Locator; count(): Promise<number>; click(): Promise<void>; type(value: string): Promise<void>; focus(): Promise<void> }
export interface Browser { newContext(options?: object): Promise<{ newPage(): Promise<Page> }>; close(): Promise<void> }

export interface SynthResult {
  locator: object[] | null; selector: string | null; tier: string | null; alternatives: { tier: string; selector: string; locator: object[] | null }[];
  generated: { selector: string; verified: boolean } | null; tried: number; reason: string | null;
}
export interface Interpreted { status: string; pickedId: string | null; pickedBackendNodeId: number | null; locator: object[] | null; locatorTier: string | null; executable: boolean; gateCodes: string[]; selector?: string }
export interface Observed {
  payload: string; images?: { mimeType: string; base64: string }[]; idMap: Record<string, number>; meta: Record<string, unknown>;
  internal: { perceived: Perceived; remaining?: { obligationId: string; targetIntent: string }[]; inputs?: { inputId: string }[] };
}
export interface VertexBody {
  contents: { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[]; systemInstruction: { parts: { text: string }[] };
  generationConfig: { responseJsonSchema: unknown };
}
export interface Arm {
  id: string;
  observe(a: { page: Page; cdp: Cdp; task: object; step: object; privateValues?: string[] }): Promise<Observed>;
  buildRequest(a: { task: object; step: object; obligations: object; observed: Observed; attempt?: number }): VertexBody;
  interpret(a: { page: Page; cdp: Cdp; reply: object | null; observed: Observed; task: object; step: object }): Promise<Interpreted>;
}

export interface PerceiveModule {
  perceive(a: { page?: Page; cdp?: Cdp; privateValues?: string[]; stepText?: string; targetIntent?: string; maxBytes?: number }): Promise<Perceived>;
  project(nodes: object[], lines: string[], o: { stepText?: string; targetIntent?: string; maxBytes?: number }): { lines: string[]; tier: string; notShown: number; keptIndexes: number[] };
  renderLine(node: object): string;
  buildRendered(collected: { json: RawSnapshotNode[]; facts: Record<string, object>; echo: string[]; canvases?: number }, matcher: { count: number; hit(text: string): boolean }, counters: PerceiveCounters): { nodes: RenderedNode[]; rootKids: number[] };
  annotate(nodes: RenderedNode[], rootKids: number[]): void;
  OPTION_CAP: number;
  privateMatcher(values: string[]): { count: number; hit(text: string): boolean };
  safeUrl(raw: string): string | undefined;
  norm(value: string): string;
  createMatcher(entries: (string | [string, boolean])[]): { count: number; hit(text: string): boolean };
  scrubEchoes<T extends object>(items: T[], inventory: (string | [string, boolean])[]): { kept: T[]; withheld: T[] };
  privateInventoryFor(page: unknown, cdp: unknown): Promise<{ inventory: [string, boolean][]; production: string; error: string | null }>;
  words(value: string): string[];
  evidenceFor(node: object): string;
  FOCUS_STOPWORDS: string[];
}
export interface SynthModule {
  validateLocator(locator: unknown): unknown; toSelector(locator: unknown, o?: { testIdAttribute?: string }): string; tierOf(locator: object[]): string;
  synthesize(a: { handle: Perceived['handle']; perceived: Perceived; ref: string; privateValues?: string[] }): Promise<SynthResult>;
  ATTR_WHITELIST: string[]; TAG_WHITELIST: string[]; TIERS: string[];
}
export interface VisualModule {
  maskedScreenshot(a: { page: Page; perceived: Perceived; privateValues?: string[]; marks?: boolean }): Promise<{ mimeType: string; base64: string; bytes: number; width: number; height: number; masks: number; marks: number; maskReasons: Record<string, number> }>;
  closeDrawingPages(page: Page): Promise<void>;
}
export interface S3Module extends Arm {
  actionGate(a: { reply: object; obligation: object; plan: { sourceReferences: object[]; obligations: object[]; needs?: object[] }; inputs: { inputId: string }[] }): string[];
  deriveS3Contract(source: string): string; deriveS3Schema(schema: unknown): unknown; intentGate(targetIntent: string | undefined, node: object | undefined): string | null; contracts(): { s3: string; s4: string; schema: unknown };
  contractPath(name: string): URL;
  operationTargetGate(kind: string | undefined, node: object | undefined): string | null;
  WITHHELD_PARAGRAPH: string;
  requestState(internal: object, request?: object): { remaining: object[]; inputs: { inputId: string }[]; cursor: object };
}
export interface CdpModule { session(page: Page): Promise<Cdp>; locatorIds(page: Page, cdp: Cdp, locator: unknown): Promise<number[]> }
export interface RequestsModule {
  outputContract(): string; providerSchema(kind: string): unknown; makeSession(task: object): { sourceSteps: { stepId: string; text: string }[]; manifest: { sourceSteps: object[] } };
  sourceReferenceCandidates(steps: object[]): object[]; stubCursor(task: object, step: object): object;
}

const lib = new URL('../../evaluation/grounding/lib/', import.meta.url);
export const importLib = async <T>(name: string): Promise<T> => (await import(new URL(name, lib).href)) as T;

export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

/** SHA-256 of the whole serialized DOM, read through the page's own main world (read-only). */
export async function domHash(cdp: Cdp): Promise<string> {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true });
  return sha256(result.value);
}

/** Every casing variant of a canary, for substring scans. */
export const variants = (canary: string): string[] => [canary, canary.toLowerCase(), canary.toUpperCase()];
export const leaks = (haystack: string, canaries: string[]): string[] => canaries.filter(canary => variants(canary).some(variant => haystack.includes(variant)));

/**
 * The reply target of the frozen SPK-07 comparison arm (S4), which still names an element by the id it was shown and a role locator.
 * It is part of the frozen spike harness (the arm under comparison), so it lives under test/evaluation with the rest of it.
 */
export const frozenArmTarget = (prefix: string, number: string, name: string): { nodeId: string; locator: { kind: 'role'; role: 'button'; name: string; exact: true } } => ({
  nodeId: `${prefix}${number}`,
  locator: { kind: 'role', role: 'button', name, exact: true },
});
