import type { CollectorOptions, Observation, ObservedTarget, LocatorHint, GuidedInvocation, GuidedInvocationResult, AcquisitionRequest, AcquisitionResult, PasswordTarget } from './observationTypes.js';
/** Fixed browser program. No callbacks, source text or selectors supplied by a model.
 * This function is closure-free so the sole browser boundary can install it as a trusted function.
 * The returned object is held by a private remote handle, never installed on window/document.
 */
export declare function installObservationCollector(options: CollectorOptions, priorInventory?: [string, boolean][]): {
    collect(identity: {
        documentId: string;
        generation: number;
        observedAt: string;
        maxBytes?: number;
    }): Observation;
    preparePasswordResult(target: PasswordTarget, origin: string): {
        kind: string;
        code?: string;
    };
    fillPasswordResult(target: PasswordTarget, origin: string, allowedOrigins: string[], value: string): {
        kind: string;
        code?: string;
    };
    preparePassword(target: PasswordTarget, origin: string): void;
    fillPassword(target: PasswordTarget, origin: string, allowedOrigins: string[], value: string): void;
    acquire(request: AcquisitionRequest): AcquisitionResult;
    matches(target: ObservedTarget, hint: LocatorHint, focusWindow?: {
        field: Element;
        chain: Element[] | null;
    }): boolean;
    withhold(values: string[]): void;
    privateInventory(): [string, boolean][];
    navigate(target: {
        documentId: string;
        generation: number;
    }, origin: string, destination: string): void;
    assertPage(target: {
        documentId: string;
        generation: number;
    }, origin: string, predicate: "url" | "title", expected: string): boolean;
    pageMatches(target: {
        documentId: string;
        generation: number;
    }, origin: string): boolean;
    validateInvocation(invocation: GuidedInvocation, allowViewportShift?: boolean): boolean;
    nativeTarget(invocation: GuidedInvocation): Element;
    confirmToggle(invocation: GuidedInvocation, element: Element): boolean;
    navigationExpected(invocation: GuidedInvocation): boolean;
    navigationProceed(): boolean;
    nativeState(invocation: GuidedInvocation): {
        alreadyChecked: boolean;
        requiresReveal: boolean;
    };
    acceptReveal(invocation: GuidedInvocation, element: Element): boolean;
    nativePoint(invocation: GuidedInvocation): {
        x: number;
        y: number;
        alreadyChecked: boolean;
    };
    invoke(invocation: GuidedInvocation): GuidedInvocationResult;
    dispose(): void;
};
