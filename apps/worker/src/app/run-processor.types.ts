import type { NewRunEvent } from '@opsflow/persistence';

export type Recorder = (event: Omit<NewRunEvent, 'runId' | 'attempt' | 'traceId'>) => Promise<void>;
