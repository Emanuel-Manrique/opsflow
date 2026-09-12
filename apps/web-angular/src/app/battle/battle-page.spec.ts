import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Page, RunDto, WorkflowDto } from '@opsflow/contracts';
import { EMPTY } from 'rxjs';
import { BattlePage } from './battle-page';
import { MetricsApi } from './data/metrics-api';

it('preserves the battle during failed polls and resumes the run and schedule automatically', async () => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'battle', component: BattlePage }], withComponentInputBinding()),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MetricsApi, useValue: { health: () => EMPTY } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const p1 = { id: crypto.randomUUID(), name: 'Nightly sync', enabled: true };
  const p2 = { cronExpr: '0 3 * * *', timezone: 'UTC', action: { type: 'noop' as const } };
  const p3 = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
  const workflow: WorkflowDto = { ...p1, ...p2, ...p3, nextRunAt: new Date(Date.now() + 60_000).toISOString() };
  const workflows: Page<WorkflowDto> = { items: [workflow], page: 1, pageSize: 50, total: 1, totalPages: 1 };
  const r1 = { id: crypto.randomUUID(), workflowId: workflow.id, workflowName: workflow.name };
  const r2 = { status: 'succeeded' as const, error: null, attempt: 1, retryOf: null };
  const r3 = { createdAt: p3.createdAt, startedAt: p3.createdAt, finishedAt: p3.createdAt };
  const run: RunDto = { ...r1, ...r2, ...r3 };
  const page: Page<RunDto> = { items: [run], page: 1, pageSize: 1, total: 1, totalPages: 1 };
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/battle?workflow=${workflow.id}`, BattlePage);
  http.expectOne((request) => request.url === '/api/workflows').flush(workflows);
  await vi.waitFor(() => http.expectOne(`/api/workflows/${workflow.id}`).flush(workflow));
  await vi.waitFor(() => http.expectOne((request) => request.url === '/api/runs').flush(page));
  await harness.fixture.whenStable();
  const partialText = `event: run.updated\ndata: ${JSON.stringify(run)}\n\n`;
  const type = HttpEventType.DownloadProgress;
  http.expectOne(`/api/runs/${run.id}/events`).event({ type, loaded: partialText.length, partialText });
  await harness.fixture.whenStable();
  const element = harness.routeNativeElement!;
  expect(element.textContent).toContain(`RUN-${run.id.slice(0, 8)}`);

  const failure = { status: 503, statusText: 'Service Unavailable' };
  await vi.waitFor(() => http.expectOne(`/api/workflows/${workflow.id}`).flush(null, failure), { timeout: 6_000 });
  await vi.waitFor(() => http.expectOne((request) => request.url === '/api/runs').flush(null, failure));
  await harness.fixture.whenStable();
  expect(element.textContent).toContain(`RUN-${run.id.slice(0, 8)}`);
  expect(element.textContent).toContain('Could not load the latest run');
  expect(element.textContent).toContain('Schedule unavailable');
  expect(element.textContent).not.toContain('No run to show yet');

  await vi.waitFor(() => http.expectOne(`/api/workflows/${workflow.id}`).flush(workflow), { timeout: 6_000 });
  await vi.waitFor(() => http.expectOne((request) => request.url === '/api/runs').flush(page));
  await harness.fixture.whenStable();
  expect(element.textContent).toContain(`RUN-${run.id.slice(0, 8)}`);
  expect(element.textContent).toContain('Next automatic run');
  expect(element.textContent).not.toContain('Could not load the latest run');
  expect(element.textContent).not.toContain('Schedule unavailable');
  harness.fixture.destroy();
  http.verify();
}, 15_000);
