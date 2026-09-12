# OpsFlow agent notes

Nx + Angular 22.1 + Nest 12 + pnpm. Skills are in `.agents/skills/` (also listed in `skills-lock.json`).

## Skills to use

| When | Skill |
|---|---|
| Implementing anything in this repo | `opsflow` |
| Angular components, signals, HTTP, routing, forms | `angular-developer` (then still generate with **Nx**, not `ng`) |
| Modified TypeScript call arguments / type placement | `single-line-call-params` |
| `nx g`, new lib/component | `nx-generate` |
| test / build / serve / lint | `nx-run-tasks` |
| "what projects exist / why did nx fail" | `nx-workspace` |
| Stress-test a plan (`/grill-me`) | `grill-me` → `grilling` |
| Same, and write ADRs/glossary | `grill-with-docs` → `grilling` + `domain-modeling` |

Do not load Vercel/Next/shadcn skills. This is not that stack.

## Git hooks (Husky)

`prepare` installs hooks unless CI.

| Hook | Runs |
|---|---|
| `pre-commit` / `pre-push` | `pnpm typecheck && pnpm lint && pnpm boundaries` |
| `commit-msg` | conventional commits (`feat:`, `fix:`, …) |
| `post-merge` | `pnpm install` |

Layout lint (`ops/no-multiline-*`) is oxlint, plugin `eslint-plugins/ops.cjs`.

## Everyday commands

```bash
pnpm infra:up       # postgres + redis + webhook sink
pnpm db:setup       # migrate + seed
pnpm dev            # web :4200, api :3100, orchestrator :3101, worker :3102
pnpm check          # lint → boundaries → typecheck → test → build (Docker-free local gate)
pnpm integration    # persistence suite, Testcontainers
pnpm e2e            # http suites + playwright
pnpm verify         # all three; what CI runs
```

Ports are per service (`API_PORT`, `ORCHESTRATOR_PORT`, `WORKER_PORT`), never a shared `PORT`.
Four services run side by side, so one `PORT` either collides at bind time or quietly points
tooling at the wrong service.

## Two linters, on purpose

| Target | Tool | Job |
|---|---|---|
| `lint` | oxlint | correctness + style, fast, everything |
| `boundaries` | ESLint | **one rule only**: `@nx/enforce-module-boundaries` |
| `typecheck` | `tsc --noEmit` | per project, over `tsconfig.{app,lib,spec}.json` |
| `integration` | vitest + Testcontainers | `libs/persistence` only; real Postgres |

ESLint is here for one reason: it is the only linter that reads the Nx project
graph. Do not add style rules to `eslint.config.mjs`. oxlint owns those, and two
opinionated linters means one of them ends up disabled.

`typecheck` matters because oxlint does not type-check and the app builds only
reach code the apps import. Without it a type error in `libs/` or in any
`*.spec.ts` ships silently.

## Boundaries

Every project carries `type:` and `scope:` tags, and they are enforced:

- `type` tags: `domain` → nothing; `contracts` → `domain`; `ui`/`testing`/`persistence` → `contracts`, `domain`; `observability` → nothing; `app` → those plus `persistence`, `ui` and `observability`; `e2e` → `contracts`, `domain`, `testing`, `ui`.
- `scope` tags: `shared` is importable by everyone; `server` only by the three Nest services; `web` / `api` / `orchestrator` / `worker` cannot reach into each other.

`scope:web` deliberately cannot see `scope:server`, which is what makes it impossible for the
console to import TypeORM. The type axis alone would not do that, since `type:app` covers
`web-angular` too. See ADR-002.

Changing a constraint is a design decision. Edit `eslint.config.mjs` deliberately;
do not relax it to get a build green.

## Where things live now

| Kind | Place |
|---|---|
| Console UI, routes, interceptors | `apps/web-angular` |
| REST endpoints, DTOs, tenant middleware | `apps/api` |
| Server tracing and operation logs | `libs/observability` (`scope:server`) |
| Entities, migrations, repositories, seed | `libs/persistence` (`scope:server`) |
| Cron, timezone, run machine and roles | `libs/domain` (depends on nothing) |
| Wire types, problem details, list query | `libs/contracts` (framework-free) |
| Shared components (`ops-` prefix) | `libs/ui` |

Decisions worth reading before changing any of it: `docs/adr/`.

Type and interface declarations live in `*.types.ts`. Angular styling uses Tailwind CSS 4 utilities;
do not add SCSS files or `tailwind.config`.

Details and hard nos: `.agents/skills/opsflow/SKILL.md`.
