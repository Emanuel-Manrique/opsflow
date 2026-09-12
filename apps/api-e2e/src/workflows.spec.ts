import { randomUUID } from 'node:crypto';
import { DEMO_TENANTS } from '@opsflow/contracts';
import type { WorkflowDto } from '@opsflow/contracts';
import { demoSession, serviceBaseUrl } from '@opsflow/testing';
import type { RequestOptions } from './workflows.types';

const BASE = `${serviceBaseUrl('api')}/api`;

let cookie = '';
beforeAll(async () => { cookie = await demoSession(serviceBaseUrl('api')); });

const ACME = DEMO_TENANTS.acme;
const GLOBEX = DEMO_TENANTS.globex;

const unique = (label: string) => `e2e ${label} ${randomUUID().slice(0, 8)}`;

async function call(path: string, options: RequestOptions = {}) {
  const headers = new Headers({ 'content-type': 'application/json', cookie, 'x-opsflow-request': '1' });
  headers.set('x-tenant-id', options.tenant ?? ACME);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const init = { method: options.method ?? 'GET', headers, body };
  const res = await fetch(`${BASE}${path}`, init);

  const text = await res.text();
  const json = Boolean(text) && (res.headers.get('content-type') ?? '').includes('json');

  return { status: res.status, headers: res.headers, body: json ? JSON.parse(text) : undefined };
}

const post = (body: unknown) => call('/workflows', { method: 'POST', body });

const aWorkflow = (name: string) => {
  const p1 = { name, enabled: false, cronExpr: '0 3 * * *' };
  return { ...p1, timezone: 'UTC', actionType: 'noop' };
};

describe('workflows over HTTP', () => {
  it('accepts an oversized page without sending an invalid offset to Postgres', async () => {
    const response = await call('/workflows?page=1e308&pageSize=100');
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(Number.isSafeInteger((response.body.page - 1) * response.body.pageSize)).toBe(true);
  });

  it.each(['q=one&q=two', 'page=1&page=2', 'enabled=true&enabled=false'])('rejects repeated query parameters: %s', async (query) => {
    const response = await call(`/workflows?${query}`);
    expect(response.status).toBe(400);
    expect(response.body.type).toBe('bad_request');
  });

  it('creates a workflow and then finds it in the list', async () => {
    const name = unique('create');

    const created = await post(aWorkflow(name));

    expect(created.status).toBe(201);
    expect(created.headers.get('location')).toBe(`/api/workflows/${created.body.id}`);
    expect(created.body).toMatchObject({ name, enabled: false });

    const listed = await call(`/workflows?q=${encodeURIComponent(name)}`);

    expect(listed.status).toBe(200);
    const names = (listed.body.items as WorkflowDto[]).map((workflow) => workflow.name);
    expect(names).toEqual([name]);
  });

  it('answers a duplicate name with 409 and a code the console can act on', async () => {
    const name = unique('dup');
    await post(aWorkflow(name));

    const second = await post(aWorkflow(name));

    expect(second.status).toBe(409);
    expect(second.body.type).toBe('name_taken');
  });

  it("hides another tenant's workflow behind a 404 rather than a 403", async () => {
    const created = await post(aWorkflow(unique('tenant')));

    const asOther = await call(`/workflows/${created.body.id}`, { tenant: GLOBEX });

    expect(asOther.status).toBe(404);
    expect(asOther.body.type).toBe('workflow_not_found');
  });

  it('rejects an unknown tenant', async () => {
    const options = { method: 'POST', tenant: randomUUID(), body: aWorkflow(unique('tenant')) };
    const response = await call('/workflows', options);

    expect(response.status).toBe(401);
    expect(response.body.type).toBe('session_required');
  });

  it('updates a workflow with a full replacement', async () => {
    const created = await post(aWorkflow(unique('edit')));
    const body = aWorkflow(`${created.body.name} updated`);
    const options = { method: 'PUT', body };
    const updated = await call(`/workflows/${created.body.id}`, options);

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe(body.name);
  });

  it('starts a tenant-scoped run', async () => {
    const workflow = await post(aWorkflow(unique('run')));
    const started = await call(`/workflows/${workflow.body.id}/runs`, { method: 'POST' });

    expect(started.status).toBe(202);
    expect(started.headers.get('location')).toBe(`/api/runs/${started.body.id}`);
    expect(started.body.workflowId).toBe(workflow.body.id);
    expect(['queued', 'running', 'succeeded']).toContain(started.body.status);
    expect(started.headers.get('x-trace-id')).toMatch(/^[0-9a-f-]{36}$/);

    const hidden = await call(`/runs/${started.body.id}`, { tenant: GLOBEX });
    expect(hidden.status).toBe(404);
    expect(hidden.body.type).toBe('run_not_found');

    const path = `/workflows/${workflow.body.id}/runs`;
    const options = { method: 'POST', tenant: GLOBEX };
    const foreign = await call(path, options);
    expect(foreign.status).toBe(404);
    expect(foreign.body.type).toBe('workflow_not_found');
    const cancel = await call(`/runs/${started.body.id}/cancel`, options);
    expect(cancel.status).toBe(404);
    expect(cancel.body.type).toBe('run_not_found');
  });

  it.each(['unknown', 'http://untrusted.example', '', null, 42])('rejects an invalid run scenario %s', async (scenario) => {
    const response = await call(`/workflows/${randomUUID()}/runs`, { method: 'POST', body: { scenario } });
    expect(response.status).toBe(422);
    expect(Object.keys(response.body.errors)).toContain('scenario');
  });

  it('refuses arbitrary action snapshots and removes the old chaos endpoints', async () => {
    const id = randomUUID();
    const body = { scenario: 'http-500', url: 'http://untrusted.example' };
    const invalid = await call(`/workflows/${id}/runs`, { method: 'POST', body });
    expect(invalid.status).toBe(422);
    expect(Object.keys(invalid.body.errors)).toContain('url');
    expect((await call('/chaos')).status).toBe(404);
    expect((await call(`/chaos/http-500/workflows/${id}`, { method: 'POST' })).status).toBe(404);
  });

  it('names the invalid fields when the body is rejected', async () => {
    const body = { ...aWorkflow(unique('invalid')), cronExpr: 'nope' };
    const invalid = await post(body);

    expect(invalid.status).toBe(422);
    expect(invalid.body.type).toBe('validation_failed');
    expect(Object.keys(invalid.body.errors)).toContain('cronExpr');
  });

  it('refuses unknown payload fields', async () => {
    const body = { ...aWorkflow(unique('sneaky')), id: randomUUID() };
    const sneaky = await post(body);

    expect(sneaky.status).toBe(422);
    expect(Object.keys(sneaky.body.errors)).toContain('id');
  });

  it.each([
    [undefined, 'webhook'],
    [{ url: 'not-a-url', method: 'POST' }, 'webhook.url'],
  ])('rejects invalid webhook configuration for %s', async (webhook, field) => {
    const body = { ...aWorkflow(unique('webhook')), actionType: 'webhook', webhook };
    const invalid = await post(body);

    expect(invalid.status).toBe(422);
    expect(Object.keys(invalid.body.errors)).toContain(field);
  });

  it('deletes a workflow and hides it afterwards', async () => {
    const created = await post(aWorkflow(unique('delete')));
    expect(created.status).toBe(201);

    const removed = await call(`/workflows/${created.body.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);

    const missing = await call(`/workflows/${created.body.id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.type).toBe('workflow_not_found');
  });

  it("hides another tenant's delete behind a 404 rather than a 403", async () => {
    const created = await post(aWorkflow(unique('delete-tenant')));
    const asOther = await call(`/workflows/${created.body.id}`, { method: 'DELETE', tenant: GLOBEX });

    expect(asOther.status).toBe(404);
    expect(asOther.body.type).toBe('workflow_not_found');
    expect((await call(`/workflows/${created.body.id}`)).status).toBe(200);
  });

  it('rejects a malformed id before it reaches the database', async () => {
    const invalid = await call('/workflows/not-a-uuid');

    expect(invalid.status).toBe(400);
    expect(invalid.body.type).toBe('bad_request');
  });
});

describe('probes', () => {
  it('reports liveness without any dependency', async () => {
    const res = await call('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'api' });
  });

  it('reports readiness including whether migrations are current', async () => {
    const res = await call('/ready');

    expect(res.status).toBe(200);
    const checks = { database: 'up', migrations: 'up', runtime: 'up' };
    expect(res.body).toEqual({ status: 'ready', checks });
  });
});
