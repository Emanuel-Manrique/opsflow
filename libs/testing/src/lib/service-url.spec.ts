import { SERVICE_PORTS } from '@opsflow/contracts';
import { serviceBaseUrl, serviceHealthUrl } from './service-url';

describe('service urls', () => {
  beforeEach(() => {
    for (const name of ['HOST', 'PORT', 'API_PORT', 'ORCHESTRATOR_PORT', 'WORKER_PORT']) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(() => vi.unstubAllEnvs());

  it('uses a distinct default URL for each service', () => {
    const urls = (Object.keys(SERVICE_PORTS) as (keyof typeof SERVICE_PORTS)[]).map(serviceBaseUrl);

    expect(new Set(urls).size).toBe(urls.length);
  });

  it('uses only the matching service port override', () => {
    vi.stubEnv('API_PORT', '9999');

    expect(serviceBaseUrl('api')).toBe('http://localhost:9999');
    expect(serviceBaseUrl('worker')).toBe(`http://localhost:${SERVICE_PORTS.worker}`);
  });

  it('ignores an ambiguous PORT variable', () => {
    vi.stubEnv('PORT', '3100');

    expect(serviceBaseUrl('orchestrator')).toBe(`http://localhost:${SERVICE_PORTS.orchestrator}`);
  });

  it('builds a remote health URL', () => {
    vi.stubEnv('HOST', 'opsflow.test');

    expect(serviceHealthUrl('worker')).toBe(`http://opsflow.test:${SERVICE_PORTS.worker}/api/health`);
  });
});
