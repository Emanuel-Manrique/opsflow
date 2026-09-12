# `@opsflow/testing`

Test-only helpers shared across suites: `waitForHttpOk` for e2e global setup,
plus `serviceBaseUrl` and `serviceHealthUrl` so no suite has to hard-code a
port.

Tagged `type:testing` / `scope:shared`. Only `type:e2e` projects may import it;
the boundary rule keeps it out of anything that ships.

```sh
pnpm nx test testing          # vitest
pnpm nx typecheck testing
```
