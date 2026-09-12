import { ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from './tenant-request.types';
import type { Permission, Role } from '@opsflow/domain';
import { rolesAllowing } from '@opsflow/domain';
import { SessionRepository } from '@opsflow/persistence';
import { assertSameOriginMutation, sessionToken } from './session-cookie';

export const Permit = (permission: Permission) => SetMetadata('opsflow.roles', rolesAllowing(permission));

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly sessions: SessionRepository, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException({ type: 'tenant_required', title: 'A tenant is required for this request.' });
    }
    const token = sessionToken(req);
    if (!token) throw new UnauthorizedException({ type: 'session_required', title: 'Sign in to continue.' });
    const member = await this.sessions.find(token, tenantId);
    if (!member) throw new UnauthorizedException({ type: 'session_required', title: 'Session expired or tenant unavailable.' });
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<readonly Role[]>('opsflow.roles', targets);
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if ((roles && !roles.includes(member.role)) || (mutation && !roles)) {
      throw new ForbiddenException({ type: 'forbidden', title: 'Your role does not allow this action.' });
    }
    if (mutation) assertSameOriginMutation(req);
    req.tenant = { tenantId: member.tenantId, actorId: member.userId, traceId: req.traceId, traceparent: req.traceparent };
    return true;
  }
}
