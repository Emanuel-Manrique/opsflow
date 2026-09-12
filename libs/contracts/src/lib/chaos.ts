import type { ChaosScenario, ChaosScenarioInfo } from './chaos.types';

export const CHAOS_SCENARIOS: Record<ChaosScenario, ChaosScenarioInfo & { path: string }> = {
  recovery: {
    id: 'recovery',
    label: 'Recover HTTP 500',
    effect: 'The first request fails. The next attempt succeeds automatically: 500 → backoff → 204.',
    path: '/hooks/chaos/recovery',
  },
  'http-500': {
    id: 'http-500',
    label: 'HTTP 500',
    effect: 'Webhook returns 500 on every call. Three attempts, then the run fails.',
    path: '/hooks/chaos/500',
  },
  timeout: {
    id: 'timeout',
    label: 'Inject timeout',
    effect: "Webhook answers after 8s, past the worker's 5s deadline. Each attempt aborts.",
    path: '/hooks/chaos/timeout',
  },
};

export function isChaosScenario(value: string): value is ChaosScenario {
  return Object.hasOwn(CHAOS_SCENARIOS, value);
}

export function chaosScenarioList(): readonly ChaosScenarioInfo[] {
  return Object.values(CHAOS_SCENARIOS).map(({ path: _path, ...info }) => info);
}

export function chaosWebhook(scenario: ChaosScenario, origin: string): { url: string; method: 'POST' } {
  return { url: `${origin}${CHAOS_SCENARIOS[scenario].path}`, method: 'POST' };
}
