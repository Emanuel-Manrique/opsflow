import type { Span } from '@opentelemetry/api';

export interface Observation {
  readonly span: Span;
  readonly traceparent?: string;
}

export interface Telemetry {
  shutdown(): Promise<void>;
}
