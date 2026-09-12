import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Client, credentials, Metadata, Server, status } from "@grpc/grpc-js";
import type { ServiceDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { HTTP_HEADERS, RUNTIME_CREDENTIALS_REJECTED, RUNTIME_SERVICE } from "@opsflow/contracts";
import type { RunDto, RunResult, ReadinessResponse } from "@opsflow/contracts";
import { NotFoundInTenantError, RunStateError, SchemaNotCurrentError } from "@opsflow/persistence";
import type { SessionRepository, RunRepository, PersistenceHealth } from "@opsflow/persistence";
import type { RunQueue } from "./run-queue";
import type { Response } from "express";
import { HealthController } from "./health/health.controller";
import { RuntimeServerService } from "./runtime-server.service";

vi.mock("@grpc/proto-loader", async (original) => {
  const actual = await original<typeof import("@grpc/proto-loader")>();
  const file = new URL("../../../../libs/contracts/proto/runtime-v1.proto", import.meta.url).pathname;
  const loadSync = () => actual.loadSync(file, { defaults: true });
  return { ...actual, loadSync };
});

const SECRET = "b".repeat(48);

describe("runtime server over real gRPC", () => {
  const tenant = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const id = crypto.randomUUID();
  const runs = { create: vi.fn<RunRepository["create"]>(), cancel: vi.fn<RunRepository["cancel"]>() };
  const sessions = { membership: vi.fn<SessionRepository['membership']>() };
  const assertSchemaCurrent = vi.fn<PersistenceHealth["assertSchemaCurrent"]>();
  const persistence = { check: vi.fn<PersistenceHealth["check"]>(), assertSchemaCurrent };
  const queue = { check: vi.fn<RunQueue["check"]>() };
  let config: ConfigService;
  let server: RuntimeServerService;
  let client: Client;
  let definition: ServiceDefinition;

  beforeAll(async () => {
    let port = 0;
    const bindAsync = Server.prototype.bindAsync;
    const bind = vi.spyOn(Server.prototype, "bindAsync");
    bind.mockImplementationOnce(function (this: Server, address, credentials, callback) {
      bindAsync.call(this, address, credentials, (error, bound) => {
        port = bound;
        callback(error, bound);
      });
    });
    const p1 = { ORCHESTRATOR_GRPC_HOST: "127.0.0.1", ORCHESTRATOR_GRPC_PORT: 0 };
    config = new ConfigService({ ...p1, RUNTIME_SHARED_SECRET: SECRET, NODE_ENV: 'test', CHAOS_WEBHOOK_ORIGIN: 'http://localhost:8081' });
    const args = [config, runs as unknown as RunRepository] as const;
    const db = persistence as unknown as PersistenceHealth;
    const counts = { reachable: true, waiting: 2, active: 1, delayed: 0, failed: 0, workers: 1 };
    const queue = { metrics: vi.fn<RunQueue['metrics']>().mockResolvedValue(counts) };
    const p2 = [db, sessions as unknown as SessionRepository, queue as unknown as RunQueue] as const;
    server = new RuntimeServerService(...args, ...p2);
    await server.onModuleInit();
    bind.mockRestore();
    client = new Client(`127.0.0.1:${port}`, credentials.createInsecure());
    definition = loadSync("unused")[RUNTIME_SERVICE] as ServiceDefinition;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    config.set('NODE_ENV', 'test');
    const p1 = { userId: id, tenantId: tenant, email: 'operator@test.local' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'operator' as const };
    sessions.membership.mockResolvedValue({ ...p1, ...p2 });
    persistence.check.mockResolvedValue({ database: "up", migrations: "up" });
    assertSchemaCurrent.mockResolvedValue(undefined);
    queue.check.mockResolvedValue("down");
  });
  afterAll(async () => { client?.close(); await server?.onModuleDestroy(); });

  function metadata(tenantId = tenant) {
    const value = new Metadata();
    value.set(HTTP_HEADERS.runtimeToken, SECRET);
    value.set(HTTP_HEADERS.tenantId, tenantId);
    value.set(HTTP_HEADERS.traceId, traceId);
    value.set(HTTP_HEADERS.actorId, id);
    return value;
  }

  function call<R = RunResult>(method: string, request: object, context = metadata()) {
    const rpc = definition[method];
    return new Promise<R>((resolve, reject) => {
      const params = [rpc.path, rpc.requestSerialize, rpc.responseDeserialize] as const;
      const options = { deadline: new Date(Date.now() + 1000) };
      const args = [request, context, options] as const;
      client.makeUnaryRequest<object, R>(...params, ...args, (error, response) => {
        if (error) reject(error);
        else resolve(response!);
      });
    });
  }

  it("runs commands inside tenant/trace context and reports command readiness", async () => {
    runs.create.mockImplementationOnce(async (context) => {
      expect(context).toEqual({ tenantId: tenant, actorId: id, traceId });
      return { id } as RunDto;
    });
    expect(await call("RunNow", { workflowId: id })).toEqual({ runId: id });
    const health = await call<ReadinessResponse>("GetRuntimeHealth", {});
    expect(health.status).toBe("ready");
    expect(health.checks.database).toBe("up");
  });

  it.each([
    ['recovery', '/hooks/chaos/recovery'],
    ['http-500', '/hooks/chaos/500'],
    ['timeout', '/hooks/chaos/timeout'],
  ])('resolves the named scenario %s into the run snapshot', async (chaosScenario, path) => {
    runs.create.mockResolvedValueOnce({ id } as RunDto);
    await expect(call('RunNow', { workflowId: id, chaosScenario })).resolves.toEqual({ runId: id });
    const snapshot = { type: 'webhook', url: `http://localhost:8081${path}`, method: 'POST' };
    expect(runs.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), id, snapshot);
  });

  it('rejects unknown scenarios and all faults in production while accepting ordinary runs', async () => {
    await expect(call('RunNow', { workflowId: id, chaosScenario: 'http://untrusted.example' })).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
    config.set('NODE_ENV', 'production');
    await expect(call('RunNow', { workflowId: id, chaosScenario: 'http-500' })).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(runs.create).not.toHaveBeenCalled();
    runs.create.mockResolvedValueOnce({ id } as RunDto);
    await expect(call('RunNow', { workflowId: id })).resolves.toEqual({ runId: id });
  });

  it("validates metadata and payload before reaching persistence", async () => {
    const missing = new Metadata();
    missing.set(HTTP_HEADERS.traceId, traceId);
    const request = call("RunNow", { workflowId: id }, missing);
    const unauthenticated = { code: status.UNAUTHENTICATED };
    await expect(request).rejects.toMatchObject(unauthenticated);
    const bad = call("RunNow", { workflowId: "invalid" });
    await expect(bad).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
    const badTrace = metadata();
    badTrace.set(HTTP_HEADERS.traceId, "invalid");
    const trace = call("RunNow", { workflowId: id }, badTrace);
    const invalid = { code: status.INVALID_ARGUMENT };
    await expect(trace).rejects.toMatchObject(invalid);
    expect(runs.create).not.toHaveBeenCalled();
  });

  it("checks command readiness without waiting for Redis", async () => {
    queue.check.mockImplementationOnce(() => new Promise(() => undefined));
    const db = persistence as unknown as PersistenceHealth;
    const controller = new HealthController(db, queue as unknown as RunQueue);
    const response = { status: vi.fn<Response['status']>() } as unknown as Response;
    void controller.ready(response);
    const request = call<ReadinessResponse>("GetRuntimeHealth", {});
    const checks = { database: "up", migrations: "up" };
    await expect(request).resolves.toEqual({ status: "ready", checks });
    expect(queue.check).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects readiness when migrations are pending", async () => {
    persistence.check.mockResolvedValue({ database: "up", migrations: "down" });
    const health = await call<ReadinessResponse>("GetRuntimeHealth", {});
    expect(health.status).toBe("not_ready");
  });

  it('rejects actorless commands and viewers at the gRPC boundary', async () => {
    const actorless = metadata();
    actorless.remove(HTTP_HEADERS.actorId);
    const missing = call('RunNow', { workflowId: id }, actorless);
    await expect(missing).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    const p1 = { userId: id, tenantId: tenant, email: 'viewer@test.local' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'viewer' as const };
    sessions.membership.mockResolvedValueOnce({ ...p1, ...p2 });
    const denied = call('CancelRun', { runId: id });
    await expect(denied).rejects.toMatchObject({ code: status.PERMISSION_DENIED });
    expect(runs.cancel).not.toHaveBeenCalled();
  });

  it("refuses every command while migrations are pending", async () => {
    assertSchemaCurrent.mockRejectedValue(new SchemaNotCurrentError());
    const commands = [call("RunNow", { workflowId: id }), call("CancelRun", { runId: id }), call("RetryRun", { runId: id })];
    for (const command of commands) {
      await expect(command).rejects.toMatchObject({ code: status.UNAVAILABLE });
    }
    expect(sessions.membership).not.toHaveBeenCalled();
    expect(runs.create).not.toHaveBeenCalled();
    expect(runs.cancel).not.toHaveBeenCalled();
    const health = await call<ReadinessResponse>("GetRuntimeHealth", {});
    expect(health.status).toBe("ready");
  });

  it("refuses a caller that cannot present the runtime secret", async () => {
    const anonymous = new Metadata();
    anonymous.set(HTTP_HEADERS.tenantId, tenant);
    anonymous.set(HTTP_HEADERS.traceId, traceId);
    anonymous.set(HTTP_HEADERS.actorId, id);
    const wrong = metadata();
    wrong.set(HTTP_HEADERS.runtimeToken, "c".repeat(48));

    for (const context of [anonymous, wrong]) {
      const rejected = { code: status.UNAUTHENTICATED, details: RUNTIME_CREDENTIALS_REJECTED };
      await expect(call("RunNow", { workflowId: id }, context)).rejects.toMatchObject(rejected);
    }
    const metrics = call("GetRuntimeMetrics", {}, anonymous);
    await expect(metrics).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    expect(runs.create).not.toHaveBeenCalled();
    expect(sessions.membership).not.toHaveBeenCalled();
  });

  it("maps missing resources and terminal-state conflicts", async () => {
    runs.create.mockRejectedValueOnce(new NotFoundInTenantError(id));
    const absent = call("RunNow", { workflowId: id });
    await expect(absent).rejects.toMatchObject({ code: status.NOT_FOUND });
    runs.cancel.mockRejectedValueOnce(new RunStateError(id, "cancellable"));
    const finished = call("CancelRun", { runId: id });
    const conflict = { code: status.FAILED_PRECONDITION };
    await expect(finished).rejects.toMatchObject(conflict);
  });

  it("redacts unexpected errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runs.create.mockRejectedValueOnce(new Error("private database detail"));
    const result = call("RunNow", { workflowId: id });
    const expected = { code: status.INTERNAL, details: "Runtime operation failed." };
    await expect(result).rejects.toMatchObject(expected);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
