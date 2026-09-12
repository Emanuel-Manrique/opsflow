export type ChaosScenario = 'recovery' | 'http-500' | 'timeout';

export interface ChaosScenarioInfo {
  readonly id: ChaosScenario;
  readonly label: string;
  /** What the system will really do, stated plainly. */
  readonly effect: string;
}
