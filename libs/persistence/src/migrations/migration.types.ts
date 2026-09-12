export interface DatabaseTableRow {
  readonly table_name: string;
}
export interface ScheduledWorkflow {
  id: string;
  cron_expr: string;
  timezone: string;
}
export interface DatabaseIndexRow {
  readonly indexname: string;
  readonly indexdef: string;
}
export interface LedgerRow {
  readonly name: string;
}
export interface ConstraintRow {
  readonly conname: string;
  readonly definition: string;
}
