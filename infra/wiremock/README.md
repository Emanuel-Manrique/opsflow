# Webhook sink stubs

WireMock serves the endpoint that workflow actions fire at, so local runs never
reach the public internet.

| Path | Behavior |
|---|---|
| `/hooks/<anything>` | `200 {"received": true}` |
| `/hooks/chaos/recovery` | `500` for `X-Opsflow-Attempt: 1`, then `204`; both responses wait 1.5s so the automatic recovery is visible |
| `/hooks/chaos/500` | `500` on every call, so retries and the exhaustion path are real |
| `/hooks/chaos/timeout` | `204` after 8s, past the worker's 5s deadline, so the abort is real |

The chaos stubs back the console's Chaos Lab. They misbehave for real: the
worker retries them, records the failures and exhausts attempts exactly as it would
against a genuinely broken endpoint. Nothing about those failures is simulated in
the UI.

Requests are recorded, so a test can assert an action actually fired:

```sh
curl -s localhost:8081/__admin/requests | jq '.requests[].request.url'
curl -s -X DELETE localhost:8081/__admin/requests   # reset between tests
```

That queryability is the whole reason this is WireMock and not an echo container.

The recovery stub uses the worker’s attempt header, so concurrent runs each fail once independently. The `Idempotency-Key` stays the same across attempts.
