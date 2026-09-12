# Nx boundaries and explicit tenants

`type:` and `scope:` tags make it impossible for the Angular console to import
TypeORM, Nest or OpenTelemetry. `domain` depends on nothing; `contracts` may
depend only on `domain`; `persistence` and `observability` are `scope:server`.

Every tenant operation is handed a `TenantContext` as an argument. There is no
default tenant and no `AsyncLocalStorage`, so two concurrent requests have no
shared slot in which to mix tenants. Roles live in `domain` (`can` /
`rolesAllowing`); HTTP and gRPC re-check membership at the boundary.
`x-tenant-id` picks a membership; it does not assert an identity.

**Considered:** a shared kernel package and ambient tenant storage. Rejected
because the browser would then be able to import server code, and concurrent
requests would mix tenants.
