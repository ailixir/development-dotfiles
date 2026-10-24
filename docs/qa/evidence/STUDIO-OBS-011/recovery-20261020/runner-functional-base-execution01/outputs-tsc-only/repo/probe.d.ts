export interface ProbeTls {
    readonly key: Buffer | string;
    readonly cert: Buffer | string;
    readonly ca: Buffer | string;
}
/** Reads the runner's TLS files from its environment. `null` when any is unset or unreadable. */
export declare function readProbeTls(env: Readonly<Record<string, string | undefined>>): ProbeTls | null;
export declare function probe(port: number, path: '/health' | '/ready', token: string, tls: ProbeTls | null): Promise<boolean>;
