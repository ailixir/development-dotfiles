export const LIVE_PORTS: Readonly<Record<'backend' | 'core' | 'runner' | 'connector' | 'frontend', number>>;
export const DEFAULT_PORTS: Readonly<Record<GatePortName, number>>;
export const PORT_VARS: Readonly<Record<GatePortName, string>>;
export type GatePortName = 'backend' | 'core' | 'runner' | 'connector' | 'vault' | 'app' | 'recorder';
export function gatePorts(env?: NodeJS.ProcessEnv): Record<GatePortName, number>;
export function isListening(port: number): Promise<boolean>;
export function assertFree(names: GatePortName[], ports?: Record<GatePortName, number>): Promise<void>;
