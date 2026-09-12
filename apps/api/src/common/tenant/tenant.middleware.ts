import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { HTTP_HEADERS } from '@opsflow/contracts';
import { observe } from '@opsflow/observability';
import type { Observation } from '@opsflow/observability';
import { SpanStatusCode } from '@opentelemetry/api';
import type { Attributes } from '@opentelemetry/api';
import type { TenantRequest } from './tenant-request.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: TenantRequest, res: Response, next: NextFunction): void {
    const tenantId = req.header(HTTP_HEADERS.tenantId);
    const supplied = req.header(HTTP_HEADERS.traceId);
    req.tenantId = tenantId && UUID.test(tenantId) ? tenantId : undefined;
    req.traceId = supplied && UUID.test(supplied) ? supplied : randomUUID();
    res.setHeader(HTTP_HEADERS.traceId, req.traceId);
    res.setHeader('Cache-Control', 'no-store');
    const attributes: Attributes = { method: req.method, tenantId: req.tenantId, requestId: req.traceId };
    const work = ({ span, traceparent }: Observation) => new Promise<void>((resolve, reject) => {
      req.traceparent = traceparent;
      if (traceparent) res.setHeader('traceparent', traceparent);
      const finish = () => {
        res.off('finish', finish);
        res.off('close', finish);
        const route: unknown = req.route?.path;
        attributes['route'] = typeof route === 'string' ? route : 'unmatched';
        attributes['statusCode'] = res.statusCode;
        attributes['aborted'] = !res.writableFinished;
        if (res.statusCode >= 500 || !res.writableFinished) span.setStatus({ code: SpanStatusCode.ERROR });
        resolve();
      };
      res.once('finish', finish);
      res.once('close', finish);
      try { next(); } catch (error) {
        res.off('finish', finish);
        res.off('close', finish);
        reject(error);
      }
    });
    void observe('http.request', attributes, work, req.header('traceparent')).catch(next);
  }
}
