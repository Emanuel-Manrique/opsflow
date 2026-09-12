import type { SERVICE_PORTS } from '@opsflow/contracts';

export type ServiceName = keyof typeof SERVICE_PORTS;

export interface WaitForHttpOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}
