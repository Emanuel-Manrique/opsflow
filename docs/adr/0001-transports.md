# REST, internal gRPC and asynchronous execution

Commands that start, cancel or retry a run acknowledge acceptance over HTTP or
internal gRPC, and the worker carries on after the request deadline has passed.
Execution is at least once: a crash between the webhook succeeding and the
database update means the webhook goes out again. Automatic attempts reuse the run id as
`Idempotency-Key`; a manual retry creates a new run from the original action
snapshot.

The runtime surface is plaintext on a private interface, and a private interface
is a deployment promise rather than a check. The check is a shared secret in call
metadata, required on every RPC including the reads, compared with
`timingSafeEqual`, and with no default value — both services refuse to boot
without one. It authenticates the *caller service*: who is acting is still
`actorId` plus a membership lookup, and a rejected secret is reported as a 502
rather than a 401, because it means these two services disagree, not that the
person should sign in again.

**Considered:** mutual TLS. Not rejected, deferred: it is the right answer once
this runs anywhere real, and it needs certificate issuance and rotation that a
local Compose file cannot honestly demonstrate. The secret closes the "anything
that can open the port can start runs" hole without pretending to be a PKI.

**Considered:** running the action inside the API request. Rejected because a
client timeout would then kill in-flight work, and the console could not
survive a refresh.
