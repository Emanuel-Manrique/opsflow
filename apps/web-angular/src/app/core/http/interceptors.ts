import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { HTTP_HEADERS } from '@opsflow/contracts';
import { activeTenantId, Session } from '../session';
import { toProblem } from './problem';

export { toProblem } from './problem';

const API_PREFIX = '/api';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url !== API_PREFIX && !req.url.startsWith(`${API_PREFIX}/`)) {
    return next(req);
  }

  const headers: Record<string, string> = { 'x-opsflow-request': '1' };
  const tenantId = activeTenantId(inject(Session));
  if (tenantId) headers[HTTP_HEADERS.tenantId] = tenantId;
  const apiRequest = req.clone({ setHeaders: headers });
  const mapError = (error: unknown) => throwError(() => toProblem(error));
  return next(apiRequest).pipe(catchError(mapError));
};
