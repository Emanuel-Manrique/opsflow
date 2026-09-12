import { can, isRole, PERMISSIONS, ROLES, rolesAllowing } from './access';
import type { Permission, Role } from './access.types';

const MATRIX: Record<Role, readonly Permission[]> = {
  viewer: ['workflow.read'],
  operator: ['workflow.read', 'run.mutate'],
  admin: ['workflow.read', 'workflow.write', 'run.mutate', 'audit.read'],
};

describe('access', () => {
  it.each(ROLES)('accepts role %s', (role) => {
    expect(isRole(role)).toBe(true);
  });

  it('rejects a role that is not in the membership', () => {
    expect(isRole('owner')).toBe(false);
  });

  it.each(ROLES)('grants %s exactly the permissions in the matrix', (role) => {
    expect(PERMISSIONS.filter((permission) => can(role, permission))).toEqual([...MATRIX[role]]);
  });

  it.each(PERMISSIONS)('rolesAllowing(%s) matches can()', (permission) => {
    expect(rolesAllowing(permission)).toEqual(ROLES.filter((role) => can(role, permission)));
  });

  it('keeps write and audit on admin, and run mutations on operator', () => {
    expect(rolesAllowing('workflow.write')).toEqual(['admin']);
    expect(rolesAllowing('audit.read')).toEqual(['admin']);
    expect(rolesAllowing('run.mutate')).toEqual(['admin', 'operator']);
    expect(rolesAllowing('workflow.read')).toEqual([...ROLES]);
  });
});
