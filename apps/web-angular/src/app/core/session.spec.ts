import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import type { SessionDto } from '@opsflow/contracts';
import { activeTenantId, Session, TENANT_STORAGE_KEY } from './session';

const ACME = '00000000-0000-4000-8000-0000000000a1';
const GLOBEX = '00000000-0000-4000-8000-0000000000b2';

function memberOf(tenantId: string, tenantName: string) {
  const p1 = { userId: 'admin', email: 'admin@test.local', tenantId };
  return { ...p1, tenantSlug: tenantName.toLowerCase(), tenantName, role: 'admin' as const };
}

const acme = memberOf(ACME, 'Acme');
const dto: SessionDto = { member: acme, memberships: [acme, memberOf(GLOBEX, 'Globex')], demoEnabled: true };

function changeTo(tenantId: string): Event {
  return { target: { value: tenantId } } as unknown as Event;
}

describe('Session tenant selection', () => {
  const original = window.location;
  let session: Session;
  let http: HttpTestingController;
  let location: { pathname: string; assign: Mock<(url: string) => void>; reload: Mock<() => void> };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(Session);
    sessionStorage.clear();
    location = { pathname: '/battle', assign: vi.fn<(url: string) => void>(), reload: vi.fn<() => void>() };
    Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
    session.data.set(dto);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true });
    sessionStorage.clear();
  });

  it('keeps showing the tenant that was picked while the switch is in flight', () => {
    expect(session.tenantId()).toBe(ACME);

    session.selectTenant(changeTo(GLOBEX));

    expect(session.tenantId()).toBe(GLOBEX);
    expect(session.busy()).toBe(true);
    expect(location.assign).toHaveBeenCalledExactlyOnceWith('/battle');
  });

  it('scopes requests to the tenant that was picked, not the one being left', () => {
    session.selectTenant(changeTo(GLOBEX));

    expect(activeTenantId(session)).toBe(GLOBEX);
  });

  it('ignores a second switch while one is already running', () => {
    session.selectTenant(changeTo(GLOBEX));
    session.selectTenant(changeTo(ACME));

    expect(location.assign).toHaveBeenCalledExactlyOnceWith('/battle');
    expect(session.tenantId()).toBe(GLOBEX);
  });

  it('drops the tenant choice when the identity changes', async () => {
    sessionStorage.setItem(TENANT_STORAGE_KEY, GLOBEX);
    const changing = session.change('viewer');
    http.expectOne('/api/session/demo').flush(null, { status: 204, statusText: 'No Content' });
    await changing;

    expect(sessionStorage.getItem(TENANT_STORAGE_KEY)).toBeNull();
    expect(location.reload).toHaveBeenCalledOnce();
  });
});
