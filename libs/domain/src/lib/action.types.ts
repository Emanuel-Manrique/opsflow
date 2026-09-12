export type ActionType = 'webhook' | 'noop';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface WebhookAction {
  readonly type: 'webhook';
  readonly url: string;
  readonly method: HttpMethod;
}

export interface NoopAction {
  readonly type: 'noop';
}

export type Action = WebhookAction | NoopAction;

export interface ActionProblem {
  readonly field: 'url' | 'method';
  readonly message: string;
}
