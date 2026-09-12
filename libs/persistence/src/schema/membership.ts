import { ROLES } from '@opsflow/domain';
import { EntitySchema } from 'typeorm';
import type { MembershipRow } from './schema.types';
import { sqlLiterals } from './sql';

export const MembershipEntity = new EntitySchema<MembershipRow>({
  name: 'MembershipEntity',
  tableName: 'memberships',
  columns: {
    userId: { type: 'uuid', name: 'user_id', primary: true },
    tenantId: { type: 'uuid', name: 'tenant_id', primary: true },
    role: { type: 'text' },
  },
  foreignKeys: [
    { name: 'memberships_user_id_fkey', target: 'UserEntity', columnNames: ['userId'], referencedColumnNames: ['id'] },
    { name: 'memberships_tenant_id_fkey', target: 'TenantEntity', columnNames: ['tenantId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' },
  ],
  checks: [{ name: 'memberships_role_check', expression: `role IN (${sqlLiterals(ROLES)})` }],
});
