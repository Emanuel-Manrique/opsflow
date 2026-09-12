import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { WorkflowEditor } from './workflow-editor';

const routes = [{ path: 'workflows/:id/edit', component: WorkflowEditor }];

function setValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

describe('WorkflowEditor', () => {
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
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  async function render() {
    const fixture = TestBed.createComponent(WorkflowEditor);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('cancels a pending save when destroyed without navigating', async () => {
    const view = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    navigate.mockResolvedValue(true);
    setValue(view.element.querySelector<HTMLInputElement>('input[type="text"]')!, 'Review');
    view.element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await view.fixture.whenStable();
    const request = http.expectOne('/api/workflows');
    view.fixture.destroy();
    await Promise.resolve();
    expect(request.cancelled).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('allows saving noop after discarding an invalid webhook URL', async () => {
    const view = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    navigate.mockResolvedValue(true);
    setValue(view.element.querySelector<HTMLInputElement>('input[type="text"]')!, 'Review');
    const select = view.element.querySelector<HTMLSelectElement>('select')!;
    setValue(select, 'webhook');
    await view.fixture.whenStable();
    setValue(view.element.querySelector<HTMLInputElement>('input[type="url"]')!, 'invalid');
    setValue(select, 'noop');
    await view.fixture.whenStable();
    expect(view.element.querySelector('input[type="url"]')).toBeNull();
    view.element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await view.fixture.whenStable();
    const request = http.expectOne('/api/workflows');
    expect(request.request.body.actionType).toBe('noop');
    expect(request.request.body.webhook).toBeUndefined();
    request.flush({ name: 'Review' });
    await view.fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/workflows'], { queryParams: { q: 'Review' } });
  });

  it('does not submit an invalid schedule', async () => {
    const view = await render();
    const textInputs = view.element.querySelectorAll<HTMLInputElement>('input[type="text"]');

    setValue(textInputs[0], 'Nightly sync');
    setValue(textInputs[1], 'nope');
    view.element.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await view.fixture.whenStable();

    http.expectNone('/api/workflows');
    expect(view.element.textContent).toContain('Use five fields');
  });

  it('rejects a webhook URL that domain would reject', async () => {
    const view = await render();
    setValue(view.element.querySelector<HTMLInputElement>('input[type="text"]')!, 'Webhook sync');
    setValue(view.element.querySelector<HTMLSelectElement>('select')!, 'webhook');
    await view.fixture.whenStable();
    setValue(view.element.querySelector<HTMLInputElement>('input[type="url"]')!, 'https://user:pass@example.com/hook');
    view.element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await view.fixture.whenStable();
    http.expectNone('/api/workflows');
    expect(view.element.textContent).toContain('Do not put credentials in the URL.');
  });

  it('requires a URL for webhook actions', async () => {
    const view = await render();
    const name = view.element.querySelector<HTMLInputElement>('input[type="text"]');
    const action = view.element.querySelector<HTMLSelectElement>('select');

    setValue(name!, 'Webhook sync');
    setValue(action!, 'webhook');
    await view.fixture.whenStable();
    view.element.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await view.fixture.whenStable();

    http.expectNone('/api/workflows');
    expect(view.element.textContent).toContain('A webhook needs a URL');
  });

  it('offers a retry when the workflow cannot be loaded', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/workflows/${id}/edit`, WorkflowEditor);

    const failed = { type: 'workflow_not_found', title: 'Workflow not found.', status: 404 };
    http.expectOne(`/api/workflows/${id}`).flush(failed, { status: 404, statusText: 'Not Found' });
    await Promise.resolve();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    const el = harness.routeNativeElement as HTMLElement;
    expect(el.textContent).toContain('Workflow not found.');

    el.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await harness.fixture.whenStable();

    const p1 = { id, name: 'Nightly sync', enabled: true, cronExpr: '0 3 * * *' };
    const p2 = { timezone: 'UTC', action: { type: 'noop' as const } };
    const p3 = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
    http.expectOne(`/api/workflows/${id}`).flush({ ...p1, ...p2, ...p3 });
    await Promise.resolve();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(el.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('Nightly sync');
  });

  it('cancels the previous load when the route changes, including a return to the same id', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/workflows/first/edit', WorkflowEditor);
    const first = http.expectOne('/api/workflows/first');
    await harness.navigateByUrl('/workflows/second/edit', WorkflowEditor);
    const second = http.expectOne('/api/workflows/second');
    await harness.navigateByUrl('/workflows/first/edit', WorkflowEditor);
    const latest = http.expectOne('/api/workflows/first');
    expect(first.cancelled).toBe(true);
    expect(second.cancelled).toBe(true);
    latest.flush({ name: 'Latest', enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', action: { type: 'noop' } });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.querySelector('input')?.value).toBe('Latest');
  });

  it('clears touched state when another workflow is loaded', async () => {
    const harness = await RouterTestingHarness.create();
    const workflow = { name: 'Review', enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', action: { type: 'noop' } };
    await harness.navigateByUrl('/workflows/first/edit', WorkflowEditor);
    http.expectOne('/api/workflows/first').flush(workflow);
    await harness.fixture.whenStable();
    const first = harness.routeNativeElement!;
    setValue(first.querySelector('input')!, '');
    first.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await harness.fixture.whenStable();
    expect(first.textContent).toContain('Give the workflow a name.');
    await harness.navigateByUrl('/workflows/second/edit', WorkflowEditor);
    http.expectOne('/api/workflows/second').flush(workflow);
    await harness.fixture.whenStable();
    const second = harness.routeNativeElement!;
    setValue(second.querySelector('input')!, '');
    await harness.fixture.whenStable();
    expect(second.textContent).not.toContain('Give the workflow a name.');
  });

  it('cancels a pending save when leaving its workflow', async () => {
    const harness = await RouterTestingHarness.create();
    const workflow = { name: 'Review', enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', action: { type: 'noop' } };
    await harness.navigateByUrl('/workflows/first/edit', WorkflowEditor);
    http.expectOne('/api/workflows/first').flush(workflow);
    await harness.fixture.whenStable();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await harness.fixture.whenStable();
    const save = http.expectOne('/api/workflows/first');
    await harness.navigateByUrl('/workflows/second/edit', WorkflowEditor);
    http.expectOne('/api/workflows/second').flush(workflow);
    expect(save.cancelled).toBe(true);
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
  });

  it('deletes the loaded workflow after confirmation', async () => {
    const id = crypto.randomUUID();
    const harness = await RouterTestingHarness.create();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const workflow = { name: 'Disposable', enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', action: { type: 'noop' } };
    await harness.navigateByUrl(`/workflows/${id}/edit`, WorkflowEditor);
    http.expectOne(`/api/workflows/${id}`).flush(workflow);
    await harness.fixture.whenStable();

    const el = harness.routeNativeElement as HTMLElement;
    const ask = Array.from(el.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete workflow'));
    ask?.click();
    await harness.fixture.whenStable();
    const confirm = Array.from(el.querySelectorAll('button')).find((button) => button.textContent?.includes('Confirm delete'));
    confirm?.click();
    await harness.fixture.whenStable();

    const request = http.expectOne(`/api/workflows/${id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await harness.fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/workflows']);
  });
});
