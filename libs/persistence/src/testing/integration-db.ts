import { DataSource } from 'typeorm';
import type { WorkflowWrite } from '../repositories/workflow.types';
import { buildDataSourceOptions } from '../database/data-source-options';
import { WorkflowRepository } from '../repositories/workflow.repository';

export const ACME = '00000000-0000-4000-8000-0000000000a1';
export const GLOBEX = '00000000-0000-4000-8000-0000000000b2';

export async function createTestDataSource(): Promise<DataSource> {
  const url = process.env['OPSFLOW_TEST_DATABASE_URL'];

  if (!url) {
    const message = 'OPSFLOW_TEST_DATABASE_URL is not set. Run `pnpm integration`.';
    throw new Error(message);
  }

  const dataSource = new DataSource(buildDataSourceOptions({ url }));
  await dataSource.initialize();
  await dataSource.runMigrations();

  return dataSource;
}

export function repositoryFor(dataSource: DataSource): WorkflowRepository {
  return new WorkflowRepository(dataSource);
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  assertDisposable(dataSource);
  await dataSource.query(`TRUNCATE workflows, tenants RESTART IDENTITY CASCADE`);
  await dataSource.query(
    `INSERT INTO tenants (id, slug, name) VALUES ($1, 'acme', 'Acme'), ($2, 'globex', 'Globex')`,
    [ACME, GLOBEX]
  );
}

function assertDisposable(dataSource: DataSource): void {
  const options = dataSource.options;
  const url = 'url' in options ? options.url : undefined;
  const fromUrl = url ? new URL(url).pathname.replace(/^\//, '') : '';
  const database = typeof options.database === 'string' ? options.database : fromUrl;

  if (!database.includes('test')) {
    const p1 = `Refusing to truncate "${database}": database name must contain "test".`;
    const p2 = 'Use a scratch database or let integration-setup start a container.';
    throw new Error(`${p1} ${p2}`);
  }
}

export function aWorkflow(overrides: Partial<WorkflowWrite> = {}): WorkflowWrite {
  const p1 = { name: 'Nightly sync', enabled: false, cronExpr: '0 3 * * *' };
  const p2 = { timezone: 'UTC' as const, action: { type: 'noop' } as const };
  return { ...p1, ...p2, ...overrides };
}
