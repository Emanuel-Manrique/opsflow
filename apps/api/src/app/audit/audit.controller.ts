import type { TenantContext } from '@opsflow/contracts';
import { CurrentTenant } from '../../common/tenant/current-tenant';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuditEntry } from '@opsflow/contracts';
import { AuditRepository } from '@opsflow/persistence';
import { Permit, TenantGuard } from '../../common/tenant/tenant.guard';

@Controller('audit')
@UseGuards(TenantGuard)
@Permit('audit.read')
export class AuditController {
  constructor(private readonly audit: AuditRepository) {}

  @Get()
  list(@CurrentTenant() context: TenantContext): Promise<AuditEntry[]> { return this.audit.list(context); }
}
