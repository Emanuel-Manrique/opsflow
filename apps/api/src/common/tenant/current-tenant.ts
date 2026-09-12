import { createParamDecorator, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '@opsflow/contracts';
import type { TenantRequest } from './tenant-request.types';

export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext): TenantContext => {
  const request = context.switchToHttp().getRequest<TenantRequest>();
  if (!request.tenant) throw new UnauthorizedException('An authenticated tenant is required.');
  return request.tenant;
});
