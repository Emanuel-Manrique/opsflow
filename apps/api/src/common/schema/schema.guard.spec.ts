import type { ExecutionContext } from '@nestjs/common';
import type { PersistenceHealth } from '@opsflow/persistence';
import { SchemaGuard } from './schema.guard';

function contextFor(method: string): ExecutionContext {
  const request = { method };
  const http = { getRequest: () => request };
  return { switchToHttp: () => http } as unknown as ExecutionContext;
}

describe('SchemaGuard', () => {
  const isSchemaCurrent = vi.fn<PersistenceHealth['isSchemaCurrent']>();
  const guard = new SchemaGuard({ isSchemaCurrent } as unknown as PersistenceHealth);

  beforeEach(() => vi.resetAllMocks());

  it('refuses mutations with a retryable 503 while migrations are pending', async () => {
    isSchemaCurrent.mockResolvedValue(false);

    const refused = guard.canActivate(contextFor('POST'));

    await expect(refused).rejects.toMatchObject({ status: 503, response: { type: 'runtime_unavailable' } });
  });

  it('keeps reads answerable so the console can still explain the outage', async () => {
    isSchemaCurrent.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor('GET'))).resolves.toBe(true);
    expect(isSchemaCurrent).not.toHaveBeenCalled();
  });

  it('lets mutations through once the ledger matches the build', async () => {
    isSchemaCurrent.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor('POST'))).resolves.toBe(true);
  });
});
