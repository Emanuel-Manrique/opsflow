import type { DataSource } from 'typeorm';
import { SchemaNotCurrentError } from '../errors';
import type { PersistenceHealthReport } from './persistence.types';

export class PersistenceHealth {
  private schemaCurrent = false;

  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<PersistenceHealthReport> {
    try {
      await this.dataSource.query('SELECT 1');
      const pending = await this.dataSource.showMigrations();
      if (!pending) this.schemaCurrent = true;
      return { database: 'up', migrations: pending ? 'down' : 'up' };
    } catch {
      return { database: 'down', migrations: 'down' };
    }
  }

  async isSchemaCurrent(): Promise<boolean> {
    if (this.schemaCurrent) return true;
    this.schemaCurrent = !(await this.dataSource.showMigrations());
    return this.schemaCurrent;
  }

  async assertSchemaCurrent(): Promise<void> {
    if (!await this.isSchemaCurrent()) throw new SchemaNotCurrentError();
  }
}
