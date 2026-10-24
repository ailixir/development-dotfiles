import type { InvocationControl } from '../executor/observedReplay.js';
import type { Guard, ReplayAction } from '../executor/observedOperations.js';
import type { Action } from '../guided/types.js';
/** Frozen observed-v1 wire shape. Local identities/slots never become replay selectors. */
export type LocatorHint = {
    kind: 'role';
    role: string;
    name: string;
    exact: true;
} | {
    kind: 'label' | 'testId' | 'text' | 'placeholder';
    value: string;
    exact: true;
};
export interface ObservationNode {
    nodeId: string;
    documentId: string;
    generation: number;
    role: string;
    name: string;
    elementType: 'button' | 'input' | 'textarea' | 'select' | 'text' | 'link' | 'other';
    controlType: 'none' | 'text' | 'search' | 'email' | 'tel' | 'url' | 'textarea' | 'password' | 'hidden' | 'other';
    classification: 'structuralOnly' | 'permittedBusinessData' | 'nonsecretApproved';
    policyRuleId: string;
    visible: boolean;
    actionable: boolean;
    depth: number;
    parentNodeId: string | null;
    regionId: string | null;
    formId: string | null;
    labelNodeIds: string[];
    locatorHints: LocatorHint[];
}
export interface Observation {
    schemaVersion: 3;
    sessionId: string;
    documentId: string;
    generation: number;
    origin: string;
    scopeHash: string;
    observedAt: string;
    coverage: {
        mode: 'semantic' | 'boundedDom';
        complete: boolean;
        truncated: boolean;
        withheldRegions: number;
        passwordControls: number;
        reason: 'complete' | 'budget' | 'sensitivity' | 'unsupportedSurface';
    };
    nodes: ObservationNode[];
}
/** Supplied only by trusted configured field/region policy, never by a page or proposal. */
export interface ObservationRule {
    testId: string;
    name: string;
    policyRuleId: string;
    classification: ObservationNode['classification'];
    /** Exact static accessible name. Omit only for a business-data DOM fallback slot. */
    accessibleName?: string;
}
export interface ObservationReadGrant {
    policyRuleId: string;
    origin: string;
    region: {
        kind: 'application';
    } | {
        kind: 'role';
        role: 'main' | 'region' | 'form';
        name: string;
        exact: true;
    };
    visibleText?: {
        classification: 'permittedBusinessData';
    };
    controlValue?: {
        classification: 'nonsecretApproved';
        types: ('text' | 'search' | 'email' | 'tel' | 'url' | 'textarea')[];
    };
}
export interface ObservationApplicationPolicy {
    policyRuleId: string;
    allowStructuralDiscovery: boolean;
    /** Governed positive grants only (guided: hash-bound runner context, STUDIO-OBS-014 AC-1; replay:
     * TrustedPolicy), never a mounted file. Structural discovery never grants reading. */
    readGrants?: ObservationReadGrant[];
}
export interface ObservationConfig {
    sessionId: string;
    scopeHash: string;
    approvedOrigins: readonly string[];
    rules: readonly ObservationRule[];
    knownSecrets: readonly string[];
    /** Trusted application-level permission to export sanitized structural metadata, never read authorization. */
    applicationPolicy?: ObservationApplicationPolicy;
    limits?: {
        nodes?: number;
        depth?: number;
        bytes?: number;
        milliseconds?: number;
    };
    /** Internal work bounds, independent of the frozen outgoing semantic-node limits. */
    workLimits?: {
        elements?: number;
        depth?: number;
    };
}
export interface CollectorOptions {
    sessionId: string;
    scopeHash: string;
    approvedOrigins: readonly string[];
    rules: readonly ObservationRule[];
    knownSecrets: readonly string[];
    /** Trusted application-level permission to export sanitized structural metadata, never read authorization. */
    applicationPolicy?: ObservationApplicationPolicy;
    limits: {
        nodes: number;
        depth: number;
        bytes: number;
        milliseconds: number;
    };
    workLimits: {
        elements: number;
        depth: number;
    };
}
export interface ObservationExport {
    readonly observation: Observation;
    readonly json: string;
    readonly bytes: number;
    readonly observationHash: string;
}
export interface ObservedTarget {
    documentId: string;
    generation: number;
    nodeId: string;
}
/** Private worker-only acquisition facts; never an observation/model/IPC DTO. */
export type AcquisitionResult = {
    kind: 'READY';
    target: ObservedTarget;
} | {
    kind: 'ABSENT';
} | {
    kind: 'VISIBILITY_PENDING';
} | {
    kind: 'REFUSED';
    code: 'TARGET_DRIFT' | 'READ_REFUSED' | 'POLICY_REFUSED';
};
export interface AcquisitionRequest {
    documentId: string;
    generation: number;
    origin: string;
    locator: LocatorHint;
    expected: Extract<Guard['target'], {
        kind: 'element';
    }>;
    operation: ReplayAction['operation'];
}
export interface ObservationSession {
    preparePassword?(target: PasswordTarget, origin: string): Promise<void>;
    fillPassword?(target: PasswordTarget, origin: string, allowedOrigins: readonly string[], value: string, control?: InvocationControl): Promise<void>;
    acquire?(request: AcquisitionRequest): Promise<AcquisitionResult>;
    observe(maxBytes?: number): Promise<ObservationExport>;
    /** Unique exact locator resolution must equal the retained live DOM element. */
    matches(target: ObservedTarget, locator: LocatorHint): Promise<boolean>;
    withhold?(values: readonly string[]): Promise<void>;
    navigate?(target: {
        documentId: string;
        generation: number;
    }, origin: string, destination: string): Promise<void>;
    validateInvocation?(invocation: GuidedInvocation): Promise<boolean>;
    invoke?(invocation: GuidedInvocation, control?: InvocationControl): Promise<GuidedInvocationResult>;
    assertPage?(target: {
        documentId: string;
        generation: number;
    }, origin: string, predicate: 'url' | 'title', expected: string): Promise<boolean>;
    pageMatches?(target: {
        documentId: string;
        generation: number;
    }, origin: string): Promise<boolean>;
    dispose(): Promise<void>;
}
export interface PasswordTarget {
    kind: 'passwordControl';
    documentId: string;
    generation: number;
}
/** The value is confined to the guided worker; never expose it in IPC or diagnostics. */
export interface GuidedInvocation {
    target: ObservedTarget & {
        locator: LocatorHint;
    };
    operation: Action['operation'];
    resolvedValue: string | null;
    origin: string;
    maxValueBytes: number;
}
export interface GuidedInvocationResult {
    value?: string;
    assertionPassed?: boolean;
}
