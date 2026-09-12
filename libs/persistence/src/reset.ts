import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database/data-source-options';
import { loadEnvFile } from './database/load-env';

const DISPOSABLE = /(^|_)(e2e|test)(_|$)/;

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

async function reset(): Promise<void> {
  loadEnvFile();
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set.');

  const database = databaseName(url);
  if (!DISPOSABLE.test(database)) {
    throw new Error(`Refusing to wipe "${database}": only databases named *_e2e or *_test may be reset.`);
  }

  const dataSource = new DataSource(buildDataSourceOptions({ url }));
  await dataSource.initialize();
  try {
    await dataSource.query('TRUNCATE tenants, users RESTART IDENTITY CASCADE');
    console.log(`Reset ${database}: every tenant, user and everything cascading from them.`);
  } finally {
    await dataSource.destroy();
  }
}

reset().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
