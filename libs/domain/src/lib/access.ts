import type { Permission, Role } from './access.types';

export const ROLES = ['admin', 'operator', 'viewer'] as const satisfies readonly Role[];

export const PERMISSIONS = ['workflow.read', 'workflow.write', 'run.mutate', 'audit.read'] as const satisfies readonly Permission[];

const GRANTS = {
  viewer: ['workflow.read'],
  operator: ['workflow.read', 'run.mutate'],
  admin: ['workflow.read', 'workflow.write', 'run.mutate', 'audit.read'],
} as const satisfies Record<Role, readonly Permission[]>;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return (GRANTS[role] as readonly Permission[]).includes(permission);
}

export function rolesAllowing(permission: Permission): readonly Role[] {
  return ROLES.filter((role) => can(role, permission));
}
