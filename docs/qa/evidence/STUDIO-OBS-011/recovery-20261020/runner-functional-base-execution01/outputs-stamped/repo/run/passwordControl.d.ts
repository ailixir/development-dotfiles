import type { ObservationSession } from './observationTypes.js';
export interface PasswordWorldState {
    closed: boolean;
    busy: boolean;
    generation: number;
    observedNavigation: number;
    navigation: number;
    documentId: string | undefined;
    available: boolean;
}
export interface PasswordWorldResult {
    result: {
        value?: unknown;
    };
    exceptionDetails?: {
        exception?: {
            description?: string;
        };
    };
}
export interface PasswordWorldPort {
    current(): PasswordWorldState;
    call(method: 'preparePassword' | 'fillPassword', values: readonly unknown[]): Promise<PasswordWorldResult>;
}
/** A private trusted control refusal before any value write, never a wire claim. */
export declare class PasswordNoEffect extends Error {
    readonly noEffect = true;
}
/** Metadata/transport boundary only. The sole candidate definition and element pin stay in
 * the isolated collector; this port cannot resolve a selector or inspect a page. */
export declare function createPasswordControl(port: PasswordWorldPort, assertLive: () => void, withhold: (values: readonly string[]) => Promise<void>): Required<Pick<ObservationSession, 'preparePassword' | 'fillPassword'>>;
