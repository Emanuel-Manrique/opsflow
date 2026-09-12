export interface PurgeCounts {
  readonly runs: number;
  readonly auditEntries: number;
}
export interface RemovedRow {
  readonly removed: number;
}

export interface CountRow { readonly count: string; }
