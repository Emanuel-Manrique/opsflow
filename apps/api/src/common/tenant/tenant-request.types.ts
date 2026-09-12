import type { Request } from 'express';
import type { TenantContext } from '@opsflow/contracts';

export interface TenantRequest extends Request {
  tenantId?: string;
  traceId?: string;
  traceparent?: string;
  tenant?: TenantContext;
}
