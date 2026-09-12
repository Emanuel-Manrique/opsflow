import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl } from 'class-validator';
import { Max, Min, validateSync } from 'class-validator';

const toInt = () => Transform(({ value }) => (value === undefined ? undefined : Number(value)));

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsOptional()
  @toInt()
  @IsInt()
  @Min(1)
  @Max(65_535)
  WORKER_PORT?: number;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_protocol: true, require_tld: false })
  REDIS_URL!: string;

  @IsString()
  WEBHOOK_ALLOWED_ORIGINS = '';
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const options = { enableImplicitConversion: false, exposeDefaultValues: true };
  const env = plainToInstance(Env, raw, options);
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid worker environment.\n${detail}`);
  }

  return env;
}
