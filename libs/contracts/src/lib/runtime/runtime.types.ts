export interface RunNowRequest { readonly workflowId: string; readonly chaosScenario?: string; }
export interface RunRequest { readonly runId: string; }
export interface RunResult { readonly runId: string; }
export interface RuntimeMetricsRequest { readonly _?: never; }

/** Queue counters as the orchestrator sees them. Zeros are only meaningful when reachable. */
export interface RuntimeMetrics {
  readonly reachable: boolean;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly failed: number;
  readonly workers: number;
}

export type RuntimeMethod = 'RunNow' | 'CancelRun' | 'RetryRun' | 'GetRuntimeHealth' | 'GetRuntimeMetrics';
