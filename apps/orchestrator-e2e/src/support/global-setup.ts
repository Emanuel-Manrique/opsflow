import { serviceBaseUrl, waitForHttpOk } from '@opsflow/testing';

export async function setup(): Promise<void> {
  await waitForHttpOk(`${serviceBaseUrl('api')}/api/ready`);
  await waitForHttpOk(`${serviceBaseUrl('orchestrator')}/api/ready`);
}
