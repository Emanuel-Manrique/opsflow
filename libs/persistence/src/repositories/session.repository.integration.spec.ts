import { AuditRepository } from './audit.repository';
import type { DataSource } from 'typeorm';
import { DEMO_USERS } from '@opsflow/contracts';
import { SessionRepository } from './session.repository';
import { WorkflowRepository } from './workflow.repository';
import { RunRepository } from './run.repository';
import { ACME, GLOBEX, aWorkflow } from '../testing/integration-db';
import { createTestDataSource, resetDatabase } from '../testing/integration-db';

describe('sessions and transactional audit', () => {
  let db: DataSource;
  let sessions: SessionRepository;
  beforeAll(async () => { db = await createTestDataSource(); sessions = new SessionRepository(db); });
  afterAll(async () => { await db?.destroy(); });
  beforeEach(async () => {
    await resetDatabase(db);
    await db.query('INSERT INTO users VALUES ($1, $2) ON CONFLICT DO NOTHING', [DEMO_USERS.admin, 'admin@test.local']);
    await db.query("INSERT INTO memberships VALUES ($1, $2, 'admin')", [DEMO_USERS.admin, ACME]);
  });

  it('uses current membership, hides foreign tenants and revokes or expires sessions', async () => {
    const token = await sessions.create(DEMO_USERS.admin);
    expect((await sessions.find(token, ACME))?.role).toBe('admin');
    expect((await sessions.find(token, ACME))?.tenantName).toBe('Acme');
    expect(await sessions.list(token)).toEqual([expect.objectContaining({ tenantId: ACME, tenantSlug: 'acme', tenantName: 'Acme' })]);
    expect(await sessions.find(token, GLOBEX)).toBeUndefined();
    await db.query("INSERT INTO memberships VALUES ($1, $2, 'admin')", [DEMO_USERS.admin, GLOBEX]);
    expect((await sessions.list(token)).map((row) => row.tenantSlug)).toEqual(['acme', 'globex']);
    expect(await sessions.find('forged', ACME)).toBeUndefined();
    await db.query("UPDATE memberships SET role = 'viewer' WHERE user_id = $1", [DEMO_USERS.admin]);
    expect((await sessions.find(token, ACME))?.role).toBe('viewer');
    await sessions.revoke(token);
    expect(await sessions.find(token, ACME)).toBeUndefined();
    const expired = await sessions.create(DEMO_USERS.admin);
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    expect(await sessions.find(expired, ACME)).toBeUndefined();
  });

  it('records the actor once per accepted operation and rolls the mutation back if audit fails', async () => {
    const workflows = new WorkflowRepository(db);
    const runs = new RunRepository(db);
    const traceId = crypto.randomUUID();
    const context = { tenantId: ACME, traceId, actorId: DEMO_USERS.admin };
    const workflow = await workflows.create(context, aWorkflow());
    await workflows.update(context, workflow.id, aWorkflow({ enabled: true }));
    const run = await runs.create(context, workflow.id);
    await runs.cancel(context, run.id);
    await runs.cancel(context, run.id);
    await workflows.remove(context, workflow.id);
    const entries = await new AuditRepository(db).list(context);
    expect(entries.map((entry) => entry.action).sort()).toEqual(['run.cancel_requested', 'run.started', 'workflow.created', 'workflow.deleted', 'workflow.enabled', 'workflow.updated']);
    expect(entries.every((entry) => entry.actorId === DEMO_USERS.admin && entry.traceId === traceId)).toBe(true);
    expect(await new AuditRepository(db).list({ tenantId: GLOBEX })).toEqual([]);

    const failed = workflows.create({ tenantId: ACME, traceId, actorId: crypto.randomUUID() }, aWorkflow({ name: 'Must roll back' }));
    await expect(failed).rejects.toThrow('foreign key constraint');
    expect(await db.query("SELECT id FROM workflows WHERE name = 'Must roll back'")).toEqual([]);
  });
});
