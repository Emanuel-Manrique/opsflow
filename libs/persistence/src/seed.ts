import dataSource from './data-source';
import { seedDemo } from './seeds/demo';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    await seedDemo(dataSource);
    console.log('Demo tenants, users, memberships and workflows are ready.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
