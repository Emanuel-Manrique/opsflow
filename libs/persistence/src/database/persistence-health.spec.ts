import type { DataSource } from 'typeorm';
import { SchemaNotCurrentError } from '../errors';
import { PersistenceHealth } from './persistence-health';

describe('PersistenceHealth', () => {
  it('reports unavailable dependencies when the migration query fails', async () => {
    const query = vi.fn<DataSource['query']>().mockResolvedValue([]);
    const showMigrations = vi.fn<DataSource['showMigrations']>();
    showMigrations.mockRejectedValue(new Error('Connection lost'));
    const source = { query, showMigrations } as unknown as DataSource;
    const health = new PersistenceHealth(source);

    const expected = { database: 'down', migrations: 'down' };
    await expect(health.check()).resolves.toEqual(expected);
  });

  it('refuses writes while migrations are pending, and stops refusing once they land', async () => {
    const showMigrations = vi.fn<DataSource['showMigrations']>().mockResolvedValue(true);
    const health = new PersistenceHealth({ showMigrations } as unknown as DataSource);

    await expect(health.assertSchemaCurrent()).rejects.toThrow(SchemaNotCurrentError);

    showMigrations.mockResolvedValue(false);
    await expect(health.assertSchemaCurrent()).resolves.toBeUndefined();
  });

  it('asks the ledger once after it matches, since the migration list is fixed at boot', async () => {
    const showMigrations = vi.fn<DataSource['showMigrations']>().mockResolvedValue(false);
    const health = new PersistenceHealth({ showMigrations } as unknown as DataSource);

    await health.assertSchemaCurrent();
    await health.assertSchemaCurrent();

    expect(showMigrations).toHaveBeenCalledOnce();
  });
});
