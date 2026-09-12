import { Session } from '../core/session';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoSession } from './demo-session';

describe('DemoSession', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Session).data.set({ member: null, memberships: [], demoEnabled: true });
  });

  async function render(): Promise<ComponentFixture<DemoSession>> {
    const fixture = TestBed.createComponent(DemoSession);
    await fixture.whenStable();
    return fixture;
  }

  function text(fixture: ComponentFixture<DemoSession>): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('offers every demo role and previews the real battle arena', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('button')).map((button) => button.textContent ?? '');

    expect(text(fixture)).toContain('Open a demo session');
    expect(labels.some((label) => label.includes('Continue as Admin'))).toBe(true);
    expect(labels.some((label) => label.includes('Continue as Operator'))).toBe(true);
    expect(labels.some((label) => label.includes('Continue as Viewer'))).toBe(true);
    expect(text(fixture)).toContain('Chaos / HTTP 500');
    expect(text(fixture)).toContain('500 Demon');
    expect(text(fixture)).toContain('DEFEATED');
  });

  it('starts the chosen demo role', async () => {
    const fixture = await render();
    const session = TestBed.inject(Session);
    const change = vi.spyOn(session, 'change').mockResolvedValue();
    const admin = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) => {
      return button.textContent?.includes('Continue as Admin');
    });

    admin?.click();
    await fixture.whenStable();

    expect(change).toHaveBeenCalledWith('admin');
  });
});
