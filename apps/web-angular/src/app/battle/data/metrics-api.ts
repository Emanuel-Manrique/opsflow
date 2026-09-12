import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { HealthMetrics } from '@opsflow/contracts';

@Injectable({ providedIn: 'root' })
export class MetricsApi {
  private readonly http = inject(HttpClient);

  health(): Observable<HealthMetrics> {
    return this.http.get<HealthMetrics>('/api/metrics');
  }

}
