import { Route } from '@angular/router';

export const battleRoutes: Route[] = [
  {
    path: '',
    title: 'Battle View · OpsFlow',
    loadComponent: () => import('./battle-page').then((m) => m.BattlePage),
  },
];
