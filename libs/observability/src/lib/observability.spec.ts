import { propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { observe } from './observability';

describe('explicit trace propagation', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const parent = '00-11111111111111111111111111111111-2222222222222222-01';

  beforeAll(() => provider.register({ contextManager: null }));
  beforeEach(() => {
    exporter.reset();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await provider.shutdown();
    trace.disable();
    propagation.disable();
  });

  it('preserves parentage through serialized carriers without mixing concurrent requests', async () => {
    const other = '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01';
    const work = async (traceparent: string) => observe('request', {}, async (observation) => {
      await Promise.resolve();
      await observe('job', {}, async () => undefined, observation.traceparent);
    }, traceparent);
    await Promise.all([work(parent), work(other)]);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(4);
    for (const id of [parent.split('-')[1], other.split('-')[1]]) {
      const request = spans.find((span) => span.name === 'request' && span.spanContext().traceId === id)!;
      const job = spans.find((span) => span.name === 'job' && span.spanContext().traceId === id)!;
      expect(job.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
      expect(request.parentSpanContext?.spanId).toBe(id === parent.split('-')[1] ? '2222222222222222' : 'bbbbbbbbbbbbbbbb');
    }
  });

  it('starts a root for an invalid carrier and records failures without leaking error messages', async () => {
    const error = new Error('password=private-secret');
    await expect(observe('failed', { tenantId: 'acme' }, async () => { throw error; }, 'invalid')).rejects.toBe(error);
    const [span] = exporter.getFinishedSpans();
    expect(span.parentSpanContext).toBeUndefined();
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'Error' });
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'failed', tenantId: 'acme', errorCode: 'Error' }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-secret');
    expect(span.events).toEqual([]);
  });
});
