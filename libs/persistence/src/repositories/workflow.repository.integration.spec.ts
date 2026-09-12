import type { TenantContext } from '@opsflow/contracts';
import type { DataSource } from 'typeorm';
import { parseWorkflowListQuery } from '@opsflow/contracts';
import { ACME, GLOBEX } from '../testing/integration-db';
import { aWorkflow, createTestDataSource } from '../testing/integration-db';
import { repositoryFor, resetDatabase } from '../testing/integration-db';
import { NameTakenError, NotFoundInTenantError } from '../errors';
import { WorkflowRepository } from './workflow.repository';

describe('WorkflowRepository against Postgres', () => {
  let dataSource: DataSource;
  let repository: WorkflowRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repository = repositoryFor(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  const defaultQuery = parseWorkflowListQuery({});

  describe('tenant isolation', () => {
    it('enforces case-insensitive names within a tenant', async () => {
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Nightly Sync' }));

      const duplicate = repository.create({ tenantId: ACME }, aWorkflow({ name: 'nightly sync' }));
      await expect(duplicate).rejects.toBeInstanceOf(NameTakenError);
    });

    it('allows the same name in another tenant', async () => {
      await repository.create({ tenantId: ACME }, aWorkflow());
      const create = repository.create({ tenantId: GLOBEX }, aWorkflow());
      await expect(create).resolves.toMatchObject({ name: 'Nightly sync' });
    });

    it("does not expose another tenant's workflow", async () => {
      const mine = await repository.create({ tenantId: ACME }, aWorkflow());

      await expect(repository.findById({ tenantId: GLOBEX }, mine.id)).rejects.toBeInstanceOf(NotFoundInTenantError);
      await expect(repository.update({ tenantId: GLOBEX }, mine.id, aWorkflow())).rejects.toBeInstanceOf(NotFoundInTenantError);
      await expect(repository.remove({ tenantId: GLOBEX }, mine.id)).rejects.toBeInstanceOf(NotFoundInTenantError);
      await expect(repository.findById({ tenantId: ACME }, mine.id)).resolves.toMatchObject({ id: mine.id });
    });

    it("keeps another tenant's rows out of lists", async () => {
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Acme job' }));
      await repository.create({ tenantId: GLOBEX }, aWorkflow({ name: 'Globex job' }));

      const page = await repository.list({ tenantId: ACME }, defaultQuery);
      expect(page.items.map((workflow) => workflow.name)).toEqual(['Acme job']);
    });

    it('rejects a missing tenant filter instead of querying every tenant', async () => {
      const created = await repository.create({ tenantId: ACME }, aWorkflow());
      // A malformed runtime caller, even though the public signature still demands a tenant.
      const missing = { tenantId: undefined } as unknown as TenantContext;
      await expect(repository.findById(missing, created.id)).rejects.toThrow(/undefined/i);
    });

    it('keeps simultaneous queries for different tenants separate', async () => {
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Acme job' }));
      await repository.create({ tenantId: GLOBEX }, aWorkflow({ name: 'Globex job' }));
      const requests = [repository.list({ tenantId: ACME }, defaultQuery), repository.list({ tenantId: GLOBEX }, defaultQuery)];
      const [acme, globex] = await Promise.all(requests);
      expect(acme.items.map((row) => row.name)).toEqual(['Acme job']);
      expect(globex.items.map((row) => row.name)).toEqual(['Globex job']);
    });
  });

  describe('database invariants', () => {
    it('stores a complete webhook action', async () => {
      const action = { type: 'webhook' as const, url: 'http://localhost:8081/hooks/x', method: 'POST' as const };
      const created = await repository.create({ tenantId: ACME }, aWorkflow({ action }));

      expect(created.action).toEqual(action);
    });

    it('rejects malformed webhook JSON written outside the repository', async () => {
      const p1 = [ACME, 'Broken webhook', '0 3 * * *'] as const;
      const p2 = ['UTC', 'webhook', JSON.stringify({})] as const;
      const params = [...p1, ...p2] as const;
      const query = `
        INSERT INTO workflows
          (tenant_id, name, cron_expr, timezone, action_type, action_config)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `;

      await expect(dataSource.query(query, params)).rejects.toThrow(/ck_workflows_action_config_shape/);
    });
  });

  describe('listing', () => {
    async function seedNames(names: readonly string[]): Promise<void> {
      for (const name of names) {
        await repository.create({ tenantId: ACME }, aWorkflow({ name }));
      }
    }

    it('reports totals independently from pagination', async () => {
      await seedNames(['a', 'b', 'c', 'd', 'e']);
      const query = parseWorkflowListQuery({ page: '9', pageSize: '2' });
      const page = await repository.list({ tenantId: ACME }, query);

      expect(page.items).toEqual([]);
      expect(page.total).toBe(5);
      expect(page.totalPages).toBe(3);
    });

    it('orders tied timestamps deterministically', async () => {
      await seedNames(['a', 'b', 'c', 'd']);
      await dataSource.query(`UPDATE workflows SET updated_at = now()`);

      const query = parseWorkflowListQuery({ sort: '-updatedAt', pageSize: '2' });
      const first = await repository.list({ tenantId: ACME }, query);
      const second = await repository.list({ tenantId: ACME }, { ...query, page: 2 });
      const ids = [...first.items, ...second.items].map((workflow) => workflow.id);
      expect(new Set(ids).size).toBe(4);
    });

    it('searches and filters', async () => {
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Nightly invoice' }));
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Hourly', enabled: true }));

      const search = parseWorkflowListQuery({ q: 'INVOICE' });
      const enabled = parseWorkflowListQuery({ enabled: 'true' });
      const found = await repository.list({ tenantId: ACME }, search);
      const active = await repository.list({ tenantId: ACME }, enabled);

      expect(found.items.map((workflow) => workflow.name)).toEqual(['Nightly invoice']);
      expect(active.items.map((workflow) => workflow.name)).toEqual(['Hourly']);
    });

    it('searches for the characters typed, not for an ILIKE pattern', async () => {
      const backslash = 'Sync a\\b';
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Report 50% ok' }));
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Report 5000 ok' }));
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Sync a_b' }));
      await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Sync axb' }));
      await repository.create({ tenantId: ACME }, aWorkflow({ name: backslash }));
      const search = (q: string) => repository.list({ tenantId: ACME }, parseWorkflowListQuery({ q }));
      const names = async (q: string) => (await search(q)).items.map((workflow) => workflow.name);

      expect(await names('50% ok')).toEqual(['Report 50% ok']);
      expect(await names('a_b')).toEqual(['Sync a_b']);
      expect(await names('a\\b')).toEqual([backslash]);
      expect(await names('%')).toEqual(['Report 50% ok']);
    });
  });

  describe('delete', () => {
    it('removes the workflow and its runs from the tenant', async () => {
      const created = await repository.create({ tenantId: ACME }, aWorkflow({ name: 'Disposable' }));
      const values = [ACME, created.id, created.id];
      await dataSource.query('INSERT INTO runs (tenant_id, workflow_id, idempotency_key) VALUES ($1, $2, $3)', values);

      await repository.remove({ tenantId: ACME }, created.id);

      await expect(repository.findById({ tenantId: ACME }, created.id)).rejects.toBeInstanceOf(NotFoundInTenantError);
      const leftover = await dataSource.query('SELECT id FROM runs WHERE workflow_id = $1', [created.id]);
      expect(leftover).toEqual([]);
    });
  });
});
