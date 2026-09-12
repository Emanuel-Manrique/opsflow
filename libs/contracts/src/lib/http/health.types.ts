export type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: string;
}

export interface ReadinessResponse {
  readonly status: 'ready' | 'not_ready';
  readonly checks: Readonly<Record<string, DependencyStatus>>;
}
