import { toWorkflowAction } from './workflow.dto';

describe('toWorkflowAction', () => {
  const p1 = { name: 'Nightly', enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC' };

  it('maps a webhook request onto the domain action', () => {
    const webhook = { url: 'https://example.com/hook', method: 'POST' as const };
    const input = { ...p1, actionType: 'webhook' as const, webhook };
    expect(toWorkflowAction(input)).toEqual({ type: 'webhook', ...webhook });
  });

  it('drops a stale webhook payload when the type is noop', () => {
    const webhook = { url: 'https://example.com/hook', method: 'POST' as const };
    expect(toWorkflowAction({ ...p1, actionType: 'noop', webhook })).toEqual({ type: 'noop' });
  });

  it('refuses a webhook type without a body instead of degrading to noop', () => {
    expect(toWorkflowAction({ ...p1, actionType: 'webhook' })).toBeNull();
  });
});
