# `@opsflow/contracts`

The shapes that cross a process boundary: workflow and run DTOs, problem
details, list-query parsing, session and audit snapshots, service ports, and
the demo tenant ids the console and seed share. `proto/runtime-v1.proto`
defines the internal RunNow, CancelRun, RetryRun and GetRuntimeHealth
operations. Runtime message types live in `src/lib/runtime`, so no gRPC
implementation ever reaches the browser bundle.

Tagged `type:contracts` / `scope:shared`. It may depend on `domain` and nothing
else, because contracts describe the wire in terms of domain primitives; the
dependency never runs the other way. `@nx/enforce-module-boundaries` holds that
line (`pnpm boundaries`).

Semantics that live outside the wire format itself:

- Transports and at-least-once execution: [ADR-0001](../../docs/adr/0001-transports.md)
- Sessions, roles and audit: [ADR-0002](../../docs/adr/0002-boundaries.md)
- Outbox, retries and idempotency: [ADR-0003](../../docs/adr/0003-scheduling.md)
- SSE run status: [ADR-0006](../../docs/adr/0006-run-events.md)

```sh
pnpm nx test contracts        # vitest
pnpm nx typecheck contracts
```

Manual execution uses `POST /api/workflows/:id/runs`. An omitted body or `{}` starts the
saved action. Outside production, `{ "scenario": "recovery" }` (also `http-500` or
`timeout`) faults only that run. The orchestrator validates the name and resolves
`CHAOS_WEBHOOK_ORIGIN` into the action snapshot; the worker still enforces its origin
allowlist. The console imports `chaosScenarioList()` locally and hides the lab in
production builds. Production runtimes reject scenarios even from direct callers.
