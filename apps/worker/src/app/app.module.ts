import { provideTelemetry } from '@opsflow/observability';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PersistenceModule } from '@opsflow/persistence';
import { validateEnv } from '../config/env';
import { HealthController } from './health/health.controller';
import { RunProcessor } from './run-processor';

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
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [provideTelemetry('opsflow-worker'), RunProcessor],
})
export class AppModule {}
