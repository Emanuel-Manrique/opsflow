import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const TEST_URL = 'OPSFLOW_TEST_DATABASE_URL';

const PROVIDED_URL = 'INTEGRATION_DATABASE_URL';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  const provided = process.env[PROVIDED_URL];

  if (provided) {
    process.env[TEST_URL] = provided;
    return;
  }

  container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('opsflow_test')
    .withUsername('opsflow')
    .withPassword('opsflow')
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'full_page_writes=off'])
    .start();

  process.env[TEST_URL] = container.getConnectionUri();
}

export async function teardown(): Promise<void> {
  await container?.stop();
  delete process.env[TEST_URL];
}
