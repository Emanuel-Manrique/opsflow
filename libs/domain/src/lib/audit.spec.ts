import { isAuditAction, AUDIT_ACTIONS } from './audit';

describe('audit actions', () => {
  it.each(AUDIT_ACTIONS)('accepts %s', (action) => {
    expect(isAuditAction(action)).toBe(true);
  });

  it('rejects a free-form verb', () => {
    expect(isAuditAction('run.started ')).toBe(false);
    expect(isAuditAction('delete')).toBe(false);
  });
});
