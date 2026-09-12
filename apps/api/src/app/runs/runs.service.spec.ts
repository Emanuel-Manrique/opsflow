import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { RunDto, RunEventDto } from '@opsflow/contracts';
import { RUN_EVENT_APPENDED, RUN_UPDATED_EVENT } from '@opsflow/contracts';
import { RunNotFoundError } from '@opsflow/persistence';
import type { RunEventRepository, RunRepository } from '@opsflow/persistence';
import type { RuntimeClientService } from '../runtime-client.service';
import { RunsService } from './runs.service';

describe('run snapshots over SSE', () => {
  const tenant = crypto.randomUUID();
  const id = crypto.randomUUID();
  const queued = { id, status: 'queued' } as RunDto;
  const runs = { findById: vi.fn<RunRepository['findById']>() };
  const events = { list: vi.fn<RunEventRepository['list']>() };
  let service: RunsService;

  beforeEach(() => {
    vi.useFakeTimers();
    runs.findById.mockReset().mockResolvedValue(queued);
    events.list.mockReset().mockResolvedValue([]);
    const repository = runs as unknown as RunRepository;
    const log = events as unknown as RunEventRepository;
    service = new RunsService(repository, {} as RuntimeClientService, log);
  });
  afterEach(() => { service.onModuleDestroy(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('sends the initial state, preserves tenant context and ends at a terminal state', async () => {
    const stream = await service.watch({ tenantId: tenant }, id);
    const events: MessageEvent[] = [];
    const complete = vi.fn<() => void>();
    stream.subscribe({ next: (event) => events.push(event), complete });
    expect(events).toEqual([{ type: RUN_UPDATED_EVENT, data: queued }]);
    runs.findById.mockImplementationOnce(async (context) => {
      expect(context.tenantId).toBe(tenant);
      return { ...queued, status: 'succeeded' };
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events[1].data).toMatchObject({ status: 'succeeded' });
    expect(complete).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs.findById).toHaveBeenCalledTimes(2);
  });

  function event(eventId: string, type: RunEventDto['type']): RunEventDto {
    const p1 = { id: eventId, runId: id, type, attempt: 1, traceId: null };
    return { ...p1, errorCode: null, durationMs: null, detail: null, createdAt: '2026-09-11T12:00:00.000Z' };
  }

  it('replays the history already recorded before streaming new events', async () => {
    events.list.mockResolvedValueOnce([event('1', 'run.started'), event('2', 'attempt.started')]);

    const stream = await service.watch({ tenantId: tenant }, id);
    const received: MessageEvent[] = [];
    stream.subscribe((message) => received.push(message));

    expect(received.map((message) => message.type)).toEqual([RUN_EVENT_APPENDED, RUN_EVENT_APPENDED, RUN_UPDATED_EVENT]);
    expect(received[0].data).toMatchObject({ type: 'run.started' });
  });

  it('resumes from the last id it sent rather than resending the backlog', async () => {
    events.list.mockResolvedValueOnce([event('7', 'run.started')]);
    const stream = await service.watch({ tenantId: tenant }, id);
    stream.subscribe();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(events.list).toHaveBeenLastCalledWith({ tenantId: tenant }, id, '7');
  });

  it('sends the event before the snapshot it produced', async () => {
    const stream = await service.watch({ tenantId: tenant }, id);
    const received: MessageEvent[] = [];
    stream.subscribe((message) => received.push(message));
    events.list.mockResolvedValueOnce([event('3', 'run.failed')]);
    runs.findById.mockResolvedValueOnce({ ...queued, status: 'failed' } as RunDto);

    await vi.advanceTimersByTimeAsync(1_000);

    const tail = received.slice(-2);
    expect(tail[0]).toMatchObject({ type: RUN_EVENT_APPENDED, data: { type: 'run.failed' } });
    expect(tail[1]).toMatchObject({ type: RUN_UPDATED_EVENT, data: { status: 'failed' } });
  });

  it('checks tenant access before opening the stream', async () => {
    runs.findById.mockRejectedValueOnce(new RunNotFoundError(id));
    const result = service.watch({ tenantId: tenant }, id);
    await expect(result).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('stops polling when the client unsubscribes', async () => {
    const stream = await service.watch({ tenantId: tenant }, id);
    const subscription = stream.subscribe();
    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs.findById).toHaveBeenCalledOnce();
  });

  it('rotates long-lived connections and ends active streams on shutdown', async () => {
    const stream = await service.watch({ tenantId: tenant }, id);
    const connection = stream.subscribe();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(connection.closed).toBe(true);
    const next = stream.subscribe();
    service.onModuleDestroy();
    expect(next.closed).toBe(true);
    expect(stream.subscribe().closed).toBe(true);
  });

  it('does not overlap slow reads and redacts errors after headers are sent', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const stream = await service.watch({ tenantId: tenant }, id);
    let fail!: (error: Error) => void;
    runs.findById.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const events: MessageEvent[] = [];
    stream.subscribe((event) => events.push(event));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runs.findById).toHaveBeenCalledTimes(2);
    fail(new Error('private database details'));
    await vi.advanceTimersByTimeAsync(0);
    expect(events[1]).toEqual({ type: 'error', data: 'Run updates temporarily unavailable.' });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'run.stream.failure', tenantId: tenant, runId: id, errorCode: 'Error' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('private database details');
  });
});
