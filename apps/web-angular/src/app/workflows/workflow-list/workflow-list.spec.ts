import { Session } from '../../core/session';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Page, WorkflowDto } from '@opsflow/contracts';
import { WorkflowList } from './workflow-list';

function aWorkflow(overrides: Partial<WorkflowDto> = {}): WorkflowDto {
  const p1 = { id: crypto.randomUUID(), name: 'Nightly sync', enabled: true };
  const p2 = { cronExpr: '0 3 * * *', timezone: 'UTC', action: { type: 'noop' as const } };
  const p3 = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
  return { ...p1, ...p2, ...p3, ...overrides };
}

function aPage(items: WorkflowDto[], total = items.length): Page<WorkflowDto> {
  return { items, page: 1, pageSize: 20, total, totalPages: Math.ceil(total / 20) };
}

describe('workflow list', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'workflows', component: WorkflowList }], withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    const p1 = { userId: 'admin', email: 'admin@test.local', tenantId: 'acme' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'admin' as const };
    const member = { ...p1, ...p2 };
    TestBed.inject(Session).data.set({ member, memberships: [member], demoEnabled: true });
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  async function renderAt(url = '/workflows') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, WorkflowList);

    const el = harness.routeNativeElement as HTMLElement;

    const p1 = { el, fixture: harness.fixture };
    const p2 = { text: () => el.textContent ?? '', settle: () => harness.fixture.whenStable() };
    return { ...p1, ...p2 };
  }

  it('allows repeating a search after clearing filters', async () => {
    const view = await renderAt();
    http.expectOne('/api/workflows').flush(aPage([]));
    await view.settle();
    const input = view.el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await view.settle();
    http.expectOne('/api/workflows?q=alpha').flush(aPage([]));
    await view.settle();
    view.el.querySelector<HTMLButtonElement>('ops-empty-state button')!.click();
    await view.settle();
    http.expectOne('/api/workflows').flush(aPage([]));
    await view.settle();
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await view.settle();
    http.expectOne('/api/workflows?q=alpha').flush(aPage([]));
    expect(router.url).toContain('q=alpha');
  });

  it('does not restore a pending search after clearing filters', async () => {
    const view = await renderAt('/workflows?q=old');
    http.expectOne('/api/workflows?q=old').flush(aPage([]));
    await view.settle();
    const input = view.el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'pending';
    input.dispatchEvent(new Event('input'));
    view.el.querySelector<HTMLButtonElement>('ops-empty-state button')!.click();
    await view.settle();
    http.expectOne('/api/workflows').flush(aPage([]));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await view.settle();
    expect(router.url).toBe('/workflows');
    expect(input.value).toBe('');
  });

  it('cancels a pending Run now when leaving the list without navigating', async () => {
    const view = await renderAt();
    const workflow = aWorkflow();
    http.expectOne('/api/workflows').flush(aPage([workflow]));
    await view.settle();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    view.el.querySelector<HTMLButtonElement>('[aria-label^="Run "]')!.click();
    const request = http.expectOne(`/api/workflows/${workflow.id}/runs`);
    view.fixture.destroy();
    await Promise.resolve();
    expect(request.cancelled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('tells the user it is working before the first page arrives', async () => {
    const view = await renderAt();

    expect(view.text()).toContain('Loading workflows');

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([]));
  });

  it('renders a row per workflow with its schedule and status', async () => {
    const view = await renderAt();

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([aWorkflow({ name: 'Invoice sync' })]));
    await view.settle();

    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.text()).toContain('Invoice sync');
    expect(view.text()).toContain('0 3 * * *');
    expect(view.text()).toContain('Enabled');
    expect(view.text()).toContain('Test run');
    expect(view.text()).toContain('Total workflows');
    expect(view.text()).toContain('Active workflows');
  });

  it('offers a create action when the tenant has no workflows at all', async () => {
    const view = await renderAt();

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([]));
    await view.settle();

    expect(view.text()).toContain('No workflows yet');
    expect(view.el.querySelector('[role="status"]')).not.toBeNull();
  });

  it('offers to clear filters instead when a filter is what excluded everything', async () => {
    const view = await renderAt('/workflows?q=nothingmatches');

    http.expectOne((r) => r.params.get('q') === 'nothingmatches').flush(aPage([]));
    await view.settle();

    expect(view.text()).toContain('No workflows match these filters');
    expect(view.text()).toContain('Clear filters');
  });

  it('reads its initial filters out of the url', async () => {
    const view = await renderAt('/workflows?q=nightly&enabled=false&sort=-updatedAt&page=2');

    const request = http.expectOne((r) => r.url.endsWith('/workflows'));

    expect(request.request.params.get('q')).toBe('nightly');
    expect(request.request.params.get('enabled')).toBe('false');
    expect(request.request.params.get('sort')).toBe('-updatedAt');
    expect(request.request.params.get('page')).toBe('2');

    request.flush(aPage([]));
    await view.settle();
  });

  it('keeps typed search text until the url catches up', async () => {
    const view = await renderAt();

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([]));
    await view.settle();

    const input = view.el.querySelector<HTMLInputElement>('input[type="search"]');
    input!.value = 'inv';
    input!.dispatchEvent(new Event('input'));
    await view.settle();

    expect(input!.value).toBe('inv');
    expect(router.url).not.toContain('q=inv');

    await new Promise((resolve) => setTimeout(resolve, 350));
    await view.settle();

    expect(input!.value).toBe('inv');
    expect(router.url).toContain('q=inv');

    http.expectOne((r) => r.params.get('q') === 'inv').flush(aPage([]));
    await view.settle();
  });

  it('puts a changed filter into the url, not only into component state', async () => {
    const view = await renderAt();

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([]));
    await view.settle();

    const select = view.el.querySelectorAll('select')[0] as HTMLSelectElement;
    select.value = 'true';
    select.dispatchEvent(new Event('change'));
    await view.settle();

    expect(router.url).toContain('enabled=true');

    http.expectOne((r) => r.params.get('enabled') === 'true').flush(aPage([]));
    await view.settle();
  });

  it('offers a retry that re-issues the request after a failure', async () => {
    const view = await renderAt();

    const body = { type: 'internal', title: 'Something went wrong.', status: 500 };
    const options = { status: 500, statusText: 'Server Error' };
    http.expectOne((r) => r.url.endsWith('/workflows')).flush(body, options);
    await view.settle();

    expect(view.el.querySelector('[role="alert"]')).not.toBeNull();

    view.el.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await view.settle();

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([aWorkflow()]));
    await view.settle();

    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('exposes the sort direction through aria, not only through styling', async () => {
    const view = await renderAt('/workflows?sort=-name');

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([aWorkflow()]));
    await view.settle();

    expect(view.el.querySelector('thead th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('shows pagination once there is more than one page', async () => {
    const view = await renderAt();

    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([aWorkflow()], 45));
    await view.settle();

    expect(view.text()).toContain('Page 1 of 3');
  });

  it('explains why a viewer was sent back from the editor', async () => {
    const p1 = { userId: 'viewer', email: 'viewer@test.local', tenantId: 'acme' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'viewer' as const };
    const member = { ...p1, ...p2 };
    TestBed.inject(Session).data.set({ member, memberships: [member], demoEnabled: true });
    const view = await renderAt('/workflows?denied=edit');
    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([]));
    await view.settle();
    expect(view.text()).toContain('Your role can view workflows, not create or edit them.');
  });

  it('prevents overlapping run submissions and restores controls after failure', async () => {
    const view = await renderAt();
    const workflows = [aWorkflow(), aWorkflow({ name: 'Other workflow' })];
    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage(workflows));
    await view.settle();

    const buttons = view.el.querySelectorAll<HTMLButtonElement>('[aria-label^="Run "]');
    buttons[0].click();
    buttons[1].click();
    await view.settle();
    expect([...buttons].every((button) => button.disabled)).toBe(true);

    const request = http.expectOne(`/api/workflows/${workflows[0].id}/runs`);
    expect(request.request.method).toBe('POST');
    const p1 = { type: 'internal', status: 503 };
    const body = { ...p1, title: 'Could not save the run.' };
    request.flush(body, { status: 503, statusText: 'Service Unavailable' });
    await view.settle();

    await vi.waitFor(() => expect(view.text()).toContain(body.title));
    expect([...buttons].every((button) => !button.disabled)).toBe(true);
    expect(router.url).toBe('/workflows');
  });

  it('asks before deleting and then removes the workflow', async () => {
    const view = await renderAt();
    const workflow = aWorkflow({ name: 'Disposable' });
    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([workflow]));
    await view.settle();

    view.el.querySelector<HTMLButtonElement>('[aria-label="Delete Disposable"]')!.click();
    await view.settle();
    view.el.querySelector<HTMLButtonElement>('[aria-label="Confirm delete Disposable"]')!.click();
    await view.settle();

    const request = http.expectOne(`/api/workflows/${workflow.id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await vi.waitFor(() => {
      http.expectOne((r) => r.url.endsWith('/workflows') && r.method === 'GET').flush(aPage([]));
    });
    await view.settle();

    expect(view.el.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('hides delete from a viewer', async () => {
    const p1 = { userId: 'viewer', email: 'viewer@test.local', tenantId: 'acme' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'viewer' as const };
    TestBed.inject(Session).data.set({ member: { ...p1, ...p2 }, memberships: [{ ...p1, ...p2 }], demoEnabled: true });
    const view = await renderAt();
    http.expectOne((r) => r.url.endsWith('/workflows')).flush(aPage([aWorkflow()]));
    await view.settle();

    expect(view.el.querySelector('[aria-label^="Delete "]')).toBeNull();
  });
});
