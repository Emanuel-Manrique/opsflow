import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SERVICE_PORTS } from '@opsflow/contracts';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json: true }) });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const port = config.get<number>('ORCHESTRATOR_PORT') ?? SERVICE_PORTS.orchestrator;
  await app.listen(port);
  Logger.log(`Orchestrator listening on http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
