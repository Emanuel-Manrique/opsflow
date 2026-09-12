import { DEMO_TENANTS, DEMO_USERS } from '@opsflow/contracts';
import { demoSession, serviceBaseUrl } from '@opsflow/testing';

const base = serviceBaseUrl('api');

describe('session authorization over HTTP', () => {
  it('enforces roles, tenant membership, CSRF protection, audit and revocation', async () => {
    const admin = await demoSession(base);
    const viewer = await demoSession(base, 'viewer');
    const operator = await demoSession(base, 'operator');
    const p1 = { 'content-type': 'application/json', 'x-tenant-id': DEMO_TENANTS.acme, 'x-opsflow-request': '1' };
    const adminHeaders = { ...p1, cookie: admin };
    for (const tenantId of ['', 'malformed']) {
      const headers = { cookie: admin, 'x-tenant-id': tenantId };
      const rejected = await fetch(`${base}/api/workflows`, { headers });
      expect(rejected.status).toBe(401);
      expect((await rejected.json()).type).toBe('tenant_required');
    }
    const viewerHeaders = { ...p1, cookie: viewer, 'x-role': 'admin', 'x-actor-id': DEMO_USERS.admin };
    const operatorHeaders = { ...p1, cookie: operator };
    const workflow = { name: `Access ${crypto.randomUUID()}`, enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', actionType: 'noop' };
    const body = JSON.stringify(workflow);
    const create = await fetch(`${base}/api/workflows`, { method: 'POST', headers: adminHeaders, body });
    expect(create.status).toBe(201);
    const { id } = await create.json();
    const url = `${base}/api/workflows/${id}`;

    expect((await fetch(url, { headers: viewerHeaders })).status).toBe(200);
    for (const headers of [viewerHeaders, operatorHeaders]) {
      const edit = await fetch(url, { method: 'PUT', headers, body });
      expect(edit.status).toBe(403);
      expect((await edit.json()).type).toBe('forbidden');
      const removed = await fetch(url, { method: 'DELETE', headers });
      expect(removed.status).toBe(403);
      expect((await removed.json()).type).toBe('forbidden');
    }
    const denied = await fetch(`${url}/runs`, { method: 'POST', headers: viewerHeaders });
    expect(denied.status).toBe(403);
    const csrf = await fetch(`${url}/runs`, { method: 'POST', headers: { ...operatorHeaders, 'x-opsflow-request': '' } });
    expect(csrf.status).toBe(403);
    const allowed = await fetch(`${url}/runs`, { method: 'POST', headers: operatorHeaders });
    expect(allowed.status).toBe(202);
    const run = await allowed.json();
    const listed = await fetch(`${base}/api/runs`, { headers: operatorHeaders });
    expect(listed.status).toBe(200);
    expect((await listed.json()).items.some((item: { id: string }) => item.id === run.id)).toBe(true);
    const foreign = { ...viewerHeaders, 'x-tenant-id': DEMO_TENANTS.globex };
    expect((await fetch(url, { headers: foreign })).status).toBe(401);

    const entries = await fetch(`${base}/api/audit`, { headers: adminHeaders });
    const audit = await entries.json();
    const createdEntry = expect.objectContaining({ action: 'workflow.created', entityId: id, actorId: DEMO_USERS.admin });
    const startedEntry = expect.objectContaining({ action: 'run.started', entityId: run.id, actorId: DEMO_USERS.operator });
    expect(audit).toEqual(expect.arrayContaining([createdEntry, startedEntry]));
    expect((await fetch(`${base}/api/audit`, { headers: viewerHeaders })).status).toBe(403);

    const logout = await fetch(`${base}/api/session`, { method: 'DELETE', headers: viewerHeaders });
    expect(logout.status).toBe(204);
    expect((await fetch(url, { headers: viewerHeaders })).status).toBe(401);
    expect((await fetch(`${base}/api/runs/${run.id}/events`, { headers: viewerHeaders })).status).toBe(401);
    expect((await fetch(url, { headers: p1 })).status).toBe(401);
  });

  it('returns every membership and honors the requested tenant', async () => {
    const admin = await demoSession(base);
    const viewer = await demoSession(base, 'viewer');
    const none = await fetch(`${base}/api/session`, { headers: { cookie: admin } });
    const first = await none.json();
    expect(first.member.tenantSlug).toBe('acme');
    expect(first.memberships.map((row: { tenantSlug: string }) => row.tenantSlug)).toEqual(['acme', 'globex']);
    const globexHeaders = { cookie: admin, 'x-tenant-id': DEMO_TENANTS.globex };
    const globexSession = await fetch(`${base}/api/session`, { headers: globexHeaders });
    expect((await globexSession.json()).member.tenantSlug).toBe('globex');
    const viewerGlobex = { cookie: viewer, 'x-tenant-id': DEMO_TENANTS.globex };
    const fallbackSession = await fetch(`${base}/api/session`, { headers: viewerGlobex });
    const fallback = await fallbackSession.json();
    expect(fallback.member.tenantSlug).toBe('acme');
    expect(fallback.memberships).toHaveLength(1);
  });
});
