import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { SessionRepository } from '@opsflow/persistence';
import type { TenantRequest } from '../../common/tenant/tenant-request.types';
import { SessionController } from './session.controller';
import { assertSameOriginMutation } from '../../common/tenant/session-cookie';

it('never opens a demo session in production, even with the demo flag enabled', async () => {
  const sessions = { create: vi.fn<SessionRepository['create']>() };
  const config = new ConfigService({ NODE_ENV: 'production', DEMO_AUTH_ENABLED: true });
  const controller = new SessionController(sessions as unknown as SessionRepository, config);
  const request = controller.demo({ role: 'admin' }, {} as Request, {} as Response);
  await expect(request).rejects.toBeInstanceOf(NotFoundException);
  expect(sessions.create).not.toHaveBeenCalled();
});

it('selects the requested membership and falls back to the first', async () => {
  const p1 = { userId: 'admin', email: 'admin@test.local', role: 'admin' as const };
  const acme = { ...p1, tenantId: 'a', tenantSlug: 'acme', tenantName: 'Acme' };
  const globex = { ...p1, tenantId: 'g', tenantSlug: 'globex', tenantName: 'Globex' };
  const sessions = { list: vi.fn<SessionRepository['list']>().mockResolvedValue([acme, globex]) };
  const config = new ConfigService({ NODE_ENV: 'test', DEMO_AUTH_ENABLED: true });
  const controller = new SessionController(sessions as unknown as SessionRepository, config);
  const res = { setHeader: vi.fn<() => void>() } as unknown as Response;
  const token = 'a'.repeat(64);
  const headers = { cookie: `opsflow_session=${token}` };
  const none = await controller.get({ headers } as TenantRequest, res);
  expect(none.member).toEqual(acme);
  expect(none.memberships).toEqual([acme, globex]);
  const selected = await controller.get({ headers, tenantId: 'g' } as TenantRequest, res);
  expect(selected.member).toEqual(globex);
  expect(sessions.list).toHaveBeenCalledWith(token);
});

it('rejects cross-site and simple form mutations', () => {
  const req = { header: () => undefined } as unknown as Request;
  expect(() => assertSameOriginMutation(req)).toThrow(ForbiddenException);
  const crossSite = { header: (name: string) => name === 'sec-fetch-site' ? 'cross-site' : '1' } as unknown as Request;
  expect(() => assertSameOriginMutation(crossSite)).toThrow(ForbiddenException);
});
