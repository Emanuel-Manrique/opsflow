import type { FactoryProvider } from '@nestjs/common';
import { startTelemetry } from './observability';

const TELEMETRY = Symbol('TELEMETRY');

export function provideTelemetry(serviceName: string): FactoryProvider {
  return {
    provide: TELEMETRY,
    useFactory: () => {
      const telemetry = startTelemetry(serviceName);
      return { onApplicationShutdown: () => telemetry.shutdown() };
    },
  };
}
