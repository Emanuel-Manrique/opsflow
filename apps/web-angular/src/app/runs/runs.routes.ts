import { Route } from '@angular/router';

export const runsRoutes: Route[] = [
  {
    path: '',
    title: 'Runs · OpsFlow',
    loadComponent: () => import('./run-list/run-list').then((m) => m.RunList),
  },
  {
    path: ':id',
    title: 'Run · OpsFlow',
    loadComponent: () => import('./run-detail/run-detail').then((m) => m.RunDetail),
  },
];
