import type { ChildRuntimeDependencies } from './childRuntime.js';
/** Binds the runtime to a Node process. Exported so a test can drive it with a fake process. */
export interface ChildProcessLike {
    on(event: 'message', listener: (value: unknown) => void): unknown;
    send?: ((message: unknown) => boolean) | undefined;
    exit(code?: number): never;
}
export declare function startChild(processLike: ChildProcessLike, observed?: Pick<ChildRuntimeDependencies, 'observedBuild' | 'publishAppVideoOwner'>): void;
