# Scheduling, outbox and idempotency

Concurrent schedulers claim due workflows with `SELECT … FOR UPDATE SKIP LOCKED`,
write the run and its action snapshot in the same transaction, then publish from
`execution_outbox`. Publication is a short claim transaction, Redis I/O outside
that lock, and a separate acknowledgement of `published_at`. A Redis failure
clears `claimed_at` so the row is retried; a crash after Redis accepts and
before the ack can republish after 30 seconds. Execution is at least once, and
the worker runs the snapshot, not the live workflow.

One sweep claims up to fifty workflows in one transaction, and each claim gets a
savepoint. A workflow that fails is rolled back to its own savepoint and the rest
of the batch commits; without that, one bad row reverts claims and `run_events`
that had already succeeded, and the next sweep walks into it again. Failures are
told apart: a schedule `nextRuns` cannot parse is unschedulable, not late, so it
is parked (`enabled = false`, no next occurrence) rather than left sorting to the
front of every future sweep. Anything else is assumed transient and retried on
the next tick.

`enqueueDue` advances `next_run_at` from the transaction clock (`now()`) rather
than from the missed occurrence. That is a catch-up: downtime skips the
occurrences that should have fired while the scheduler was down. We do not
backfill a run per missed tick.

Scheduled occurrences share an idempotency key per workflow and time, so a
repeated claim of the same occurrence is the same run. Automatic retries keep
that run; a manual retry is a new run with `retryOf`, inserted from the original
outbox snapshot in one write.

A publication Redis refuses records `outbox.held` against the run, once. The work
is safe — that is what the outbox is for — but until the console could see that
event, a run nobody could hand to a worker was indistinguishable from one no
worker had picked up yet.

**Considered:** enqueueing Redis from the same transaction as the run insert.
Rejected because Redis has no two-phase commit with Postgres; the outbox is the
commit.

**Considered:** publishing Redis while the outbox row is still locked.
Rejected because a slow broker holds `SKIP LOCKED` and stalls other publishers.
Claim, publish, ack keeps at-least-once without pinning the row for I/O.
