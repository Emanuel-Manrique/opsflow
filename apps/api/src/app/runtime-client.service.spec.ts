import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Server, ServerCredentials, status } from "@grpc/grpc-js";
import type { ServiceDefinition, handleUnaryCall } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { HTTP_HEADERS, RUNTIME_SERVICE } from "@opsflow/contracts";
import type { RunNowRequest, RunResult } from "@opsflow/contracts";
import { RuntimeClientService } from "./runtime-client.service";

vi.mock("@grpc/proto-loader", async (original) => {
  const actual = await original<typeof import("@grpc/proto-loader")>();
  const file = new URL("../../../../libs/contracts/proto/runtime-v1.proto", import.meta.url).pathname;
  const loadSync = () => actual.loadSync(file, { defaults: true });
  return { ...actual, loadSync };
});

describe("runtime client over real gRPC", () => {
  const server = new Server();
  const handler = vi.fn<handleUnaryCall<RunNowRequest, RunResult>>();
  const tenant = crypto.randomUUID();
  const workflowId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  let client: RuntimeClientService;

  beforeAll(async () => {
    const definition = loadSync("unused")[RUNTIME_SERVICE] as ServiceDefinition;
    server.addService(definition, { RunNow: handler, CancelRun: handler });
    const credentials = ServerCredentials.createInsecure();
    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync("127.0.0.1:0", credentials, (error, port) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    const p1 = { ORCHESTRATOR_GRPC_URL: "127.0.0.1:" + port };
    const p2 = { ORCHESTRATOR_RPC_TIMEOUT_MS: 1000, RUNTIME_SHARED_SECRET: "a".repeat(48) };
    const config = new ConfigService({ ...p1, ...p2 });
    client = new RuntimeClientService(config);
  });

  afterAll(() => { client?.onModuleDestroy(); server.forceShutdown(); });
  beforeEach(() => handler.mockReset());

  it("sends tenant and trace metadata with a bounded deadline", async () => {
    const traceId = crypto.randomUUID();
    handler.mockImplementationOnce((call, reply) => {
      expect(call.request.workflowId).toBe(workflowId);
      expect(call.metadata.get(HTTP_HEADERS.tenantId)).toEqual([tenant]);
      expect(call.metadata.get(HTTP_HEADERS.traceId)).toEqual([traceId]);
      expect(Number(call.getDeadline()) - Date.now()).toBeLessThanOrEqual(1000);
      reply(null, { runId });
    });
    const request = client.runNow({ tenantId: tenant, traceId }, workflowId);
    expect(await request).toEqual({ runId });
  });

  it("turns an expired deadline into 504 and does not retry RunNow", async () => {
    handler.mockImplementation(() => undefined);
    const result = client.runNow({ tenantId: tenant }, workflowId);
    await expect(result).rejects.toMatchObject({ status: 504 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it.each([
    [status.UNAVAILABLE, 503, "runtime_unavailable"],
    [status.NOT_FOUND, 404, "workflow_not_found"],
    [status.FAILED_PRECONDITION, 409, "run_not_cancellable"],
    [status.INVALID_ARGUMENT, 400, "bad_request"],
    [status.UNAUTHENTICATED, 401, "tenant_required"],
    [status.INTERNAL, 502, "internal"],
  ])("maps gRPC %s to HTTP %s without exposing internal details", async (code, http, type) => {
    handler.mockImplementationOnce((_call, reply) => {
      reply({ code, details: "private database detail" });
    });
    const result = client.runNow({ tenantId: tenant }, workflowId);
    const expected = { status: http, response: { type } };
    await expect(result).rejects.toMatchObject(expected);
    await expect(result).rejects.not.toThrow("private database detail");
  });
});
