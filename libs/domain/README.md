# `@opsflow/domain`

Framework-free model: cron and timezone rules, webhook/noop actions, the run
transition table, and membership permissions. Pure TypeScript, with no Angular,
no Nest and no I/O. `RUN_TRANSITIONS` is the machine; the predicates and the
SQL `CASE` expressions are derived from it.

This is the innermost ring. Tagged `type:domain` / `scope:shared`, and allowed
to depend on nothing at all.

The *unions* really are shared. `ACTION_TYPES`, `HTTP_METHODS`, `RUN_STATUSES`,
`ROLES` and `AUDIT_ACTIONS` are interpolated into the PostgreSQL CHECKs through
`sqlLiterals`, and an integration test compares each constraint against the union
it came from, so a value that exists only in TypeScript fails the suite.

The *semantics* are not, and the database does not pretend otherwise:

| Rule | Where it holds | What the CHECK actually says |
| --- | --- | --- |
| Webhook URL is http/https, no credentials, ≤ 2048 chars | `validateAction`, console form, API DTO | `action_config -> 'url'` is a JSON string |
| Cron parses, and `H` is refused | `validateSchedule`, console form, API DTO | `cron_expr` is five non-blank fields |
| Timezone is a real IANA zone | `isValidTimezone`, console form, API DTO | `timezone` is not blank |

A row written straight to SQL can therefore hold a schedule nothing can parse.
The scheduler treats that as unschedulable rather than as an error to retry
forever: the sweep parks the workflow and moves on.

```sh
pnpm nx test domain           # vitest
pnpm nx typecheck domain
```
