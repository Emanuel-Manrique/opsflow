import type { TenantContext } from '@opsflow/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { RUN_ATTEMPTS, RUN_JOB, RUN_QUEUE } from '@opsflow/contracts';
import type { DependencyStatus, RunJobData } from '@opsflow/contracts';
import type { Action } from '@opsflow/domain';
import { RunEventRepository, RunRepository } from '@opsflow/persistence';
import type { Attributes } from '@opentelemetry/api';
import { observe } from '@opsflow/observability';

import type { Recorder } from './run-processor.types';

const WEBHOOK_TIMEOUT_MS = 5_000;

@Injectable()
export class RunProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunProcessor.name);
  private worker?: Worker<RunJobData, void, typeof RUN_JOB>;

  constructor(private readonly config: ConfigService, private readonly runs: RunRepository, private readonly events: RunEventRepository) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    const connection = { url, maxRetriesPerRequest: null };
    const handler = (job: Job<RunJobData, void, typeof RUN_JOB>) => this.process(job);
    const params = [RUN_QUEUE, handler, { connection, maxStartedAttempts: RUN_ATTEMPTS }] as const;
    const worker = new Worker<RunJobData, void, typeof RUN_JOB>(...params);
    worker.on('error', (error) => this.logger.warn({ event: 'redis.error', errorCode: error.name }));
    this.worker = worker;
    await worker.waitUntilReady();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async check(): Promise<DependencyStatus> {
    const worker = this.worker;
    if (!worker?.isRunning()) return 'down';
    try {
      const client = await worker.backend.connection.client;
      return client.status === 'ready' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  private async process(job: Job<RunJobData>): Promise<void> {
    const data = job.data;
    const attempt = job.attemptsStarted;
    const p1 = { tenantId: data.tenantId, workflowId: data.workflowId, runId: data.runId, requestId: data.requestId };
    const queuedAt = Date.parse(data.queuedAt ?? '');
    const queueLagMs = Number.isFinite(queuedAt) ? Math.max(0, Date.now() - queuedAt) : undefined;
    const attributes = { ...p1, attempt, queueLagMs, outcome: 'error' };
    await observe('run.attempt', attributes, async (observation) => {
      const traceId = observation.span.spanContext().traceId;
      attributes.outcome = await this.perform(data, attempt, attributes, traceId);
    }, data.traceparent);
  }

  private async perform(data: RunJobData, attempt: number, attributes: Attributes, traceId: string): Promise<string> {
    const context = { tenantId: data.tenantId };
    // outbox can deliver the same job twice
    if (!await this.runs.markRunning(context, data.runId, attempt)) return 'skipped';
    const record: Recorder = (event) => {
      const entry = { runId: data.runId, attempt, traceId, ...event };
      // The attempt is the work; losing its log must not fail it.
      return this.events.append(context, entry).catch((error: unknown) => {
        this.logger.warn({ event: 'run.event.dropped', runId: data.runId, errorCode: error instanceof Error ? error.name : 'Error' });
      });
    };
    await record({ type: 'attempt.started' });

    const cancellation = new AbortController();
    const stop = new AbortController();
    const args = [context, data.runId, cancellation, stop.signal] as const;
    const watching = this.watchCancellation(...args).catch((error: unknown) => {
      cancellation.abort(error);
    });
    try {
      if (await this.runs.isCancellationRequested(context, data.runId)) throw new UnrecoverableError('Run cancelled.');
      await this.execute(data.action, cancellation.signal, data.runId, record, attempt);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Run failed.';
      const retry = !(error instanceof UnrecoverableError) && attempt < RUN_ATTEMPTS;
      const state = await this.runs.markFailed(context, data.runId, message, attempt, retry);
      attributes['outcome'] = state;
      if (state === 'cancelled') {
        await record({ type: 'run.cancelled' });
        return 'cancelled';
      }
      const errorCode = error instanceof Error && 'errorCode' in error && typeof error.errorCode === 'string' ? error.errorCode : 'UNKNOWN';
      await record({ type: 'worker.failed', errorCode });
      if (state === 'retrying') await record({ type: 'retry.scheduled', errorCode, detail: `attempt ${attempt + 1}/${RUN_ATTEMPTS}` });
      else await record({ type: 'run.failed', errorCode });
      throw error;
    } finally {
      stop.abort();
      await watching;
    }

    // webhook already fired; don't mark it failed if db dies
    const state = await this.runs.markSucceeded(context, data.runId, attempt);
    await record({ type: state === 'succeeded' ? 'run.succeeded' : 'run.cancelled' });
    return state;
  }

  private async watchCancellation(context: TenantContext, id: string, controller: AbortController, stop: AbortSignal): Promise<void> {
    while (!stop.aborted) {
      if (await this.runs.isCancellationRequested(context, id)) {
        controller.abort(new UnrecoverableError('Run cancelled.'));
        return;
      }
      try {
        await delay(250, undefined, { signal: stop });
      } catch (error) {
        if (!stop.aborted) throw error;
      }
    }
  }

  private async execute(action: Action, cancellation: AbortSignal, runId: string, record: Recorder, attempt: number): Promise<void> {
    if (action.type === 'noop') {
      return;
    }

    const url = new URL(action.url);
    const configured = this.config.getOrThrow<string>('WEBHOOK_ALLOWED_ORIGINS');
    const allowed = configured.split(',').map((origin) => origin.trim());

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !allowed.includes(url.origin)) {
      throw Object.assign(new UnrecoverableError('Webhook destination is not allowed.'), { errorCode: 'DESTINATION_REJECTED' });
    }

    const timeout = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS);
    const signal = AbortSignal.any([timeout, cancellation]);
    const p1 = { method: action.method, signal, redirect: 'manual' as const };
    const headers = { 'Idempotency-Key': runId, 'X-Opsflow-Attempt': String(attempt) };
    // Host only: the path and query can carry tokens.
    await record({ type: 'http.request', detail: `${action.method} ${url.host}` });
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    let response: Response;
    try {
      response = await fetch(url, { ...p1, headers });
    } catch {
      const timedOut = timeout.aborted && signal.reason === timeout.reason;
      const errorCode = timedOut ? 'TIMEOUT' : cancellation.aborted ? 'CANCELLED' : 'NETWORK';
      await record({ type: timedOut ? 'http.timeout' : 'http.failed', durationMs: elapsed(), errorCode });
      if (cancellation.aborted && !timedOut) throw cancellation.reason;
      const message = timedOut ? 'Webhook timed out.' : 'Webhook request failed.';
      throw Object.assign(new Error(message), { errorCode });
    }
    // don't read the body
    await response.body?.cancel();

    if (!response.ok) {
      const message = `Webhook returned HTTP ${response.status}.`;
      const p2 = { durationMs: elapsed(), errorCode: `HTTP_${response.status}`, detail: String(response.status) };
      await record({ type: 'http.failed', ...p2 });
      const retryable = response.status >= 500 || response.status === 408 || response.status === 429;
      const error = retryable ? new Error(message) : new UnrecoverableError(message);
      throw Object.assign(error, { errorCode: p2.errorCode });
    }
    await record({ type: 'http.succeeded', durationMs: elapsed(), detail: String(response.status) });
  }
}
