import type { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'battle' },
  {
    path: 'workflows',
    loadChildren: () =>
      import('./workflows/workflows.routes').then((m) => m.workflowsRoutes),
  },
  {
    path: 'battle',
    loadChildren: () => import('./battle/battle.routes').then((m) => m.battleRoutes),
  },
  {
    path: 'runs',
    loadChildren: () => import('./runs/runs.routes').then((m) => m.runsRoutes),
  },
  {
    path: '**',
    title: 'Not found · OpsFlow',
    loadComponent: () =>
      import('./not-found/not-found').then((m) => m.NotFound),
  },
];
