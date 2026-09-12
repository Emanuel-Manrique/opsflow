import { SERVICE_PORTS } from '@opsflow/contracts';
import type { ServiceName } from './service-url.types';

function portEnvVar(service: ServiceName): string {
  return `${service.toUpperCase()}_PORT`;
}

export function serviceBaseUrl(service: ServiceName): string {
  const host = process.env['HOST'] || 'localhost';
  const port = process.env[portEnvVar(service)] || String(SERVICE_PORTS[service]);

  return `http://${host}:${port}`;
}

export function serviceHealthUrl(service: ServiceName): string {
  return `${serviceBaseUrl(service)}/api/health`;
}
