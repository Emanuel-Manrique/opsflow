import { UnprocessableEntityException } from '@nestjs/common';
import type { CreateWorkflowRequest } from '@opsflow/contracts';
import type { WorkflowRepository } from '@opsflow/persistence';
import { WorkflowsService } from './workflows.service';

const p1 = { name: 'Nightly sync', enabled: false, cronExpr: '0 3 * * *' };
const validInput: CreateWorkflowRequest = { ...p1, timezone: 'UTC', actionType: 'noop' };

describe('WorkflowsService', () => {
  const context = { tenantId: crypto.randomUUID() };
  it('rejects an invalid schedule before persistence', async () => {
    const create = vi.fn<WorkflowRepository['create']>();
    const service = new WorkflowsService({ create } as unknown as WorkflowRepository);

    await expect(service.create(context, { ...validInput, cronExpr: 'nope' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps the wire request onto a domain action before persistence', async () => {
    const p1 = { id: 'w1', name: validInput.name, enabled: validInput.enabled };
    const p2 = { cronExpr: validInput.cronExpr, timezone: validInput.timezone };
    const p3 = { action: { type: 'noop' as const }, createdAt: '', updatedAt: '' };
    const create = vi.fn<WorkflowRepository['create']>().mockResolvedValue({ ...p1, ...p2, ...p3 });
    const service = new WorkflowsService({ create } as unknown as WorkflowRepository);
    const write = { ...p2, name: validInput.name, enabled: validInput.enabled, action: { type: 'noop' as const } };
    await service.create(context, validInput);

    expect(create).toHaveBeenCalledWith(context, write);
  });

  it('rejects a webhook without a body instead of persisting a noop', async () => {
    const create = vi.fn<WorkflowRepository['create']>();
    const service = new WorkflowsService({ create } as unknown as WorkflowRepository);
    const input = { ...validInput, actionType: 'webhook' as const };

    await expect(service.create(context, input)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a webhook whose URL is not http(s)', async () => {
    const create = vi.fn<WorkflowRepository['create']>();
    const service = new WorkflowsService({ create } as unknown as WorkflowRepository);
    const webhook = { url: 'file:///tmp/hook', method: 'POST' as const };
    const input = { ...validInput, actionType: 'webhook' as const, webhook };

    await expect(service.create(context, input)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(create).not.toHaveBeenCalled();
  });
});
