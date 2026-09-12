export interface ExportedSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  attributes: { key: string; value: { stringValue?: string; intValue?: number } }[];
  status: { code: number };
}

export interface TraceExport {
  resourceSpans?: { scopeSpans?: { spans: ExportedSpan[] }[] }[];
}
