import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import type { ApiProblem, Role, SessionDto } from '@opsflow/contracts';
import { toProblem } from './http/problem';

export const TENANT_STORAGE_KEY = 'opsflow.tenantId';

const TENANT_SECTIONS = ['workflows', 'runs', 'battle'];

export function activeTenantId(session: Session): string | undefined {
  return sessionStorage.getItem(TENANT_STORAGE_KEY) ?? session.data().member?.tenantId ?? undefined;
}

@Injectable({
  providedIn: 'root',
})
export class Session {
  private readonly http = inject(HttpClient);
  readonly data = signal<SessionDto>({ member: null, memberships: [], demoEnabled: false });
  private readonly pendingTenantId = signal<string | undefined>(undefined);
  readonly problem = signal<ApiProblem | undefined>(undefined);
  readonly busy = signal(false);
  readonly tenantId = computed(() => this.pendingTenantId() ?? this.data().member?.tenantId);
  readonly canEdit = computed(() => this.data().member?.role === 'admin');
  readonly canOperate = computed(() => {
    const role = this.data().member?.role;
    return role === 'admin' || role === 'operator';
  });

  async restore(): Promise<void> {
    this.problem.set(undefined);
    try {
      const dto = await firstValueFrom(this.http.get<SessionDto>('/api/session'));
      this.data.set(dto);
      if (dto.member) sessionStorage.setItem(TENANT_STORAGE_KEY, dto.member.tenantId);
    } catch (error) {
      this.problem.set(toProblem(error));
    }
  }

  async change(role?: Role): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.problem.set(undefined);
    try {
      const request = role ? this.http.post('/api/session/demo', { role }) : this.http.delete('/api/session');
      await firstValueFrom(request);
      sessionStorage.removeItem(TENANT_STORAGE_KEY);
      // A full reload throws away every resource and tenant snapshot when the identity changes.
      window.location.reload();
    } catch (error) {
      this.problem.set(toProblem(error));
      this.busy.set(false);
    }
  }

  selectTenant(event: Event): void {
    const tenantId = (event.target as HTMLSelectElement).value;
    const member = this.data().memberships.find((row) => row.tenantId === tenantId);
    if (this.busy() || !member || member.tenantId === this.tenantId()) return;
    this.pendingTenantId.set(tenantId);
    this.busy.set(true);
    sessionStorage.setItem(TENANT_STORAGE_KEY, tenantId);
    const [, section] = window.location.pathname.split('/');
    window.location.assign(TENANT_SECTIONS.includes(section) ? `/${section}` : '/battle');
  }
}

export const adminGuard: CanActivateFn = () => {
  const session = inject(Session);
  const router = inject(Router);
  if (session.canEdit()) return true;
  return router.createUrlTree(['/workflows'], { queryParams: { denied: 'edit' } });
};
