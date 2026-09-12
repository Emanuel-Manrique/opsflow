# Workflow orchestration

OpsFlow lets organizations schedule actions and track their execution.

## Language

**Tenant**: An organization that owns workflows and runs. A user may belong to more than one tenant.
_Avoid_: User account, environment

**Membership**: A user's role inside one tenant: admin, operator or viewer. Roles do not carry across tenants.

**Workflow**: A named action and its schedule within one tenant. It can also be run on demand.
_Avoid_: Job, run

**Run**: One requested execution of a workflow, with a frozen action snapshot and a recorded outcome.
_Avoid_: Workflow, attempt

**Attempt**: One worker delivery that begins executing a run. Automatic retries stay on the same run and the same snapshot.

**Manual retry**: A new run built from a failed run's action snapshot. It keeps a reference back to the original.
_Avoid_: Resume, automatic retry

**Occurrence**: A time at which a workflow is scheduled to run. Two schedulers claiming the same occurrence land on the same run.

**Action**: The work a workflow performs: a webhook call or a noop. A run holds a snapshot of that action, not a live pointer to the workflow.
_Avoid_: Job, task, payload

**Schedule**: A five-field cron expression plus an IANA timezone, which together produce occurrences.
_Avoid_: Interval, timer

**Cancellation**: A request to stop a run. Queued and retrying runs go straight to cancelled; a running one sits in cancelling until the in-flight attempt finishes.
_Avoid_: Abort, delete, kill
