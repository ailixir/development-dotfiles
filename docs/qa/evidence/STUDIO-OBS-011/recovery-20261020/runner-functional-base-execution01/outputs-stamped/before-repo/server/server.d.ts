import type { Server } from 'node:https';
import type { ListenerConfig } from './config.js';
import type { RouteOptions } from './routes.js';
/**
 * Timeouts of the single listener (ruling Q7): one server-level set for every route family. They are
 * the values the guided server used (`headersTimeout` and `requestTimeout` are server-level in Node,
 * and the route is not known until the head is parsed); the replay routes answer well inside them.
 * The 30 s socket timeout is a backstop above the guided close bound (ruling D5), never the bound.
 */
export declare const LISTENER_TIMEOUTS: Readonly<{
    headersTimeoutMs: 10000;
    requestTimeoutMs: 15000;
    socketTimeoutMs: 30000;
}>;
/** PEM material of the listener. The same key pair is the runner's client identity on its callbacks. */
export interface ListenerTls {
    readonly key: Buffer;
    readonly cert: Buffer;
    readonly ca: Buffer;
}
export interface ListenerSettings {
    readonly tls: ListenerTls;
    /** Fingerprint of the backend's client certificate (`X509Certificate.fingerprint256`). */
    readonly controllerCertificateFingerprint256: string;
}
export interface RunnerServer {
    listen(port: number, host: string): Promise<number>;
    /** Stops accepting connections and resolves when open ones have finished. */
    close(): Promise<void>;
    /** Ends every connection, in flight or not. Used once the guided half of the drain has settled. */
    closeAllConnections(): void;
    /** Bound port; `0` before `listen` resolves. */
    readonly port: number;
    readonly raw: Server;
}
export interface RunnerServerOptions extends RouteOptions {
    readonly listener: ListenerSettings;
}
export declare function createRunnerServer(options: RunnerServerOptions): RunnerServer;
/**
 * Why the listener material was refused, or the material. Every problem is one value-free line: it
 * names the key, never a path, a fingerprint or a byte of the file (drop D1.0 section 2.3).
 */
export type ListenerMaterial = {
    readonly ok: true;
    readonly settings: ListenerSettings;
} | {
    readonly ok: false;
    readonly problems: readonly string[];
};
/**
 * Reads the listener's PEM files once, at startup, and refuses what could not serve: an unreadable or
 * empty file, a file that is not PEM, a key that does not belong to the certificate, a CA with no
 * certificate in it, and (ruling 1.5 d) a leaf whose extended key usage extension is present without
 * `serverAuth` or without `clientAuth`. A leaf with no such extension is valid for every purpose.
 *
 * The probe presents this certificate as a *client* certificate and the guided callbacks present the
 * same key pair as a client, so a `serverAuth`-only leaf would leave a pod that never turns Ready and
 * logs nothing; this refuses it before anything listens.
 */
export declare function readListenerMaterial(config: ListenerConfig, read?: (file: string) => Buffer): ListenerMaterial;
