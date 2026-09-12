/** SQL fragments projected from RUN_TRANSITIONS. Repositories interpolate these; they do not rewrite outcomes. */
export interface SqlMachine {
  readonly status: string;
  readonly finishedAt: string;
  readonly error: string;
  readonly sources: string;
}
