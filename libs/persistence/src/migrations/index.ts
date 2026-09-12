import { CreateTenants1756909371847 } from './1756909371847-tenants';
import { CreateWorkflows1756926434392 } from './1756926434392-workflows';
import { CreateRuns1788551185171 } from './1788551185171-runs';
import { SchedulerOutbox1788712868294 } from './1788712868294-due-schedules-and-outbox';
import { RunCancellation1788880427651 } from './1788880427651-cancel-run';
import { RunRetries1788953283918 } from './1788953283918-retry-run';
import { AccessAudit1788980062440 } from './1788980062440-users-sessions-audit';
import { ExecutionTracing1789040940608 } from './1789040940608-outbox-traceparent';
import { OutboxClaim1789131248371 } from './1789131248371-outbox-claim';
import { RunListIndex1789145827391 } from './1789145827391-runs-list';
import { RunEvents1789145828391 } from './1789145828391-run-events';
import { OutboxActionShape1789234449648 } from './1789234449648-outbox-action-shape';
import { OutboxHeldEvent1789234449649 } from './1789234449649-outbox-held-event';
import { WorkflowDeleted1789320000000 } from './1789320000000-workflow-deleted';

export const migrations = [
  CreateTenants1756909371847,
  CreateWorkflows1756926434392,
  CreateRuns1788551185171,
  SchedulerOutbox1788712868294,
  RunCancellation1788880427651,
  RunRetries1788953283918,
  AccessAudit1788980062440,
  ExecutionTracing1789040940608,
  OutboxClaim1789131248371,
  RunListIndex1789145827391,
  RunEvents1789145828391,
  OutboxActionShape1789234449648,
  OutboxHeldEvent1789234449649,
  WorkflowDeleted1789320000000,
];
