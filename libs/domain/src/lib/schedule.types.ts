export interface ScheduleProblem {
  readonly field: 'cronExpr' | 'timezone';
  readonly message: string;
}
export type ScheduleFrequency = 'minute' | 'interval' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom';
