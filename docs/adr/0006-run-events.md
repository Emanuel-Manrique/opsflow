# SSE for run status

`GET /api/runs/:id/events` is a current-status view rather than an event log.
The API reads Postgres once per second per viewer, sends a whole `RunDto`, and
closes on a terminal status. The console reconnects after one second; an HTTP
4xx stops it retrying. `Last-Event-ID` replays nothing, so a short intermediate
state can slip through between two reads.

**Considered:** an in-memory event bus or LISTEN/NOTIFY. Rejected until viewer
counts justify it: polling the source of truth sees writes from every worker
replica without a second delivery path.

**Amended:** the same stream now also carries `run.event` frames from the
append-only `run_events` table, alongside the `run.updated` snapshots. Both come
from the same one-second read, and events are sent before the snapshot they
produced, so the console never shows an outcome ahead of its explanation. The
history is replayed from the start on every connection and the client discards
ids it already holds, which keeps the server stateless at the cost of resending a
bounded backlog. That is what lets a reader joining mid-run, or reloading, see
the whole run rather than only what happens next — a status view alone loses the
cause of a failure the moment the run retries, because `ck_runs_error` clears
`error_message`.

Not every event is written where the run's state is. The worker appends its
attempt log outside the state transaction and swallows a failed append on
purpose — losing the log must not fail the attempt — so a dropped event can leave
the arena a frame behind the run. Battle View is built for that: the enemy falls
back to `classifyFailure(run.error)` when the history is silent. The events the
console *reasons* from rather than narrates (`run.started`, `scheduler.claimed`,
`outbox.published`) are written in the same transaction as the change they
describe, and cannot go missing.
