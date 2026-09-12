# `@opsflow/ui`

Angular components genuinely shared between console screens. Prefix `ops-`,
`OnPush`, signal inputs. Today that is one component: `<ops-empty-state>`.

A component earns a place here by being used on more than one screen. Used
once, it belongs in its feature folder.

Tagged `type:ui` / `scope:web`, so only the Angular console can import it. Its
templates are type-checked (`strictTemplates`) when `web-angular` builds, since
the app compiles this lib from source.

```sh
pnpm nx test ui               # vitest + @analogjs/vite-plugin-angular
pnpm nx typecheck ui
```
