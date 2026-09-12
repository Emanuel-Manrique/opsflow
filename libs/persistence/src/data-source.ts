import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './database/data-source-options';
import { loadEnvFile } from './database/load-env';

loadEnvFile();

const url = process.env['DATABASE_URL'];

if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env, then run `pnpm infra:up`.');
}

export default new DataSource(buildDataSourceOptions({ url, logging: process.env['DATABASE_LOGGING'] === 'true' }));
