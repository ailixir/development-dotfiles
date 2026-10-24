/** Trusted-worker-only masking state. Never returned by the public observation facade. */
export class PrivateObservationInventory {
    values = new Map();
    bytes = 0;
    failed = false;
    disposed = false;
    assertLive() {
        if (this.failed || this.disposed)
            throw new Error('CONTEXT_LOST');
    }
    merge(entries) {
        this.assertLive();
        try {
            for (const [value, strict] of entries) {
                if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
                    throw new Error('CONTEXT_LOST');
                for (const variant of [value, value.replace(/[\u200b\u00ad]/gu, '').replace(/\s+/gu, ' ').trim()]) {
                    if (!variant)
                        continue;
                    if (!this.values.has(variant)) {
                        const bytes = Buffer.byteLength(variant);
                        if (this.values.size >= 4096 || this.bytes + bytes > 1048576)
                            throw new Error('CONTEXT_LOST');
                        this.bytes += bytes;
                    }
                    this.values.set(variant, strict || this.values.get(variant) === true);
                }
            }
        }
        catch {
            this.fail();
            throw new Error('CONTEXT_LOST');
        }
    }
    /** Only the isolated collector installation may consume this private snapshot. */
    snapshot() { this.assertLive(); return [...this.values]; }
    fail() { this.failed = true; }
    dispose() { this.disposed = true; this.values.clear(); this.bytes = 0; }
}
//# sourceMappingURL=observationInventory.js.map