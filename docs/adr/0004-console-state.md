# Signal Forms and signals, with no store

Console state is Angular signals. `computed` derives everything the templates
read, and RxJS appears only where the source is genuinely a stream: `HttpClient`,
the SSE run feed, `switchMap` on route inputs and `debounceTime` on search. The
app is zoneless (`provideZonelessChangeDetection()`), so a signal write is what
schedules a render.

Forms are `@angular/forms/signals`: `form()` over a signal model, with
`required`, `maxLength` and `validate` declared in the schema, and `submit()`
mapping the API's problem details back onto fields. A custom control implements
`FormValueControl<T>`, which is what `ControlValueAccessor` became; `CronField`
exposes a `value` model and nothing else. There is no `ngModel`, no typed
`FormGroup` and no `writeValue`/`registerOnChange` trio to keep in sync.

Server data is not mirrored into a client store. A list or a run is fetched,
rendered, and re-fetched; the run detail keeps exactly one piece of local
reconciliation (`isStaleRunSnapshot`), because SSE snapshots can arrive out of
order and the console must not walk a run backwards.

**Considered:** NgRx. Rejected: the state that would live in it is server state
with one writer, and the console already receives its own invalidation over SSE.
A store here buys reducers and effects to re-describe HTTP responses, and a
second copy of the truth that can disagree with `run_events`.

**Considered:** typed `FormGroup` with `ControlValueAccessor`. Rejected: the
editor's validity is a projection of `@opsflow/domain` (`validateSchedule`,
`validateAction`), and Signal Forms lets that be called directly in a `validate`
rule instead of wrapped in a `ValidatorFn` adapter.
