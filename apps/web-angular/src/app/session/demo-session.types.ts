import type { Role } from '@opsflow/contracts';

export interface DemoRoleCard {
  readonly role: Role;
  readonly title: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

export interface PreviewMetric {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}
