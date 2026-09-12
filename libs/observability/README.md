# `@opsflow/observability`

Server-only tracing and operation logs. Apps call `provideTelemetry(serviceName)` once, and
spans are opened with `observe(name, attributes, work, traceparent)`. The W3C `traceparent`
travels explicitly over HTTP, in gRPC metadata and through the outbox; there is no
OpenTelemetry context manager, and nothing instruments requests or bodies automatically.
Error logs record `errorCode` (the class name) and never the message, so SQL parameters,
cookies and webhook credentials stay out of stdout.

Tagged `type:observability` / `scope:server`, and it depends on nothing.

## Configuration

Set `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` to an OTLP HTTP traces URL, for example
`http://localhost:4318/v1/traces`. Leave it unset and the SDK still creates spans, so
parentage works in tests, but nothing leaves the process.

A span carries `service.name` from `provideTelemetry` plus whatever attributes the caller
passed (`tenantId`, `runId`, `attempt`, …). `observe` also writes `traceId`, `spanId` and
`durationMs` as a structured `console` entry, with `errorCode` on failures.

## Verification

The unit tests here assert parentage across concurrent `observe` calls, and that a thrown
`Error('password=…')` shows up in neither the logs nor the span status. The Playwright
recovery test exports real OTLP and writes `execution-trace.json` covering
HTTP → gRPC → queue → worker attempts.

```sh
pnpm nx test observability    # vitest
pnpm nx typecheck observability
```
