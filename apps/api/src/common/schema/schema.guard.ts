import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PersistenceHealth } from '@opsflow/persistence';

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class SchemaGuard implements CanActivate {
  constructor(private readonly persistence: PersistenceHealth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (READ_METHODS.includes(request.method)) return true;
    if (await this.persistence.isSchemaCurrent()) return true;
    const title = 'The service cannot accept commands: database migrations are pending.';
    throw new ServiceUnavailableException({ type: 'runtime_unavailable', title });
  }
}
