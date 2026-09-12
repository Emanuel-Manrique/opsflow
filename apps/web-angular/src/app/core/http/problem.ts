import { HttpErrorResponse } from '@angular/common/http';
import { isApiProblem } from '@opsflow/contracts';
import type { ApiProblem } from '@opsflow/contracts';

export function toProblem(error: unknown): ApiProblem {
  if (isApiProblem(error)) {
    return error;
  }

  if (error instanceof HttpErrorResponse) {
    let body: unknown = error.error;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = undefined; }
    }
    if (isApiProblem(body)) {
      return body;
    }

    if (error.status === 0) {
      return { type: 'internal', title: 'Could not reach the server.', status: 0 };
    }

    return { type: 'internal', title: error.statusText || 'Request failed.', status: error.status };
  }

  return { type: 'internal', title: 'Something went wrong.', status: 0 };
}
