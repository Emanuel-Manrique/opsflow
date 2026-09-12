import type { DataSource } from 'typeorm';
import { createTestDataSource, resetDatabase } from '../testing/integration-db';
import { seedDemo } from './demo';

describe('demo seed', () => {
  let db: DataSource;
  beforeAll(async () => { db = await createTestDataSource(); });
  afterAll(async () => { await db?.destroy(); });

  it('is atomic and repeatable without overwriting existing workflows', async () => {
    await resetDatabase(db);
    // Test fixtures use the same slugs with different IDs; remove them before seeding demo IDs.
    await db.query('DELETE FROM tenants');
    await db.query('ALTER TABLE workflows ADD CONSTRAINT test_seed_reject CHECK (false) NOT VALID');
    try {
      await expect(seedDemo(db)).rejects.toThrow('test_seed_reject');
      expect(await db.query('SELECT id FROM tenants')).toEqual([]);
      expect(await db.query('SELECT user_id FROM memberships')).toEqual([]);
    } finally {
      await db.query('ALTER TABLE workflows DROP CONSTRAINT test_seed_reject');
    }
    await seedDemo(db);
    await db.query("UPDATE workflows SET enabled = true, next_run_at = clock_timestamp() + interval '5 minutes' WHERE name = 'Health canary'");
    const before = await db.query('SELECT * FROM workflows ORDER BY id');
    await seedDemo(db);
    expect(await db.query('SELECT * FROM workflows ORDER BY id')).toEqual(before);
    expect(before).toHaveLength(1);
    expect(await db.query('SELECT user_id FROM memberships')).toHaveLength(4);
  });
});
