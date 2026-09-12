import type { TenantContext } from '@opsflow/contracts';
import { Injectable, Logger } from '@nestjs/common';
import type { MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { catchError, concatMap, defer, exhaustMap, of } from 'rxjs';
import { startWith, ReplaySubject, takeUntil, takeWhile, timer } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Page, RunDto, RunListQuery } from '@opsflow/contracts';
import { RUN_EVENT_APPENDED, RUN_UPDATED_EVENT } from '@opsflow/contracts';
import { isTerminalRun } from '@opsflow/domain';
import { RunEventRepository, RunRepository } from '@opsflow/persistence';
import { RuntimeClientService } from '../runtime-client.service';

@Injectable()
export class RunsService implements OnModuleDestroy {
  private readonly logger = new Logger(RunsService.name);
  private readonly stopped = new ReplaySubject<void>(1);

  constructor(private readonly runs: RunRepository, private readonly runtime: RuntimeClientService, private readonly events: RunEventRepository) {}

  onModuleDestroy(): void {
    this.stopped.next();
    this.stopped.complete();
  }

  async watch(context: TenantContext, id: string): Promise<Observable<MessageEvent>> {
    // Resolve access before committing SSE headers so absent/foreign runs stay 404.
    const initial = await this.runs.findById(context, id);
    // The history so far, so a reader that joins mid-run or reloads sees the whole
    // fight rather than only what happens next.
    const backlog = await this.events.list(context, id);
    // Per subscription, not per service: a reconnect replays from the start and the
    // client discards the ids it already holds.
    let cursor = backlog.at(-1)?.id;
    const read = async () => {
      const run = await this.runs.findById(context, id);
      const appended = await this.events.list(context, id, cursor);
      if (appended.length) cursor = appended[appended.length - 1].id;
      return { appended, run };
    };
    // polling: one read/second per viewer. Share subscriptions if viewer load grows.
    return timer(1_000, 1_000).pipe(
      exhaustMap(() => defer(read)),
      startWith({ appended: backlog, run: initial }),
      // Events first, then the snapshot they produced, so the console never shows an
      // outcome before the event that explains it.
      concatMap(({ appended, run }) => [
        ...appended.map((event) => ({ type: RUN_EVENT_APPENDED, data: event })),
        { type: RUN_UPDATED_EVENT, data: run },
      ]),
      takeWhile((message) => !(message.type === RUN_UPDATED_EVENT && isTerminalRun((message.data as RunDto).status)), true),
      catchError((error: unknown) => {
        const p1 = { event: 'run.stream.failure', tenantId: context.tenantId, runId: id, requestId: context.traceId };
        this.logger.error({ ...p1, errorCode: error instanceof Error ? error.name : 'Error' });
        return of({ type: 'error', data: 'Run updates temporarily unavailable.' });
      }),
      // Rotate to bound HttpClient's accumulated progress text on long runs.
      takeUntil(timer(30_000)),
      takeUntil(this.stopped),
    );
  }

  async start(context: TenantContext, workflowId: string, chaosScenario?: string): Promise<RunDto> {
    const { runId } = await this.runtime.runNow(context, workflowId, chaosScenario);
    return this.runs.findById(context, runId);
  }

  async cancel(context: TenantContext, id: string): Promise<RunDto> {
    const { runId } = await this.runtime.cancelRun(context, id);
    return this.runs.findById(context, runId);
  }

  async retry(context: TenantContext, id: string): Promise<RunDto> {
    const { runId } = await this.runtime.retryRun(context, id);
    return this.runs.findById(context, runId);
  }

  findById(context: TenantContext, id: string): Promise<RunDto> {
    return this.runs.findById(context, id);
  }

  list(context: TenantContext, query: RunListQuery): Promise<Page<RunDto>> {
    return this.runs.list(context, query);
  }
}
