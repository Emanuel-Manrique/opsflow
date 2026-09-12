/** Explicit scope for one tenant operation. Passed as an argument; never stored in AsyncLocalStorage. */
export interface TenantContext {
  readonly tenantId: string;
  readonly actorId?: string;
  readonly traceId?: string;
  readonly traceparent?: string;
}
