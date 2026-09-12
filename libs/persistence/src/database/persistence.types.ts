import type { DynamicModule } from '@nestjs/common';
import type { FactoryProvider } from '@nestjs/common';
import type { DependencyStatus } from '@opsflow/contracts';

export interface PersistenceConfig {
  readonly url: string;
  readonly poolMax?: number;
  readonly logging?: boolean;
}

export interface PersistenceModuleAsyncOptions<TArgs extends unknown[] = unknown[]> {
  readonly imports?: DynamicModule['imports'];
  readonly inject?: FactoryProvider['inject'];
  readonly useFactory: (...args: TArgs) => PersistenceConfig | Promise<PersistenceConfig>;
}

export type PersistenceHealthReport = Readonly<
  Record<'database' | 'migrations', DependencyStatus>
>;
