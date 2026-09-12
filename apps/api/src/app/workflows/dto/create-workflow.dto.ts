import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsIn } from 'class-validator';
import { IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { ValidateIf, ValidateNested } from 'class-validator';
import { WORKFLOW_LIMITS } from '@opsflow/contracts';
import type { CreateWorkflowRequest } from '@opsflow/contracts';
import type { WebhookActionInput } from '@opsflow/contracts';
import { ACTION_TYPES, HTTP_METHODS } from '@opsflow/domain';
import type { ActionType, HttpMethod } from '@opsflow/domain';

export class WebhookActionDto implements WebhookActionInput {
  @IsUrl({ require_protocol: true, require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(WORKFLOW_LIMITS.urlMaxLength)
  url!: string;

  @IsIn(HTTP_METHODS)
  method!: HttpMethod;
}

export class CreateWorkflowDto implements CreateWorkflowRequest {
  @IsString()
  @Matches(/\S/)
  @MaxLength(WORKFLOW_LIMITS.nameMaxLength)
  name!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(WORKFLOW_LIMITS.cronMaxLength)
  cronExpr!: string;

  @IsString()
  @MaxLength(WORKFLOW_LIMITS.timezoneMaxLength)
  timezone!: string;

  @IsIn(ACTION_TYPES)
  actionType!: ActionType;

  @ValidateIf((input: CreateWorkflowDto) => input.actionType === 'webhook')
  @IsDefined()
  @ValidateNested()
  @Type(() => WebhookActionDto)
  webhook?: WebhookActionDto;
}
