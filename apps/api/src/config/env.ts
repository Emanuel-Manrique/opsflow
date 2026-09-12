import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { IsUrl, Max, Min, validateSync } from 'class-validator';
import { Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

const toBoolean = () => Transform(({ value }) => value === true || value === 'true');
const toInt = () => Transform(({ value }) => (value === undefined ? undefined : Number(value)));

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsOptional()
  @toInt()
  @IsInt()
  @Min(1)
  @Max(65_535)
  API_PORT?: number;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL!: string;

  @Matches(/^[a-zA-Z0-9.-]+:\d{1,5}$/)
  ORCHESTRATOR_GRPC_URL = '127.0.0.1:50051';

  @toInt()
  @IsInt()
  @Min(100)
  @Max(10_000)
  ORCHESTRATOR_RPC_TIMEOUT_MS = 2_000;

  @Length(32, 256)
  RUNTIME_SHARED_SECRET!: string;

  @toInt()
  @IsInt()
  @Min(1)
  @Max(100)
  DATABASE_POOL_MAX = 10;

  @toBoolean()
  @IsBoolean()
  DATABASE_LOGGING = false;

  @toBoolean()
  @IsBoolean()
  DEMO_AUTH_ENABLED = false;


}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: false, exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('\n');

    throw new Error(`Invalid environment.\n${detail}\n\nCopy .env.example to .env and run \`pnpm infra:up\`.`);
  }

  return env;
}
