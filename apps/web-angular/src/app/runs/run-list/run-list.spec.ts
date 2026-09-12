import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Page, RunDto } from '@opsflow/contracts';
import { RunList } from './run-list';

function aRun(overrides: Partial<RunDto> = {}): RunDto {
  const p1 = { id: crypto.randomUUID(), workflowId: crypto.randomUUID(), workflowName: 'Nightly sync' };
  const p2 = { status: 'succeeded' as const, error: null, attempt: 1, retryOf: null };
  const p3 = { createdAt: '2026-09-04T00:00:00.000Z', startedAt: '2026-09-04T00:00:01.000Z' };
  return { ...p1, ...p2, ...p3, finishedAt: '2026-09-04T00:00:02.000Z', ...overrides };
}

function aPage(items: RunDto[], total = items.length): Page<RunDto> {
  return { items, page: 1, pageSize: 20, total, totalPages: Math.ceil(total / 20) };
}

describe('run list', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'runs', component: RunList }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  async function renderAt(url = '/runs') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, RunList);
    const el = harness.routeNativeElement as HTMLElement;
    const p1 = { el, fixture: harness.fixture };
    const p2 = { text: () => el.textContent ?? '', settle: () => harness.fixture.whenStable() };
    return { ...p1, ...p2 };
  }

  it('tells the user it is working before the first page arrives', async () => {
    const view = await renderAt();
    expect(view.text()).toContain('Loading runs');
    http.expectOne((r) => r.url.endsWith('/runs')).flush(aPage([]));
  });

  it('renders a row per run with its workflow and status', async () => {
    const view = await renderAt();
    http.expectOne((r) => r.url.endsWith('/runs')).flush(aPage([aRun({ workflowName: 'Invoice sync' })]));
    await view.settle();
    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.text()).toContain('Invoice sync');
    expect(view.text()).toContain('succeeded');
    expect(view.text()).toContain('Total runs');
    expect(view.text()).toContain('Manual');
  });

  it('reads its initial filters out of the url', async () => {
    const view = await renderAt('/runs?status=failed&page=2');
    const request = http.expectOne((r) => r.url.endsWith('/runs'));
    expect(request.request.params.get('status')).toBe('failed');
    expect(request.request.params.get('page')).toBe('2');
    request.flush(aPage([]));
    await view.settle();
  });

  it('puts a changed filter into the url, not only into component state', async () => {
    const view = await renderAt();
    http.expectOne((r) => r.url.endsWith('/runs')).flush(aPage([]));
    await view.settle();
    const select = view.el.querySelector('select')!;
    select.value = 'queued';
    select.dispatchEvent(new Event('change'));
    await view.settle();
    expect(router.url).toContain('status=queued');
    http.expectOne((r) => r.params.get('status') === 'queued').flush(aPage([]));
    await view.settle();
  });

  it('offers to clear filters when a filter excluded everything', async () => {
    const view = await renderAt('/runs?status=failed');
    http.expectOne((r) => r.params.get('status') === 'failed').flush(aPage([]));
    await view.settle();
    expect(view.text()).toContain('No runs match these filters');
    view.el.querySelector<HTMLButtonElement>('ops-empty-state button')!.click();
    await view.settle();
    expect(router.url).toBe('/runs');
    http.expectOne((r) => r.url.endsWith('/runs') && !r.params.get('status')).flush(aPage([]));
  });

  it('offers a retry that re-issues the request after a failure', async () => {
    const view = await renderAt();
    const body = { type: 'internal', title: 'Something went wrong.', status: 500 };
    const options = { status: 500, statusText: 'Server Error' };
    http.expectOne((r) => r.url.endsWith('/runs')).flush(body, options);
    await view.settle();
    expect(view.el.querySelector('[role="alert"]')).not.toBeNull();
    view.el.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await view.settle();
    http.expectOne((r) => r.url.endsWith('/runs')).flush(aPage([aRun()]));
    await view.settle();
    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('keeps the last page on a failed poll and clears it when filters change', async () => {
    const view = await renderAt();
    http.expectOne('/api/runs').flush(aPage([aRun()], 45));
    await view.settle();
    const failure = { status: 503, statusText: 'Service Unavailable' };
    await vi.waitFor(() => http.expectOne('/api/runs').flush(null, failure), { timeout: 6_000 });
    await view.settle();
    expect(view.el.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.text()).toContain('Page 1 of 3');

    const select = view.el.querySelector('select')!;
    select.value = 'queued';
    select.dispatchEvent(new Event('change'));
    await view.settle();
    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(0);
    http.expectOne('/api/runs?status=queued').flush(aPage([]));
    await view.settle();
    expect(view.el.querySelector('[role="alert"]')).toBeNull();
  }, 10_000);

  it('shows pagination once there is more than one page', async () => {
    const view = await renderAt();
    http.expectOne((r) => r.url.endsWith('/runs')).flush(aPage([aRun()], 45));
    await view.settle();
    expect(view.text()).toContain('Page 1 of 3');
  });
});
