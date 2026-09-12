import { serviceHealthUrl, waitForHttpOk } from '@opsflow/testing';

export async function setup(): Promise<void> {
  await waitForHttpOk(serviceHealthUrl('worker'));
}
