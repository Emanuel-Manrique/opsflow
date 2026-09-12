import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CreateWorkflowRequest, Page, RunDto } from '@opsflow/contracts';
import type { StartRunRequest, WorkflowDto, WorkflowListQuery } from '@opsflow/contracts';
import { serializeWorkflowListQuery } from '@opsflow/contracts';

@Injectable({ providedIn: 'root' })
export class WorkflowsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/workflows';

  list(query: WorkflowListQuery): Observable<Page<WorkflowDto>> {
    const raw = serializeWorkflowListQuery(query);
    const params = new HttpParams({ fromObject: raw });
    return this.http.get<Page<WorkflowDto>>(this.baseUrl, { params });
  }

  findById(id: string): Observable<WorkflowDto> {
    return this.http.get<WorkflowDto>(`${this.baseUrl}/${id}`);
  }

  create(body: CreateWorkflowRequest): Observable<WorkflowDto> {
    return this.http.post<WorkflowDto>(this.baseUrl, body);
  }

  update(id: string, body: CreateWorkflowRequest): Observable<WorkflowDto> {
    return this.http.put<WorkflowDto>(`${this.baseUrl}/${id}`, body);
  }

  runNow(id: string, body?: StartRunRequest): Observable<RunDto> {
    return this.http.post<RunDto>(`${this.baseUrl}/${id}/runs`, body ?? null);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
