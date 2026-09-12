import { plainToInstance, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUrl } from 'class-validator';
import { Max, Min, validateSync } from 'class-validator';
import { IsIP, Length } from 'class-validator';

const toInt = () => Transform(({ value }) => (value === undefined ? undefined : Number(value)));

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsOptional()
  @toInt()
  @IsInt()
  @Min(1)
  @Max(65_535)
  ORCHESTRATOR_PORT?: number;

  @IsIP('4')
  ORCHESTRATOR_GRPC_HOST = '127.0.0.1';

  @toInt()
  @IsInt()
  @Min(1)
  @Max(65_535)
  ORCHESTRATOR_GRPC_PORT = 50051;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL!: string;

  @IsUrl({ protocols: ['redis', 'rediss'], require_protocol: true, require_tld: false })
  REDIS_URL!: string;

  @Length(32, 256)
  RUNTIME_SHARED_SECRET!: string;

  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  CHAOS_WEBHOOK_ORIGIN = 'http://localhost:8081';

  @IsOptional()
  @toInt()
  @IsInt()
  @Min(1)
  @Max(3_650)
  RETENTION_DAYS?: number;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const options = { enableImplicitConversion: false, exposeDefaultValues: true };
  const env = plainToInstance(Env, raw, options);
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');
    throw new Error(`Invalid orchestrator environment.\n${detail}`);
  }

  return env;
}
