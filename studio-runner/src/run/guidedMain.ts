/** Standalone long-lived guided worker. The config is a trusted mounted file, never job input.
 * No parent IPC, replay artifact execution, gateway or credential resolution lives here. */
import { readFile } from 'node:fs/promises';
import { createGuidedServer, guidedCallback, guidedClaimClient } from '../guided/transport.js';
import { launchGuidedBrowser } from './browser.js';
import type { ObservationRule, ObservationApplicationPolicy } from './observationTypes.js';
import { insist } from '../guided/contracts.js';

interface MountedConfig {
  workerId: string; host: string; port: number; journalDirectory: string;
  tlsKeyFile: string; tlsCertFile: string; tlsCaFile: string;
  controllerIssuer: string; controllerSubject: string; controllerPublicKeyFile: string;
  controllerCertificateFingerprint256: string; callbackBaseUrl: string; callbackTokenFile: string;
  rules: ObservationRule[]; applicationPolicy?: ObservationApplicationPolicy;
}
async function main(): Promise<void> {
  insist(!process.env.DEBUG && !process.env.PWDEBUG && !process.env.NODE_DEBUG && !process.env.NODE_OPTIONS, 'CONFIGURATION_DENIED');
  const file = process.env.STUDIO_GUIDED_CONFIG_FILE; insist(file, 'CONFIGURATION_DENIED');
  const config = JSON.parse(await readFile(file, 'utf8')) as MountedConfig;
  insist(Object.keys(config).every(key => ['workerId','host','port','journalDirectory','tlsKeyFile','tlsCertFile','tlsCaFile','controllerIssuer','controllerSubject','controllerPublicKeyFile','controllerCertificateFingerprint256','callbackBaseUrl','callbackTokenFile','rules','applicationPolicy'].includes(key)), 'CONFIGURATION_DENIED');
  insist(config.workerId && Number.isInteger(config.port) && config.port >= 0 && config.port <= 65535, 'CONFIGURATION_DENIED');
  const tls = { key: await readFile(config.tlsKeyFile), cert: await readFile(config.tlsCertFile), ca: await readFile(config.tlsCaFile) };
  const app = createGuidedServer({ workerId: config.workerId, journalDirectory: config.journalDirectory, tls, rules: config.rules,
    ...(config.applicationPolicy ? { applicationPolicy: config.applicationPolicy } : {}),
    controllerJwt: { issuer: config.controllerIssuer, subject: config.controllerSubject, publicKey: await readFile(config.controllerPublicKeyFile, 'utf8') },
    controllerCertificateFingerprint256: config.controllerCertificateFingerprint256, launch: launchGuidedBrowser,
    claim: guidedClaimClient({ baseUrl: config.callbackBaseUrl, tls, controllerCertificateFingerprint256: config.controllerCertificateFingerprint256, token: async () => (await readFile(config.callbackTokenFile, 'utf8')).trim() }),
    callback: guidedCallback({ baseUrl: config.callbackBaseUrl, tls, controllerCertificateFingerprint256: config.controllerCertificateFingerprint256, token: async () => (await readFile(config.callbackTokenFile, 'utf8')).trim() }) });
  await new Promise<void>((resolve, reject) => { app.server.once('error', reject); app.server.listen(config.port, config.host, resolve); });
  const stop = () => { void app.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
void main().catch(() => { process.stderr.write('GUIDED_WORKER_UNAVAILABLE\n'); process.exitCode = 1; });
