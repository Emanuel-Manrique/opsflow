import 'reflect-metadata';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from './tenant-request.types';
import { rolesAllowing } from '@opsflow/domain';
import { DEMO_TENANTS } from '@opsflow/contracts';
import type { SessionRepository } from '@opsflow/persistence';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  const sessions = { find: vi.fn<SessionRepository['find']>() };
  const reflector = new Reflector();
  const guard = new TenantGuard(sessions as unknown as SessionRepository, reflector);
  const userId = crypto.randomUUID();
  const member = { userId, email: 'viewer@test.local', tenantId: DEMO_TENANTS.acme, tenantSlug: 'acme', tenantName: 'Acme', role: 'viewer' as const };
  const handler = () => undefined;
  const headers = { cookie: `opsflow_session=${'a'.repeat(64)}`, 'x-opsflow-request': '1' };
  const req = { method: 'GET', headers, header: (name: string) => headers[name as keyof typeof headers] } as unknown as TenantRequest;
  const context = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => handler, getClass: () => TenantGuard } as unknown as ExecutionContext;
  const check = () => guard.canActivate(context);

  beforeEach(() => {
    req.tenantId = DEMO_TENANTS.acme;
    req.tenant = undefined;
    sessions.find.mockReset().mockResolvedValue(member);
    Reflect.deleteMetadata('opsflow.roles', handler);
  });

  it('requires a tenant and a valid session membership', async () => {
    req.tenantId = undefined;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    req.tenantId = DEMO_TENANTS.acme;
    sessions.find.mockResolvedValueOnce(undefined);
    await expect(check()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps the authenticated actor in request context', async () => {
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.tenant).toEqual({ tenantId: DEMO_TENANTS.acme, actorId: userId });
  });

  it('rejects a viewer even if they call an operational endpoint directly', async () => {
    Reflect.defineMetadata('opsflow.roles', rolesAllowing('run.mutate'), handler);
    await expect(check()).rejects.toBeInstanceOf(ForbiddenException);
    sessions.find.mockResolvedValueOnce({ ...member, role: 'operator' });
    expect(await check()).toBe(true);
  });
});
