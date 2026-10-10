/** Trusted-worker-only masking state. Never returned by the public observation facade. */
export class PrivateObservationInventory {
  private readonly values = new Map<string, boolean>();
  private bytes = 0;
  private failed = false;
  private disposed = false;

  assertLive(): void {
    if (this.failed || this.disposed) throw new Error('CONTEXT_LOST');
  }
  merge(entries: readonly (readonly [string, boolean])[]): void {
    this.assertLive();
    try {
      for (const [value, strict] of entries) {
        if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('CONTEXT_LOST');
        for (const variant of [value,value.replace(/[\u200b\u00ad]/gu,'').replace(/\s+/gu,' ').trim()]) {
          if (!variant) continue;
          if (!this.values.has(variant)) {
            const bytes=Buffer.byteLength(variant);
            if(this.values.size>=4096 || this.bytes+bytes>1048576)throw new Error('CONTEXT_LOST');
            this.bytes+=bytes;
          }
          this.values.set(variant,strict||this.values.get(variant)===true);
        }
      }
    } catch { this.fail(); throw new Error('CONTEXT_LOST'); }
  }
  /** Only the isolated collector installation may consume this private snapshot. */
  snapshot(): [string, boolean][] { this.assertLive(); return [...this.values]; }
  fail(): void { this.failed=true; }
  dispose(): void { this.disposed=true;this.values.clear();this.bytes=0; }
}
