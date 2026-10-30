// The one env-driven set of ports the release-gate stack uses. Defaults sit in a 1xxxx range that does not
// collide with the live dev stack (:8080 backend, :8081 Core stand-in, :8090 runner, :8092 connector, :5181 Vite),
// and the live ports are REFUSED outright: nothing of the gate may bind to, stop or signal the live stack.
//   node ports.mjs env              print `export CHECKS_GATE_PORT_*=...` for the resolved set (exit 1 + message if invalid)
//   node ports.mjs check [names...] fail fast if any named port (default: all but recorder) is already listening
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const LIVE_PORTS = Object.freeze({ backend: 8080, core: 8081, runner: 8090, connector: 8092, frontend: 5181 });
export const DEFAULT_PORTS = Object.freeze({ backend: 18080, core: 18081, runner: 18090, connector: 18092, vault: 18200, app: 18177, recorder: 18188 });
export const PORT_VARS = Object.freeze({
  backend: 'CHECKS_GATE_PORT_BACKEND',
  core: 'CHECKS_GATE_PORT_CORE',
  runner: 'CHECKS_GATE_PORT_RUNNER',
  connector: 'CHECKS_GATE_PORT_CONNECTOR',
  vault: 'CHECKS_GATE_PORT_VAULT',
  app: 'CHECKS_GATE_PORT_APP',
  recorder: 'CHECKS_GATE_PORT_RECORDER',
});

/** Resolves the gate ports from the environment; throws a clear Error for a bad, duplicate or live-stack port. */
export function gatePorts(env = process.env) {
  const ports = {};
  for (const [name, variable] of Object.entries(PORT_VARS)) {
    const raw = env[variable];
    const value = raw === undefined || raw === '' ? DEFAULT_PORTS[name] : Number(raw);
    if (Object.values(LIVE_PORTS).includes(value)) throw new Error(`${variable}=${value} is a port of the live dev stack; the gate never uses it`);
    if (!Number.isInteger(value) || value < 18000 || value > 18999) throw new Error(`${variable}=${String(raw)} is not an isolated TCP port between18000 and18999`);
    ports[name] = value;
  }
  const live = new Set(Object.values(LIVE_PORTS));
  for (const [name, value] of Object.entries(ports)) {
    if (live.has(value)) throw new Error(`${PORT_VARS[name]}=${value} is a port of the live dev stack (${Object.values(LIVE_PORTS).join(', ')}); the gate never uses it`);
  }
  const seen = new Map();
  for (const [name, value] of Object.entries(ports)) {
    if (seen.has(value)) throw new Error(`${PORT_VARS[name]} and ${PORT_VARS[seen.get(value)]} are both ${value}`);
    seen.set(value, name);
  }
  return ports;
}

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (listening) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(700, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** True when something accepts connections on the port on 127.0.0.1 or ::1. */
export async function isListening(port) {
  return (await probe('127.0.0.1', port)) || (await probe('::1', port));
}

/** Throws a clear Error naming every port (and its variable) that is already listening. */
export async function assertFree(names, ports = gatePorts()) {
  const busy = [];
  for (const name of names) {
    if (await isListening(ports[name])) busy.push(`${PORT_VARS[name]}=${ports[name]} is already listening`);
  }
  if (busy.length > 0) throw new Error(`${busy.join('; ')}. Pick another port or stop whatever holds it (the gate never stops anything it did not start).`);
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = '', ...names] = process.argv.slice(2);
  try {
    const ports = gatePorts();
    if (command === 'env') {
      for (const [name, variable] of Object.entries(PORT_VARS)) console.log(`export ${variable}=${ports[name]}`);
    } else if (command === 'check') {
      await assertFree(names.length > 0 ? names : Object.keys(ports).filter((n) => n !== 'recorder'), ports);
    } else {
      throw new Error('usage: node ports.mjs <env|check [names...]>');
    }
  } catch (failure) {
    console.error(`[gate-ports] ${failure instanceof Error ? failure.message : String(failure)}`);
    process.exit(1);
  }
}
