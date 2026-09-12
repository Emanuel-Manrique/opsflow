---
name: opsflow
description: >-
  OpsFlow monorepo contract (Nx + Angular 22.1 + Nest 12 + Vitest). Use when
  implementing features, adding apps/libs/deps, choosing state/HTTP/queues,
  writing tests, or when another skill says ng generate / ng build / Jest /
  NgRx. Overrides generic Angular/Nx examples with this workspace's commands.
---

# OpsFlow

Portfolio product: multi-tenant workflow orchestration console. Stack is already pinned. Do not re-scaffold the workspace.

## Commands

Package manager is **pnpm**. Prefix Nx with `pnpm`.

| Intent | Command |
|---|---|
| Dev (4 apps) | `pnpm dev` |
| Everything CI runs | `pnpm check` (lint → boundaries → typecheck → test → build) |
| Generate | `pnpm nx g <generator> --no-interactive` then `--dry-run` first |
| Test | `pnpm nx test <project>` |
| Type-check | `pnpm nx typecheck <project>` |
| Module boundaries | `pnpm nx boundaries <project>` |
| Build | `pnpm nx build <project>` |
| Graph | `pnpm nx show projects` / `pnpm nx show project <name> --json` |

Node >= 22.12, pnpm 10 (both pinned in `package.json`; `.nvmrc` matches).

Never `ng generate` / `ng build` / `ng serve`. Never `nest new`. After `angular-developer` or `nx-generate` loads, still scaffold with **Nx** and the flags below.

## Generate flags (this repo)

- Angular app already exists (`web-angular`). New UI: `pnpm nx g @nx/angular:component … --prefix=ops --style=css`
- Angular lib: `--unitTestRunner=vitest-analog --prefix=ops`
- JS lib: `--bundler=none --unitTestRunner=vitest`
- Nest controllers/services: `pnpm nx g @nx/nest:controller|service --project=<api|orchestrator|worker>`

## Where code goes

| Kind | Place |
|---|---|
| Console UI, routes, HttpClient | `apps/web-angular` |
| REST, SSE and tenant sessions | `apps/api` |
| Scheduler and internal gRPC commands | `apps/orchestrator` |
| BullMQ processors | `apps/worker` |
| DTOs, proto, ports, event names | `libs/contracts` (framework-free: the console imports it) |
| Entities, migrations, repositories | `libs/persistence` (`scope:server`, never reachable from Angular) |
| Pure domain (no Nest/Angular) | `libs/domain` |
| Shared CVAs / table / empty states | `libs/ui` (`ops-` prefix) |
| Test helpers | `libs/testing` |

Do not add apps. Do not publish libs. Source libs stay unbundled (`paths` in `tsconfig.base.json`).

`type:`/`scope:` tags on every project are enforced by `@nx/enforce-module-boundaries`
(the `boundaries` target). `scope:worker` cannot import `scope:web`, and `type:domain`
imports nothing. Widening a constraint is a design decision, not a build fix.

## Ports

From `@opsflow/contracts` `SERVICE_PORTS`: api `3100`, orchestrator `3101`, worker `3102`. Angular `4200`.

## Linting and types

Two linters on purpose: **oxlint** owns the `lint` target (correctness/style,
everything); **ESLint** is here for exactly one rule, `@nx/enforce-module-boundaries`,
on the `boundaries` target. Do not add style rules to `eslint.config.mjs`.

Layout rules live in `eslint-plugins/ops.cjs` and are wired in `.oxlintrc.json`:
`ops/no-multiline-import`, `ops/no-multiline-destructuring`,
`ops/no-multiline-ternary`. Husky
pre-commit/pre-push run `pnpm typecheck && pnpm lint && pnpm boundaries`;
commit messages are conventional (`feat:`, `fix:`).

`typecheck` runs `tsc --noEmit` per project over both the app/lib and the spec
tsconfig, because oxlint does not type-check and builds only reach code the apps import.

Type and interface declarations belong in domain `*.types.ts` files. Runtime modules import them with `import type`.
Apply `single-line-call-params` to modified TypeScript call sites.

## Tests

Vitest for unit + Nest HTTP e2e. Playwright only in `apps/web-angular-e2e`, chromium
by default (`E2E_ALL_BROWSERS=1` for the full matrix). No Jest, no `ts-jest`, no
`jest-preset-angular`.

UI changes: walk the user flow in the browser, or in Playwright. A screenshot is not verification.

## Angular (this product)

- Zoneless. `app.config.ts` declares it with `provideZonelessChangeDetection()`; do not rely on zone.js merely being absent. Signals + `computed` for UI state. RxJS only for HTTP/SSE/`switchMap`/`debounceTime`.
- `provideHttpClient` + functional interceptor when you add HTTP. No axios.
- Only ship feature routes that work. `workflows` is lazy now; add `runs` and `admin` with their implementation phases, never as placeholders.
- **Signal Forms** (`@angular/forms/signals`) instead of typed `FormGroup`. Custom controls implement `FormValueControl<T>`, which is what `ControlValueAccessor` became. No NgRx. No SSR.
- Tailwind CSS 4 owns styling. Use template utilities, keep the global CSS entrypoint minimal, and do not create SCSS files or a legacy `tailwind.config`.

`angular-developer` references are valid for APIs (signals, `httpResource`, routing). Ignore its `ng new` / Tailwind-as-default / `ng build` steps.

## Nest (this product)

Runtime `@nestjs/*@12`. Keep `@nestjs/schematics@11` (Nx generators). Apps stay CJS via webpack; do not set `"type": "module"` on the root package.

TypeORM + Postgres, BullMQ + Redis, gRPC and OpenTelemetry are in use.
Reuse `observe()` and `provideTelemetry()` from `libs/observability`. Do not add Kafka.

Entities must declare every column type explicitly (`@Column({ type: 'text' })`): the migration
CLI runs through `tsx`, which emits no decorator metadata, so a bare `@Column()` has nothing to
infer from. Migrations are hand-written, and `migration:generate` is never the answer (ADR-0005).

## Hard no

Turbo, Bun runtime, extra microservices, NgRx, Jest, Kafka, K8s, empty hexagonal folders, dummy `foo(): string` exports in libs.

## Phases (do not skip)

A skeleton → B workflows REST → C Run now + queue → D scheduler lock → E gRPC → F SSE → G RBAC/retries → H CI/ADRs polish. Do not implement a later phase early.

When the user is deciding a design, prefer `/grill-me`. When they also want ADRs, `/grill-with-docs`.
