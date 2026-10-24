/** Trusted-worker-only masking state. Never returned by the public observation facade. */
export declare class PrivateObservationInventory {
    private readonly values;
    private bytes;
    private failed;
    private disposed;
    assertLive(): void;
    merge(entries: readonly (readonly [string, boolean])[]): void;
    /** Only the isolated collector installation may consume this private snapshot. */
    snapshot(): [string, boolean][];
    fail(): void;
    dispose(): void;
}
