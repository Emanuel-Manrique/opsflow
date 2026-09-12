import { observe } from '@opsflow/observability';
import type { Observation } from '@opsflow/observability';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { HttpException, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, credentials, Metadata, status } from '@grpc/grpc-js';
import type { ServiceDefinition, ServiceError } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { HTTP_HEADERS, RUNTIME_CREDENTIALS_REJECTED } from '@opsflow/contracts';
import { RUNTIME_PROTO, RUNTIME_SERVICE } from '@opsflow/contracts';
import type { ReadinessResponse, RunResult, RuntimeMethod, RuntimeMetrics } from '@opsflow/contracts';
import type { TenantContext } from '@opsflow/contracts';

@Injectable()
export class RuntimeClientService implements OnModuleDestroy {
  private readonly client: Client;
  private readonly service: ServiceDefinition;
  private readonly timeoutMs: number;
  private readonly secret: string;

  constructor(config: ConfigService) {
    const file = join(__dirname, 'assets', RUNTIME_PROTO);
    const definition = loadSync(file, { defaults: true });
    this.service = definition[RUNTIME_SERVICE] as ServiceDefinition;
    const address = config.getOrThrow<string>('ORCHESTRATOR_GRPC_URL');
    this.timeoutMs = config.getOrThrow<number>('ORCHESTRATOR_RPC_TIMEOUT_MS');
    this.secret = config.getOrThrow<string>('RUNTIME_SHARED_SECRET');
    const options = { 'grpc.enable_retries': 0 };
    this.client = new Client(address, credentials.createInsecure(), options);
  }

  onModuleDestroy(): void { this.client.close(); }

  runNow(context: TenantContext, workflowId: string, chaosScenario?: string): Promise<RunResult> {
    return this.invoke('RunNow', { workflowId, chaosScenario: chaosScenario ?? '' }, context);
  }

  cancelRun(context: TenantContext, runId: string): Promise<RunResult> {
    return this.invoke('CancelRun', { runId }, context);
  }

  retryRun(context: TenantContext, runId: string): Promise<RunResult> {
    return this.invoke('RetryRun', { runId }, context);
  }

  health(): Promise<ReadinessResponse> {
    return this.invoke('GetRuntimeHealth', {});
  }

  metrics(): Promise<RuntimeMetrics> {
    return this.invoke('GetRuntimeMetrics', {});
  }

  private invoke<T, R>(method: RuntimeMethod, request: T, context?: TenantContext): Promise<R> {
    const rpc = this.service[method];
    const metadata = new Metadata();
    metadata.set(HTTP_HEADERS.runtimeToken, this.secret);
    metadata.set(HTTP_HEADERS.traceId, context?.traceId ?? randomUUID());
    if (context) metadata.set(HTTP_HEADERS.tenantId, context.tenantId);
    const actorId = context?.actorId;
    if (actorId) metadata.set(HTTP_HEADERS.actorId, actorId);
    const deadline = new Date(Date.now() + this.timeoutMs);
    const attributes = { tenantId: context?.tenantId, requestId: context?.traceId };
    const work = ({ traceparent }: Observation) => new Promise<R>((resolve, reject) => {
      if (traceparent) metadata.set('traceparent', traceparent);
      const params = [rpc.path, rpc.requestSerialize, rpc.responseDeserialize] as const;
      const callback = (error: ServiceError | null, response?: R) => {
        if (error) reject(this.toHttpError(error, method));
        else if (response === undefined) reject(new Error('Empty runtime reply'));
        else resolve(response);
      };
      const args = [request, metadata, { deadline }, callback] as const;
      this.client.makeUnaryRequest<T, R>(...params, ...args);
    });
    return observe('rpc.client.' + method, attributes, work, context?.traceparent);
  }

  private toHttpError(error: ServiceError, method: RuntimeMethod): HttpException {
    if (error.code === status.NOT_FOUND) {
      const type = method === 'RunNow' ? 'workflow_not_found' : 'run_not_found';
      const title = method === 'RunNow' ? 'Workflow not found.' : 'Run not found.';
      return new HttpException({ type, title }, 404);
    }
    if (error.code === status.FAILED_PRECONDITION) {
      const type = method === 'RetryRun' ? 'run_not_retryable' : 'run_not_cancellable';
      const title = method === 'RetryRun' ? 'Only failed runs with an action snapshot can be retried.' : 'This run has finished.';
      const body = { type, title };
      return new HttpException(body, 409);
    }
    if (error.code === status.DEADLINE_EXCEEDED) {
      const type = 'runtime_timeout';
      const title = 'Runtime response timed out. The operation may have been accepted.';
      return new HttpException({ type, title }, 504);
    }
    if (error.code === status.UNAVAILABLE) {
      const body = { type: 'runtime_unavailable', title: 'The runtime is unavailable.' };
      return new HttpException(body, 503);
    }
    if (error.code === status.INVALID_ARGUMENT) {
      const body = { type: 'bad_request', title: 'Invalid runtime request.' };
      return new HttpException(body, 400);
    }
    if (error.code === status.UNAUTHENTICATED) {
      if (error.details === RUNTIME_CREDENTIALS_REJECTED) {
        const body = { type: 'internal', title: 'Runtime operation failed.' };
        return new HttpException(body, 502);
      }
      const body = { type: 'tenant_required', title: 'A tenant is required.' };
      return new HttpException(body, 401);
    }
    if (error.code === status.PERMISSION_DENIED) {
      return new HttpException({ type: 'forbidden', title: 'Your role does not allow this action.' }, 403);
    }
    const body = { type: 'internal', title: 'Runtime operation failed.' };
    return new HttpException(body, 502);
  }
}
