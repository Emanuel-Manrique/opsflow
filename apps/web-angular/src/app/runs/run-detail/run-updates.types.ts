import type { ApiProblem, RunDto, RunEventDto } from '@opsflow/contracts';

export interface RunUpdatesState {
  readonly connection: 'connecting' | 'live' | 'reconnecting' | 'failed';
  readonly run?: RunDto;
  /** Everything the run has recorded so far, oldest first. */
  readonly events: readonly RunEventDto[];
  readonly problem?: ApiProblem;
}

export interface RunSnapshotSource { readonly id: string; readonly run?: RunDto; }
