import { observe } from '@opsflow/observability';
import type { Observation } from '@opsflow/observability';
import type { TenantContext } from '@opsflow/contracts';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Metadata, Server, ServerCredentials, status } from '@grpc/grpc-js';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import type { ServiceDefinition } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { isUUID } from 'class-validator';
import { HTTP_HEADERS, RUNTIME_CREDENTIALS_REJECTED, chaosWebhook, isChaosScenario } from '@opsflow/contracts';
import { RUNTIME_PROTO, RUNTIME_SERVICE } from '@opsflow/contracts';
import type { RunRequest, RunNowRequest, RunResult } from '@opsflow/contracts';
import type { ReadinessResponse, RuntimeMetrics } from '@opsflow/contracts';
import type { Action } from '@opsflow/domain';
import { RunRepository, PersistenceHealth } from '@opsflow/persistence';
import { NotFoundInTenantError, RunNotFoundError, RunStateError } from '@opsflow/persistence';
import { SchemaNotCurrentError } from '@opsflow/persistence';
import { SessionRepository } from '@opsflow/persistence';
import { RunQueue } from './run-queue';

@Injectable()
export class RuntimeServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuntimeServerService.name);
  private readonly server = new Server();
  private secret = '';

  constructor(private readonly config: ConfigService, private readonly runs: RunRepository, private readonly persistence: PersistenceHealth, private readonly sessions: SessionRepository, private readonly queue: RunQueue) {}

  async onModuleInit(): Promise<void> {
    this.secret = this.config.getOrThrow<string>('RUNTIME_SHARED_SECRET');
    const file = join(__dirname, 'assets', RUNTIME_PROTO);
    const definition = loadSync(file, { defaults: true });
    const service = definition[RUNTIME_SERVICE] as ServiceDefinition;
    const runNow = (call: ServerUnaryCall<RunNowRequest, RunResult>, cb: sendUnaryData<RunResult>) => {
      const work = async (traceId: string, traceparent?: string) => {
        const context = await this.beginCommand(call.metadata, traceId, traceparent);
        this.assertId(call.request.workflowId);
        const run = await this.runs.create(context, call.request.workflowId, this.fault(call.request.chaosScenario));
        return { runId: run.id };
      };
      void this.handle('RunNow', call, cb, work);
    };
    const cancelRun = (call: ServerUnaryCall<RunRequest, RunResult>, cb: sendUnaryData<RunResult>) => {
      const work = async (traceId: string, traceparent?: string) => {
        const context = await this.beginCommand(call.metadata, traceId, traceparent);
        this.assertId(call.request.runId);
        const run = await this.runs.cancel(context, call.request.runId);
        return { runId: run.id };
      };
      void this.handle('CancelRun', call, cb, work);
    };
    const getRuntimeHealth = (call: ServerUnaryCall<object, ReadinessResponse>, cb: sendUnaryData<ReadinessResponse>) => {
      void this.handle('GetRuntimeHealth', call, cb, () => this.health());
    };
    const getRuntimeMetrics = (call: ServerUnaryCall<object, RuntimeMetrics>, cb: sendUnaryData<RuntimeMetrics>) => {
      void this.handle('GetRuntimeMetrics', call, cb, () => this.queue.metrics());
    };
    const retryRun = (call: ServerUnaryCall<RunRequest, RunResult>, cb: sendUnaryData<RunResult>) => {
      const work = async (traceId: string, traceparent?: string) => {
        const context = await this.beginCommand(call.metadata, traceId, traceparent);
        this.assertId(call.request.runId);
        const run = await this.runs.retry(context, call.request.runId);
        return { runId: run.id };
      };
      void this.handle('RetryRun', call, cb, work);
    };
    this.server.addService(service, { RunNow: runNow, CancelRun: cancelRun, GetRuntimeHealth: getRuntimeHealth, GetRuntimeMetrics: getRuntimeMetrics, RetryRun: retryRun });
    const host = this.config.getOrThrow<string>('ORCHESTRATOR_GRPC_HOST');
    const port = this.config.getOrThrow<number>('ORCHESTRATOR_GRPC_PORT');
    const credentials = ServerCredentials.createInsecure();
    await new Promise<void>((resolve, reject) => {
      this.server.bindAsync(`${host}:${port}`, credentials, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.logger.log(`Runtime gRPC listening on ${host}:${port}`);
  }

  async onModuleDestroy(): Promise<void> {
    const timeout = setTimeout(() => this.server.forceShutdown(), 3_000);
    try {
      await new Promise<void>((resolve) => this.server.tryShutdown(() => resolve()));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async health(): Promise<ReadinessResponse> {
    // redis is on http /ready, not here
    const checks = await this.persistence.check();
    const ready = Object.values(checks).every((check) => check === 'up');
    return { status: ready ? 'ready' : 'not_ready', checks };
  }

  private assertCaller(metadata: Metadata): void {
    const offered = metadata.get(HTTP_HEADERS.runtimeToken);
    const value = offered.length === 1 && typeof offered[0] === 'string' ? offered[0] : '';
    const presented = Buffer.from(value);
    const expected = Buffer.from(this.secret);
    const same = presented.length === expected.length && timingSafeEqual(presented, expected);
    if (!same) {
      throw Object.assign(new Error(RUNTIME_CREDENTIALS_REJECTED), { code: status.UNAUTHENTICATED });
    }
  }

  private fault(scenario: string | undefined): Action | undefined {
    if (!scenario) return undefined;
    const available = this.config.getOrThrow<string>('NODE_ENV') !== 'production';
    if (!available || !isChaosScenario(scenario)) {
      throw Object.assign(new Error('Unknown chaos scenario.'), { code: status.INVALID_ARGUMENT });
    }
    const origin = this.config.getOrThrow<string>('CHAOS_WEBHOOK_ORIGIN');
    return { type: 'webhook', ...chaosWebhook(scenario, origin) };
  }

  private assertId(id: unknown): void {
    if (typeof id !== 'string' || !isUUID(id)) {
      const error = new Error('A valid UUID is required.');
      throw Object.assign(error, { code: status.INVALID_ARGUMENT });
    }
  }

  private async beginCommand(metadata: Metadata, traceId: string, traceparent?: string): Promise<TenantContext> {
    await this.persistence.assertSchemaCurrent();
    return this.authorize(metadata, traceId, traceparent);
  }

  private async authorize(metadata: Metadata, traceId: string, traceparent?: string): Promise<TenantContext> {
    const tenants = metadata.get(HTTP_HEADERS.tenantId);
    const actors = metadata.get(HTTP_HEADERS.actorId);
    if (tenants.length !== 1 || typeof tenants[0] !== 'string' || !isUUID(tenants[0])) {
      throw Object.assign(new Error('Tenant metadata is required.'), { code: status.UNAUTHENTICATED });
    }
    if (actors.length !== 1 || typeof actors[0] !== 'string' || !isUUID(actors[0])) {
      throw Object.assign(new Error('Actor metadata is required.'), { code: status.UNAUTHENTICATED });
    }
    const member = await this.sessions.membership(actors[0], tenants[0]);
    if (!member || member.role === 'viewer') {
      throw Object.assign(new Error('An operator or admin membership is required.'), { code: status.PERMISSION_DENIED });
    }
    return { tenantId: member.tenantId, actorId: member.userId, traceId, traceparent };
  }

  private async handle<T, R>(method: string, call: ServerUnaryCall<T, R>, callback: sendUnaryData<R>, work: (traceId: string, traceparent?: string) => Promise<R>): Promise<void> {
    const trace = call.metadata.get(HTTP_HEADERS.traceId);
    try {
      this.assertCaller(call.metadata);
      this.assertId(trace.length === 1 ? trace[0] : undefined);
      const traceId = trace[0] as string;
      const response = new Metadata();
      response.set(HTTP_HEADERS.traceId, traceId);
      call.sendMetadata(response);
      if (call.cancelled) return;
      const parent = call.metadata.get('traceparent');
      const traceparent = parent.length === 1 && typeof parent[0] === 'string' ? parent[0] : undefined;
      const attributes = { requestId: traceId };
      const invoke = (observation: Observation) => work(traceId, observation.traceparent);
      const result = await observe('rpc.server.' + method, attributes, invoke, traceparent);
      callback(null, result);
    } catch (error) {
      if (error instanceof SchemaNotCurrentError) {
        callback({ code: status.UNAVAILABLE, details: 'Migrations are pending; the runtime is not accepting commands.' });
      } else if (error instanceof NotFoundInTenantError || error instanceof RunNotFoundError) {
        callback({ code: status.NOT_FOUND, details: 'Resource not found.' });
      } else if (error instanceof RunStateError) {
        const code = status.FAILED_PRECONDITION;
        callback({ code, details: 'Run already finished.' });
      } else if (error instanceof Error && 'code' in error && [status.INVALID_ARGUMENT, status.UNAUTHENTICATED, status.PERMISSION_DENIED].includes(error.code as number)) {
        callback({ code: error.code as number, details: error.message });
      } else {
        const code = status.INTERNAL;
        callback({ code, details: 'Runtime operation failed.' });
      }
    }
  }
}
