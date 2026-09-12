import { Route } from '@angular/router';
import { adminGuard } from '../core/session';

export const workflowsRoutes: Route[] = [
  {
    path: '',
    title: 'Workflows · OpsFlow',
    loadComponent: () => import('./workflow-list/workflow-list').then((m) => m.WorkflowList),
  },
  {
    path: 'new',
    canActivate: [adminGuard],
    title: 'New workflow · OpsFlow',
    loadComponent: () => import('./workflow-editor/workflow-editor').then((m) => m.WorkflowEditor),
  },
  {
    path: ':id/edit',
    canActivate: [adminGuard],
    title: 'Edit workflow · OpsFlow',
    loadComponent: () => import('./workflow-editor/workflow-editor').then((m) => m.WorkflowEditor),
  },
];
