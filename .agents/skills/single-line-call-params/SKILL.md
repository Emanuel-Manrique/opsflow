---
name: single-line-call-params
description: >-
  Refactors multiline runtime call arguments into single-line pN/bodyN
  fragments, and places named types in *.types.ts. Use when implementing or
  reviewing OpsFlow TypeScript, when the user says p1/p2, or after a pass
  that left multiline await fn({...}).
---

# Single-line call params

Apply this convention to code created or modified for the current task. Do not sweep unrelated files.

## Goal

No multiline runtime argument literals. Moving args to a `p2` above the call does not count if `p2` itself spans several lines.

Every fragment is exactly one line. Split until each piece fits, then merge and call.

This repo also forbids multiline imports, destructuring and ternaries (`ops/no-multiline-*`). If an import grows too long, write several import declarations from the same module.

## Declarative exception

Keep declarative structures multiline when the layout is the point: Angular and Nest metadata, Signal Forms schemas, RxJS pipelines, migrations, SQL, and test case tables.

## Core rules

1. One line per runtime fragment. Write `const p1 = { tenantId, name };`, not a four-line object.
2. Merge on one line where you can: `const row = { ...p1, ...p2 };`
3. If that merge is still long, merge again: `const p12 = { ...p1, ...p2 };` then `{ ...p12, ...p3 }`.
4. Positional args go in a tuple: `const args = [cronExpr, timezone, 1, clock.now] as const;` then `nextRuns(...args)`.
5. `as const` on every tuple passed to a rest spread.
6. Preserve behavior and type narrowing. Never cast away a guard just to shorten a call.

```ts
const p1 = { tenantId: requireTenantId(), name: input.name.trim() };
const p2 = { enabled: input.enabled, cronExpr: input.cronExpr.trim() };
const p3 = { timezone: input.timezone.trim(), actionType: input.actionType };
const p4 = { actionConfig: toActionConfig(input), nextRunAt };
const row = this.repository().create({ ...p1, ...p2, ...p3, ...p4 });
```

```ts
const args = [input.cronExpr, input.timezone, 1, clock.now] as const;
return nextRuns(...args)[0];
```

## Type placement

- Put named `type` and `interface` declarations only in the nearest `*.types.ts` file.
- Prefer `interface` for object shapes; use `type` for unions, tuples, mapped types and aliases.
- Logic, constants, components, DTO classes, repositories and utilities import their types with `import type`.
- Re-export public types from the owning library barrel. Do not create duplicate shapes.

## Verification

Run `pnpm lint` and `pnpm typecheck`. Run the smallest relevant test target, or `pnpm check` when the change crosses projects. Before finishing, re-scan the modified TypeScript for named type declarations outside `*.types.ts` and for multiline runtime argument literals.
