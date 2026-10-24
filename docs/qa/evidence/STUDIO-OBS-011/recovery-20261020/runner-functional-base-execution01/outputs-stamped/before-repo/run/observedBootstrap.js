/** Exact page identity through the sequential bootstrap; no Playwright or wire capability. */
export class BootstrapPageGuard {
    closeUnexpected;
    phase = 'startup';
    startup;
    app;
    pending = new Set();
    violated = false;
    listener;
    constructor(closeUnexpected) {
        this.closeUnexpected = closeUnexpected;
    }
    inspectStartup(pages) { if (pages.length !== 1) {
        this.fail();
        throw new Error('TARGET_DRIFT');
    } this.startup = pages[0]; this.check(); return pages[0]; }
    opened(page) {
        if (this.phase === 'startup' && page === this.startup || this.phase === 'app' && page === this.app)
            return;
        if (this.phase === 'creating') {
            this.pending.add(page);
            if (this.pending.size > 1)
                this.fail();
            return;
        }
        this.fail();
        this.closeUnexpected(page);
    }
    check() { if (this.violated)
        throw new Error('TARGET_DRIFT'); }
    startupRemoved(pages) { this.check(); if (this.phase !== 'startup' || pages.length !== 0) {
        this.fail();
        throw new Error('TARGET_DRIFT');
    } this.startup = undefined; this.phase = 'empty'; }
    beginApp() { this.check(); if (this.phase !== 'empty')
        throw new Error('TARGET_DRIFT'); this.phase = 'creating'; }
    appReturned(page, pages) { this.check(); if (this.phase !== 'creating' || this.pending.size !== 1 || !this.pending.has(page) || pages.length !== 1 || pages[0] !== page) {
        this.fail();
        throw new Error('TARGET_DRIFT');
    } this.pending.clear(); this.app = page; this.phase = 'app'; }
    ready(page, pages) { return !this.violated && this.phase === 'app' && this.app === page && pages.length === 1 && pages[0] === page; }
    subscribe(listener) { this.listener = listener; if (this.violated)
        listener(); }
    fail() { this.violated = true; for (const page of this.pending)
        this.closeUnexpected(page); this.listener?.(); }
}
// Private identity metadata: no Error property, subtype or wire change.
const absoluteStartupTimeouts = new WeakMap();
function absoluteStartupTimeout(error, deadline) {
    absoluteStartupTimeouts.set(error, deadline);
    return error;
}
export function isAbsoluteStartupTimeout(error, deadline) {
    return error instanceof Error && absoluteStartupTimeouts.get(error) === deadline;
}
export function boundedStartup(work, deadline, signal, maxMs = 30000) {
    if (signal?.aborted)
        return Promise.reject(new Error('CANCELLED'));
    if (Date.now() >= deadline)
        return Promise.reject(absoluteStartupTimeout(new Error('TIMEOUT'), deadline));
    return new Promise((resolve, reject) => {
        const abort = () => { reject(new Error('CANCELLED')); };
        // Capture the existing delay-selection wall sample once.
        const remaining = deadline - Date.now();
        const timer = setTimeout(() => {
            const error = new Error('TIMEOUT');
            // A strictly earlier operation cap is not whole-start expiry; equality selects both boundaries.
            reject(remaining <= maxMs ? absoluteStartupTimeout(error, deadline) : error);
        }, Math.max(1, Math.min(maxMs, remaining)));
        signal?.addEventListener('abort', abort, { once: true });
        const clear = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        Promise.resolve().then(work).then(value => {
            clear();
            if (signal?.aborted)
                reject(new Error('CANCELLED'));
            else if (Date.now() >= deadline)
                reject(absoluteStartupTimeout(new Error('TIMEOUT'), deadline));
            else
                resolve(value);
        }, (error) => {
            clear();
            reject(error instanceof Error ? error : new Error('BOOTSTRAP_FAILED'));
        });
    });
}
//# sourceMappingURL=observedBootstrap.js.map