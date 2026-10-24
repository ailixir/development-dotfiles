import { demand, equalObserved, equalsOriginalTargetIntent } from './observedReferencePolicy.js';

/**
 * Region-qualified step labels (STUDIO-OBS-009 round 057). An obligation carries `targetIntent`
 * (the bare label) and `scopeIntent` (the name of the nearest enclosing main, region or navigation
 * landmark, or null). This mirrors backend `GuidedQualifiedLabel` rule for rule, and both are
 * driven by `docs/specs/studio-observed-authoring/contracts/v3/qualified-label-vectors.json` so
 * the two validators cannot drift. It is a correspondence rule, not a locator and not permission to
 * act; region names are page-derived and are only compared.
 */
export type QualifiedLocator = { readonly kind: 'role'; readonly role: string; readonly name: string; readonly exact: true }
    | { readonly kind: 'label' | 'testId' | 'text' | 'placeholder'; readonly value: string; readonly exact: true };
export interface QualifiedNode {
    readonly nodeId: string;
    readonly documentId: string;
    readonly generation: number;
    readonly role: string;
    readonly name: string;
    readonly visible: boolean;
    readonly classification: string;
    readonly regionId: string | null;
    readonly locatorHints: readonly QualifiedLocator[];
}
export interface QualifiedObservation {
    readonly documentId: string;
    readonly generation: number;
    readonly nodes: readonly QualifiedNode[];
}
const REGION_ROLES = ['main', 'region', 'navigation'];
const REGION_CLASSES = ['structuralOnly', 'permittedBusinessData', 'nonsecretApproved'];
/** `String.isBlank()` on the JVM is Character.isWhitespace, not the wider JavaScript trim set. */
const JAVA_WHITESPACE = new Set<number>([9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
    0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x205f, 0x3000]);
const javaBlank = (value: string): boolean => Array.from(value).every(ch => JAVA_WHITESPACE.has(ch.codePointAt(0) ?? -1));
export const locatorLabel = (locator: QualifiedLocator): string => locator.kind === 'role' ? locator.name : locator.value;
/** The accessible name of the node's nearest eligible region, or null. */
export function regionNameOf(observation: QualifiedObservation, node: QualifiedNode): string | null {
    const regionId = node.regionId;
    if (observation.documentId === '' || javaBlank(observation.documentId)
        || !Number.isInteger(observation.generation) || observation.generation < 0 || observation.generation > 2147483647
        || node.documentId !== observation.documentId || node.generation !== observation.generation
        || typeof regionId !== 'string' || javaBlank(regionId))
        return null;
    const matches = observation.nodes.filter(n => n.nodeId === regionId);
    const region = matches[0];
    if (matches.length !== 1 || !region || region.documentId !== observation.documentId || region.generation !== observation.generation
        || !REGION_ROLES.includes(region.role) || !region.visible || !REGION_CLASSES.includes(region.classification)
        || typeof region.name !== 'string')
        return null;
    const codePoints = Array.from(region.name).length;
    return !javaBlank(region.name) && codePoints >= 1 && codePoints <= 256 ? region.name : null;
}
/** The label match acquisition has always used: node name, or any hint name/value. */
export function matchesIntent(node: QualifiedNode, intent: string): boolean {
    return equalsOriginalTargetIntent(intent, node.name) || node.locatorHints.some(hint => equalsOriginalTargetIntent(intent, locatorLabel(hint)));
}
/** Every node the qualified label can mean; empty when the author named a region that does not exist. */
export function qualifiedCandidates(observation: QualifiedObservation, targetIntent: string, scopeIntent: string): QualifiedNode[] {
    return observation.nodes.filter(node => {
        if (!matchesIntent(node, targetIntent))
            return false;
        const region = regionNameOf(observation, node);
        return region !== null && equalsOriginalTargetIntent(scopeIntent, region);
    });
}
export function locatorCardinality(observation: QualifiedObservation, locator: QualifiedLocator): number {
    return observation.nodes.filter(node => node.locatorHints.some(hint => equalObserved(hint, locator))).length;
}
/**
 * The proposed node must be the only candidate, and its locator one of its hints and unique in the
 * observation. Returns that locator; any failure is `code`.
 */
export function qualifiedLocator(observation: QualifiedObservation, obligation: { readonly targetIntent: string; readonly scopeIntent: string | null },
    target: { readonly nodeId?: unknown; readonly locator?: unknown }, code: 'OPERATION_MISMATCH' | 'EVIDENCE_MISMATCH' = 'OPERATION_MISMATCH'): QualifiedLocator {
    demand(obligation.scopeIntent !== null && typeof target.nodeId === 'string' && typeof target.locator === 'object' && target.locator !== null, code);
    const candidates = qualifiedCandidates(observation, obligation.targetIntent, obligation.scopeIntent);
    const only = candidates[0];
    demand(candidates.length === 1 && only?.nodeId === target.nodeId, code);
    const locator = target.locator as QualifiedLocator;
    demand(only.locatorHints.some(hint => equalObserved(hint, locator)) && locatorCardinality(observation, locator) === 1, code);
    return locator;
}
