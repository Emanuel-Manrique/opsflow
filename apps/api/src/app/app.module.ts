import { provideTelemetry } from '@opsflow/observability';
import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PersistenceModule } from '@opsflow/persistence';
import { validateEnv } from '../config/env';
import { TenantMiddleware } from '../common/tenant/tenant.middleware';
import { SchemaGuard } from '../common/schema/schema.guard';
import { HealthController } from './health/health.controller';
import { RunsModule } from './runs/runs.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { SessionController } from './session/session.controller';
import { AuditController } from './audit/audit.controller';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    PersistenceModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.getOrThrow<string>('DATABASE_URL'),
        poolMax: config.get<number>('DATABASE_POOL_MAX'),
        logging: config.get<boolean>('DATABASE_LOGGING'),
      }),
    }),
    RunsModule,
    WorkflowsModule,
  ],
  providers: [provideTelemetry('opsflow-api'), { provide: APP_GUARD, useClass: SchemaGuard }],
  controllers: [HealthController, SessionController, AuditController, MetricsController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*path');
  }
}
