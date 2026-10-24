/** Exact page identity through the sequential bootstrap; no Playwright or wire capability. */
export declare class BootstrapPageGuard<T> {
    private readonly closeUnexpected;
    private phase;
    private startup;
    private app;
    private pending;
    private violated;
    private listener;
    constructor(closeUnexpected: (page: T) => void);
    inspectStartup(pages: readonly T[]): T;
    opened(page: T): void;
    check(): void;
    startupRemoved(pages: readonly T[]): void;
    beginApp(): void;
    appReturned(page: T, pages: readonly T[]): void;
    ready(page: T, pages: readonly T[]): boolean;
    subscribe(listener: () => void): void;
    private fail;
}
export declare function isAbsoluteStartupTimeout(error: unknown, deadline: number): boolean;
export declare function boundedStartup<T>(work: () => Promise<T>, deadline: number, signal?: AbortSignal, maxMs?: number): Promise<T>;
