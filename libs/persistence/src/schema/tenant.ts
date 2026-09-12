import { EntitySchema } from 'typeorm';
import type { TenantRow } from './schema.types';

export const TenantEntity = new EntitySchema<TenantRow>({
  name: 'TenantEntity',
  tableName: 'tenants',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid', default: () => 'gen_random_uuid()' },
    slug: { type: 'text' },
    name: { type: 'text' },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true, default: () => 'now()' },
  },
  indices: [{ name: 'uq_tenants_slug', columns: ['slug'], unique: true }],
  checks: [
    { name: 'ck_tenants_slug_shape', expression: "slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'" },
    { name: 'ck_tenants_name_not_blank', expression: 'length(btrim(name)) > 0' },
  ],
});
