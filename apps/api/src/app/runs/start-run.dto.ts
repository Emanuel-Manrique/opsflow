import { IsIn, ValidateIf } from 'class-validator';
import { CHAOS_SCENARIOS } from '@opsflow/contracts';
import type { ChaosScenario, StartRunRequest } from '@opsflow/contracts';

export class StartRunDto implements StartRunRequest {
  @ValidateIf((_input: StartRunDto, value: unknown) => value !== undefined)
  @IsIn(Object.keys(CHAOS_SCENARIOS))
  scenario?: ChaosScenario;
}
