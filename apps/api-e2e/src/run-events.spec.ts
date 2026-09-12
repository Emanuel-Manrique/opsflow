import { DEMO_TENANTS, RUN_EVENT_APPENDED, RUN_UPDATED_EVENT } from '@opsflow/contracts';
import { isRunDto, isRunEventDto } from '@opsflow/contracts';
import { demoSession, serviceBaseUrl } from '@opsflow/testing';

const base = `${serviceBaseUrl('api')}/api`;

describe('run events over HTTP', () => {
  it('streams persisted snapshots, reconciles on reconnect and hides foreign runs', async () => {
    const cookie = await demoSession(serviceBaseUrl('api'));
    const headers = { 'x-tenant-id': DEMO_TENANTS.acme, 'content-type': 'application/json', cookie, 'x-opsflow-request': '1' };
    const workflow = {
      name: `SSE ${crypto.randomUUID()}`, enabled: false,
      cronExpr: '0 3 * * *', timezone: 'UTC', actionType: 'noop',
    };
    const body = JSON.stringify(workflow);
    const created = await fetch(`${base}/workflows`, { method: 'POST', headers, body });
    expect(created.status).toBe(201);
    const { id } = await created.json();
    const start = await fetch(`${base}/workflows/${id}/runs`, { method: 'POST', headers });
    expect(start.status).toBe(202);
    const run = await start.json();
    const url = `${base}/runs/${run.id}/events`;
    const signal = AbortSignal.timeout(10_000);
    const events = await fetch(url, { headers, signal });
    expect(events.status).toBe(200);
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    expect(events.headers.get('x-accel-buffering')).toBe('no');
    const text = await events.text();
    expect(text).toContain(`event: ${RUN_UPDATED_EVENT}`);
    // One stream, two frame types: run snapshots and the events that produced them.
    const frames = text.split('\n\n').filter(Boolean).map((frame) => {
      const lines = frame.split('\n');
      const type = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
      const payload = lines.find((line) => line.startsWith('data:'))?.slice(5);
      return { type, data: JSON.parse(payload ?? 'null') as unknown };
    });
    const snapshots = frames.filter((frame) => frame.type === RUN_UPDATED_EVENT).map((frame) => frame.data);
    const appended = frames.filter((frame) => frame.type === RUN_EVENT_APPENDED).map((frame) => frame.data);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(isRunDto)).toBe(true);
    expect(snapshots.at(-1)).toMatchObject({ id: run.id, status: 'succeeded' });

    // The run's own history rides the same stream, and every entry is well formed.
    expect(appended.length).toBeGreaterThan(0);
    expect(appended.every(isRunEventDto)).toBe(true);
    const types = appended.map((entry) => (entry as { type: string }).type);
    expect(types).toContain('run.started');
    expect(types).toContain('run.succeeded');
    expect(appended.every((entry) => (entry as { runId: string }).runId === run.id)).toBe(true);

    const reconnectHeaders = { ...headers, 'last-event-id': '999999' };
    const reconnect = await fetch(url, { headers: reconnectHeaders, signal });
    expect(await reconnect.text()).toContain('"status":"succeeded"');

    const foreignHeaders = { 'x-tenant-id': DEMO_TENANTS.globex, cookie };
    const foreign = await fetch(url, { headers: foreignHeaders, signal });
    expect(foreign.status).toBe(404);
    expect(foreign.headers.get('content-type')).toContain('application/problem+json');
    expect(await foreign.json()).toMatchObject({ type: 'run_not_found' });

    const invalidHeaders = { 'x-tenant-id': 'invalid' };
    const invalid = await fetch(url, { headers: invalidHeaders, signal });
    expect(invalid.status).toBe(401);
    await invalid.body?.cancel();
  });
});
