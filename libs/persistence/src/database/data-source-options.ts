import type { DataSourceOptions, LogLevel } from 'typeorm';
import { migrations } from '../migrations';
import { entities } from '../schema';
import type { PersistenceConfig } from './persistence.types';

export function buildDataSourceOptions(config: PersistenceConfig): DataSourceOptions {
  const logging: LogLevel[] = config.logging ? ['query', 'error', 'warn'] : ['warn'];
  const p1 = { type: 'postgres' as const, url: config.url, entities, migrations };
  const p2 = { synchronize: false, migrationsRun: false, logging, extra: { max: config.poolMax ?? 10 } };
  return { ...p1, ...p2, invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' } };
}
