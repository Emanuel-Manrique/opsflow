import { Inject, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';
import { PersistenceHealth } from './persistence-health';
import type { PersistenceModuleAsyncOptions } from './persistence.types';
import { RunRepository } from '../repositories/run.repository';
import { SchedulerRepository } from '../repositories/scheduler.repository';
import { WorkflowRepository } from '../repositories/workflow.repository';
import { SessionRepository } from '../repositories/session.repository';
import { AuditRepository } from '../repositories/audit.repository';
import { RunEventRepository } from '../repositories/run-event.repository';
import { MetricsRepository } from '../repositories/metrics.repository';
import { RetentionRepository } from '../repositories/retention.repository';

const DATA_SOURCE = Symbol('OPSFLOW_DATA_SOURCE');
const providers = [WorkflowRepository, RunRepository, SchedulerRepository, SessionRepository, AuditRepository, RunEventRepository, MetricsRepository, RetentionRepository, PersistenceHealth];

@Module({})
export class PersistenceModule implements OnApplicationShutdown {
  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }

  static forRootAsync<TArgs extends unknown[]>(options: PersistenceModuleAsyncOptions<TArgs>): DynamicModule {
    return {
      module: PersistenceModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        ...providers.map((provide) => ({ provide, inject: [DATA_SOURCE], useFactory: (db: DataSource) => new provide(db) })),
        {
          provide: DATA_SOURCE,
          inject: options.inject ?? [],
          useFactory: async (...args: TArgs) => {
            const config = await options.useFactory(...args);
            const dataSource = new DataSource(buildDataSourceOptions(config));

            return dataSource.initialize();
          },
        },
      ],
      exports: providers,
    };
  }
}
