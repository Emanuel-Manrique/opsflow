import { Session } from '../../core/session';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import type { TestRequest } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { RunDto } from '@opsflow/contracts';
import { RunDetail } from './run-detail';

function sendRun(request: TestRequest, run: RunDto, previous = ''): string {
  const partialText = `${previous}event: run.updated\ndata: ${JSON.stringify(run)}\n\n`;
  const type = HttpEventType.DownloadProgress;
  request.event({ type, loaded: partialText.length, partialText });
  return partialText;
}

const routes = [{ path: 'runs/:id', component: RunDetail }];

function aRun(id: string, status: RunDto['status'] = 'succeeded'): RunDto {
  const queued = status === 'queued';
  const terminal = status === 'succeeded' || status === 'failed' || status === 'cancelled';
  const error = status === 'failed' || status === 'retrying' ? 'Webhook returned HTTP 500.' : null;
  const p1 = { id, workflowId: crypto.randomUUID(), workflowName: 'Nightly sync' };
  const p2 = { status, error, attempt: queued ? 0 : 1, retryOf: null };
  const p3 = { createdAt: '2026-09-04T00:00:00.000Z', startedAt: queued ? null : '2026-09-04T00:00:01.000Z' };
  return { ...p1, ...p2, ...p3, finishedAt: terminal ? '2026-09-04T00:00:02.000Z' : null };
}

describe('RunDetail', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const p1 = { userId: 'admin', email: 'admin@test.local', tenantId: 'acme' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'admin' as const };
    const member = { ...p1, ...p2 };
    TestBed.inject(Session).data.set({ member, memberships: [member], demoEnabled: true });
  });

  afterEach(() => http.verify());

  it('renders fragmented updates and ends the request at a terminal state', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const stream = http.expectOne(`/api/runs/${id}/events`);
    const queued = aRun(id, 'queued');
    const text = `event: run.updated\ndata: ${JSON.stringify(queued)}\n\n`;
    const type = HttpEventType.DownloadProgress;
    stream.event({ type, loaded: 30, partialText: text.slice(0, 30) });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Loading run');
    stream.event({ type, loaded: text.length, partialText: text });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('queued');
    sendRun(stream, aRun(id), text);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('succeeded');
    expect(stream.cancelled).toBe(true);
  });

  it('says which stage a stuck run is waiting on, instead of an indefinite Queued', async () => {
    const id = crypto.randomUUID();
    let sequence = 0;
    const event = (type: string) => {
      const p1 = { id: String(++sequence), runId: id, type, attempt: null, traceId: null };
      const p2 = { errorCode: null, durationMs: null, detail: null, createdAt: '2026-09-04T00:00:00.000Z' };
      return `event: run.event\ndata: ${JSON.stringify({ ...p1, ...p2 })}\n\n`;
    };
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const stream = http.expectOne(`/api/runs/${id}/events`);
    const type = HttpEventType.DownloadProgress;

    let text = sendRun(stream, aRun(id, 'queued'), event('run.started'));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Waiting for the orchestrator to publish');

    text += event('outbox.published');
    stream.event({ type, loaded: text.length, partialText: text });
    text = sendRun(stream, aRun(id, 'queued'), text);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Waiting for a worker');

    text += event('outbox.held');
    stream.event({ type, loaded: text.length, partialText: text });
    text = sendRun(stream, aRun(id, 'queued'), text);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('The queue is unreachable');

    text += event('outbox.published');
    sendRun(stream, aRun(id, 'queued'), text);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Waiting for a worker');
    expect(harness.routeNativeElement?.textContent).not.toContain('The queue is unreachable');

    stream.event({ type: HttpEventType.Response, partialText: '' } as never);
  });

  it('does not report the API\'s scheduled stream rotation as a dropped connection', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const running = aRun(id, 'running');
    const open = http.expectOne(`/api/runs/${id}/events`);
    const text = sendRun(open, running);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('running');

    open.flush(text);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).not.toContain('Reconnecting');

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const rotated = http.expectOne(`/api/runs/${id}/events`);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).not.toContain('Reconnecting');
    expect(harness.routeNativeElement?.textContent).toContain('running');

    sendRun(rotated, aRun(id));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('succeeded');
  });

  it('keeps the last state during a disconnect and reconciles on reconnect', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const stream = http.expectOne(`/api/runs/${id}/events`);
    sendRun(stream, aRun(id, 'running'));
    stream.error(new ProgressEvent('error'));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('running');
    expect(harness.routeNativeElement?.textContent).toContain('Reconnecting');
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    sendRun(http.expectOne(`/api/runs/${id}/events`), aRun(id));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('succeeded');
    expect(harness.routeNativeElement?.textContent).not.toContain('Reconnecting');
  });

  it('closes the old connection on navigation and the current one on destroy', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const old = http.expectOne(`/api/runs/${id}/events`);
    sendRun(old, aRun(id, 'running'));
    const nextId = crypto.randomUUID();
    await harness.navigateByUrl(`/runs/${nextId}`, RunDetail);
    expect(old.cancelled).toBe(true);
    expect(harness.routeNativeElement?.textContent).not.toContain(id);
    const current = http.expectOne(`/api/runs/${nextId}/events`);
    harness.fixture.destroy();
    expect(current.cancelled).toBe(true);
  });

  it('loads and renders the persisted run state', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);

    sendRun(http.expectOne(`/api/runs/${id}/events`), aRun(id));
    await harness.fixture.whenStable();

    const text = harness.routeNativeElement?.textContent ?? '';
    expect(text).toContain('succeeded');
    expect(text).toContain('Nightly sync');
  });

  it('stops retrying a rejected stream and never renders an invalid snapshot', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const stream = http.expectOne(`/api/runs/${id}/events`);
    const partialText = 'event: run.updated\ndata: {"status":"succeeded"}\n\n';
    const type = HttpEventType.DownloadProgress;
    stream.event({ type, loaded: partialText.length, partialText });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).not.toContain('succeeded');
    expect(stream.cancelled).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const retry = http.expectOne(`/api/runs/${id}/events`);
    const error = { type: 'run_not_found', title: 'Run not found.', status: 404 };
    retry.flush(JSON.stringify(error), { status: 404, statusText: 'Not Found' });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain('Run not found.');
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    http.expectNone(`/api/runs/${id}/events`);
  });

  it('keeps the run visible during refresh and displays execution failure', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const queued = aRun(id, 'queued');
    const stream = http.expectOne(`/api/runs/${id}/events`);
    sendRun(stream, queued);
    await harness.fixture.whenStable();

    const el = harness.routeNativeElement!;
    const refresh = el.querySelector<HTMLButtonElement>('button')!;
    refresh.click();
    await vi.waitFor(() => expect(refresh.disabled).toBe(true));
    expect(el.textContent).toContain('Nightly sync');
    expect(el.contains(refresh)).toBe(true);
    expect(refresh.disabled).toBe(true);

    const failure = aRun(id, 'failed');
    expect(stream.cancelled).toBe(true);
    sendRun(http.expectOne(`/api/runs/${id}/events`), failure);
    await harness.fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('HTTP 500');
    expect(refresh.disabled).toBe(false);
  });

  it('retries a failed load and reloads when the route id changes', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const response = { status: 503, statusText: 'Service Unavailable' };
    http.expectOne(`/api/runs/${id}/events`).flush(null, response);
    await harness.fixture.whenStable();

    const el = harness.routeNativeElement!;
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => sendRun(http.expectOne(`/api/runs/${id}/events`), aRun(id)));
    await harness.fixture.whenStable();

    const nextId = crypto.randomUUID();
    await harness.navigateByUrl(`/runs/${nextId}`, RunDetail);
    sendRun(http.expectOne(`/api/runs/${nextId}/events`), aRun(nextId));
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.textContent).toContain(nextId);
    expect(harness.routeNativeElement?.textContent).not.toContain(id);
  });

  it('keeps the run visible on cancellation failure and allows a successful retry', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const queued = aRun(id, 'queued');
    const stream = http.expectOne(`/api/runs/${id}/events`);
    const bodyText = sendRun(stream, queued);
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement!;
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')];
    const cancel = buttons.find((button) => button.textContent?.includes('Cancel run'))!;
    cancel.click();
    cancel.click();
    await vi.waitFor(() => expect(cancel.disabled).toBe(true));
    const p1 = { type: 'runtime_unavailable', status: 503 };
    const body = { ...p1, title: 'Runtime unavailable.' };
    const options = { status: 503, statusText: 'Service Unavailable' };
    http.expectOne(`/api/runs/${id}/cancel`).flush(body, options);
    await harness.fixture.whenStable();
    expect(el.textContent).toContain('Nightly sync');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(body.title);
    expect(cancel.disabled).toBe(false);

    cancel.click();
    const cancelled = aRun(id, 'cancelled');
    http.expectOne(`/api/runs/${id}/cancel`).flush(cancelled);
    sendRun(stream, cancelled, bodyText);
    await harness.fixture.whenStable();
    expect(el.textContent).toContain('cancelled');
    expect(el.textContent).not.toContain('Cancel run');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('applies the cancel body without waiting for the next SSE frame', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/runs/${id}`, RunDetail);
    const queued = aRun(id, 'queued');
    const stream = http.expectOne(`/api/runs/${id}/events`);
    const bodyText = sendRun(stream, queued);
    await harness.fixture.whenStable();
    const el = harness.routeNativeElement!;
    const cancel = [...el.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Cancel run'))!;
    cancel.click();
    const cancelled = aRun(id, 'cancelled');
    http.expectOne(`/api/runs/${id}/cancel`).flush(cancelled);
    await harness.fixture.whenStable();
    expect(el.textContent).toContain('cancelled');
    expect(el.textContent).not.toContain('Cancel run');
    const stale = sendRun(stream, queued, bodyText);
    await harness.fixture.whenStable();
    expect(el.textContent).toContain('cancelled');
    expect(el.textContent).not.toContain('queued');
    sendRun(stream, cancelled, stale);
    await harness.fixture.whenStable();
  });
});
