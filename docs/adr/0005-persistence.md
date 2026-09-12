# TypeORM schemas and handwritten SQL migrations

The current model lives in `EntitySchema` files. History lives in ordered SQL
migrations. Queries live in repositories. `synchronize` is off. Migrations are
hand-written because generated SQL cannot faithfully produce partial indexes,
descending order, or the CHECK constraints this schema relies on. CHECK lists
interpolate `sqlLiterals` of the domain unions, so a new status that exists only
in TypeScript fails the schema-comparison integration test.

The migration CLI runs through `tsx`, which emits no decorator metadata, so
entities cannot use inferred `@Column()` types. File names describe the change;
the class `name` is the TypeORM ledger identity and is never renamed after
apply. That is enforced, not merely asked for: the integration suite holds the
ledger as an ordered allowlist and compares it to the `migrations` rows, because
a rename orphans the applied row, `migration:show` then reports the change as
pending, and the next run replays a `CREATE TABLE` onto a schema that has it.

Migration SQL is frozen at the values it applied. A migration that interpolates
a live domain union (`sqlLiterals(AUDIT_ACTIONS)`) stops recording what it did:
a database built from scratch and one migrated step by step end up with
different constraints, and the union comparison has nothing left to compare. A
test reads the migration sources and refuses that shape. The entity keeps the
live union; the migration keeps the literal; the test asserts they agree.

Index definitions are compared as SQL, not as names. `uq_workflows_tenant_name`
and `ix_workflows_tenant_updated_at` are `synchronize: false` precisely because
TypeORM cannot express `lower(name)` or a DESC ordering, which means a name-only
comparison confirms nothing about them.

**Considered:** `migration:generate` from decorator entities. Rejected for the
reasons above.
