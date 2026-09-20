/** Authenticated loopback health checks for Kubernetes exec probes. Never prints the token. */
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';

export function probe(port: number, path: '/health' | '/ready', token: string): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || token.trim() === '') {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    const request = get({ hostname: '127.0.0.1', port, path,
      headers: { authorization: `Bearer ${token}` }, timeout: 2000 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => { resolve(false); });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (path !== '/health' && path !== '/ready') {
    process.exitCode = 1;
  } else {
    process.exitCode = await probe(Number(process.env.STUDIO_RUNNER_PORT ?? '8080'), path,
      process.env.STUDIO_RUNNER_SERVICE_IDENTITY ?? '') ? 0 : 1;
  }
}
