import type { ApiProblem, Page, RunDto } from '@opsflow/contracts';

export type RunListState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: Page<RunDto> }
  | { readonly status: 'failed'; readonly problem: ApiProblem; readonly page?: Page<RunDto> };

export type RunGlyph = 'live' | 'ok' | 'failed' | 'cancelled';

export interface RunStat {
  readonly label: string;
  readonly scope: string;
  readonly value: number;
}
