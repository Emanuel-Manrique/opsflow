import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Page, RunDto, RunListQuery } from '@opsflow/contracts';
import { serializeRunListQuery } from '@opsflow/contracts';

@Injectable({ providedIn: 'root' })
export class RunsApi {
  private readonly http = inject(HttpClient);

  list(query: RunListQuery): Observable<Page<RunDto>> {
    const params = new HttpParams({ fromObject: serializeRunListQuery(query) });
    return this.http.get<Page<RunDto>>('/api/runs', { params });
  }

  /** Builds a new run from a failed run's snapshot; the API enforces the role and state. */
  retry(id: string): Observable<RunDto> {
    return this.http.post<RunDto>(`/api/runs/${id}/retry`, null);
  }

  cancel(id: string): Observable<RunDto> {
    return this.http.post<RunDto>(`/api/runs/${id}/cancel`, null);
  }
}
