import { TenantEntity } from './tenant';
import { UserEntity } from './user';
import { MembershipEntity } from './membership';
import { SessionEntity } from './session';
import { WorkflowEntity } from './workflow';
import { RunEntity } from './run';
import { ExecutionOutboxEntity } from './execution-outbox';
import { AuditLogEntity } from './audit-log';
import { RunEventEntity } from './run-event';

export const entities = [TenantEntity, UserEntity, MembershipEntity, SessionEntity, WorkflowEntity, RunEntity, ExecutionOutboxEntity, AuditLogEntity, RunEventEntity];
