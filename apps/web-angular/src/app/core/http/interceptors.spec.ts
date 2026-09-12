import { HttpErrorResponse } from '@angular/common/http';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEMO_TENANTS, HTTP_HEADERS } from '@opsflow/contracts';
import { Session, TENANT_STORAGE_KEY } from '../session';
import { apiInterceptor, toProblem } from './interceptors';

describe('problem details for text responses', () => {
  it('preserves structured errors from a rejected SSE request', () => {
    const body = { type: 'run_not_found', title: 'Run not found.', status: 404 };
    const options = { error: JSON.stringify(body), status: 404 };
    expect(toProblem(new HttpErrorResponse(options))).toEqual(body);
  });

  it('falls back safely for malformed text from an intermediary', () => {
    const options = { error: '<html>Bad gateway</html>', status: 502 };
    const problem = toProblem(new HttpErrorResponse(options));
    expect(problem.type).toBe('internal');
    expect(problem.status).toBe(502);
    expect(problem.title).not.toContain('<html>');
  });
});

describe('apiInterceptor tenant', () => {
  let http: HttpClient;
  let testing: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    testing = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    testing.verify();
    sessionStorage.clear();
  });

  it('omits the tenant header until a membership is known', () => {
    http.get('/api/session').subscribe();
    const request = testing.expectOne('/api/session');
    expect(request.request.headers.has(HTTP_HEADERS.tenantId)).toBe(false);
    expect(request.request.headers.get('x-opsflow-request')).toBe('1');
    request.flush({ member: null, memberships: [], demoEnabled: true });
  });

  it('sends the session tenant instead of a hardcoded demo id', () => {
    const session = TestBed.inject(Session);
    const p1 = { userId: 'admin', email: 'admin@test.local', tenantId: DEMO_TENANTS.globex };
    const p2 = { tenantSlug: 'globex', tenantName: 'Globex', role: 'admin' as const };
    const member = { ...p1, ...p2 };
    session.data.set({ member, memberships: [member], demoEnabled: true });
    http.get('/api/workflows').subscribe();
    const request = testing.expectOne('/api/workflows');
    expect(request.request.headers.get(HTTP_HEADERS.tenantId)).toBe(DEMO_TENANTS.globex);
    expect(request.request.headers.get(HTTP_HEADERS.tenantId)).not.toBe(DEMO_TENANTS.acme);
    request.flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it('falls back to the stored tenant before restore completes', () => {
    sessionStorage.setItem(TENANT_STORAGE_KEY, DEMO_TENANTS.globex);
    http.get('/api/workflows').subscribe();
    const request = testing.expectOne('/api/workflows');
    expect(request.request.headers.get(HTTP_HEADERS.tenantId)).toBe(DEMO_TENANTS.globex);
    request.flush({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });
});
