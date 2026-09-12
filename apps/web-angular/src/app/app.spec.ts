import { Session } from './core/session';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { appRoutes } from './app.routes';

describe('App shell', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(appRoutes), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
    const p1 = { userId: 'admin', email: 'admin@test.local', tenantId: 'acme' };
    const p2 = { tenantSlug: 'acme', tenantName: 'Acme', role: 'admin' as const };
    const member = { ...p1, ...p2 };
    TestBed.inject(Session).data.set({ member, memberships: [member], demoEnabled: true });
  });

  async function render(): Promise<ComponentFixture<App>> {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture;
  }

  function text(fixture: ComponentFixture<App>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('only links features that exist', async () => {
    const fixture = await render();

    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nav a')
    ).map((a) => a.textContent?.trim());

    expect(labels).toEqual(['Battle View', 'Workflows', 'Runs']);
    expect(text(fixture)).toContain('Acme');
  });

  it('shows the active tenant even when it is not the first option', async () => {
    const acme = { userId: 'admin', email: 'admin@test.local', tenantId: 'acme', tenantSlug: 'acme', tenantName: 'Acme', role: 'admin' as const };
    const globex = { ...acme, tenantId: 'globex', tenantSlug: 'globex', tenantName: 'Globex' };
    TestBed.inject(Session).data.set({ member: globex, memberships: [acme, globex], demoEnabled: true });

    const fixture = await render();

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect(select.value).toBe('globex');
    expect(select.selectedOptions[0].textContent).toContain('Globex');
  });

  it('gives keyboard users a skip link into main content', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(
      el.querySelector('a[href="#main"]')?.getAttribute('href')
    ).toBe('#main');
    expect(el.querySelector('#main')?.getAttribute('tabindex')).toBe('-1');
  });

  it('sends the bare root to battle', async () => {
    const fixture = await render();

    await router.navigateByUrl('/');
    await fixture.whenStable();

    expect(router.url).toBe('/battle');
  });

  it('loads a feature lazily into the outlet', async () => {
    const fixture = await render();

    await router.navigateByUrl('/workflows');
    await fixture.whenStable();

    expect(text(fixture)).toContain('Workflows');
  });

  it('falls through to the not-found page for an unknown url', async () => {
    const fixture = await render();

    await router.navigateByUrl('/workflows/does-not-exist/nope');
    await fixture.whenStable();

    expect(text(fixture)).toContain('That page does not exist');
  });

  it('opens the demo session when nobody is signed in', async () => {
    TestBed.inject(Session).data.set({ member: null, memberships: [], demoEnabled: true });
    const fixture = await render();

    expect(text(fixture)).toContain('Open a demo session');
    expect(text(fixture)).toContain('Continue as Admin');
    expect(text(fixture)).toContain('Chaos / HTTP 500');
    expect(text(fixture)).toContain('Automate · Observe · Recover');
  });
});
