import { ConsoleLogger, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SERVICE_PORTS } from '@opsflow/contracts';
import { AppModule } from './app/app.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';

function collectValidationErrors(errors: ValidationError[], fields: Record<string, string[]>, parent = ''): void {
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const messages = Object.values(error.constraints ?? {});

    if (messages.length > 0) {
      fields[field] = messages;
    }

    if (error.children?.length) {
      collectValidationErrors(error.children, fields, field);
    }
  }
}

function validationException(errors: ValidationError[]): UnprocessableEntityException {
  const fields: Record<string, string[]> = {};
  collectValidationErrors(errors, fields);

  return new UnprocessableEntityException({ type: 'validation_failed', errors: fields });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json: true }) });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');

  const p1 = { whitelist: true, forbidNonWhitelisted: true };
  const p2 = { transform: true, exceptionFactory: validationException };
  app.useGlobalPipes(new ValidationPipe({ ...p1, ...p2 }));

  app.useGlobalFilters(new ProblemDetailsFilter());

  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT') ?? SERVICE_PORTS.api;
  await app.listen(port);

  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}

bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
