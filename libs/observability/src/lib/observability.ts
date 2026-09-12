import { propagation, ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes } from '@opentelemetry/api';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import type { Observation, Telemetry } from './observability.types';

export function startTelemetry(serviceName: string): Telemetry {
  const url = process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
  const spanProcessors = url ? [new BatchSpanProcessor(new OTLPTraceExporter({ url }))] : [];
  const resource = defaultResource().merge(resourceFromAttributes({ 'service.name': serviceName }));
  const provider = new NodeTracerProvider({ resource, spanProcessors });
  // Span parents travel explicitly across transports; no ambient business context.
  provider.register({ contextManager: null });
  return { shutdown: () => provider.shutdown() };
}

export async function observe<T>(name: string, attributes: Attributes, work: (observation: Observation) => Promise<T>, parent?: string): Promise<T> {
  const carrier = parent ? { traceparent: parent } : {};
  const context = propagation.extract(ROOT_CONTEXT, carrier);
  const span = trace.getTracer('opsflow').startSpan(name, { attributes }, context);
  const headers: Record<string, string> = {};
  propagation.inject(trace.setSpan(ROOT_CONTEXT, span), headers);
  const started = performance.now();
  let errorCode: string | undefined;
  try {
    return await work({ span, traceparent: headers['traceparent'] });
  } catch (error) {
    errorCode = error instanceof Error ? error.name : 'Error';
    // Error messages can include SQL parameters, cookies or webhook credentials.
    span.setStatus({ code: SpanStatusCode.ERROR, message: errorCode });
    throw error;
  } finally {
    span.setAttributes(attributes);
    span.end();
    const { traceId, spanId } = span.spanContext();
    const durationMs = Math.round((performance.now() - started) * 100) / 100;
    const entry = { event: name, ...attributes, traceId, spanId, durationMs, errorCode };
    if (errorCode) console.error(entry);
    else console.log(entry);
  }
}
