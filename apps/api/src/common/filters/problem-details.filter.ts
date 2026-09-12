import type { TenantRequest } from '../tenant/tenant-request.types';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiProblem, ProblemType } from '@opsflow/contracts';
import { isApiProblem } from '@opsflow/contracts';
import { NameTakenError, NotFoundInTenantError, UnknownTenantError } from '@opsflow/persistence';
import { RunNotFoundError } from '@opsflow/persistence';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<TenantRequest>();
    const problem = this.toProblem(exception);

    if (problem.status >= 500) {
      const entry = { event: 'http.failure', requestId: request.traceId, statusCode: problem.status, errorCode: problem.type };
      this.logger.error(entry);
    }

    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ApiProblem {
    if (exception instanceof NotFoundInTenantError) {
      return this.problem('workflow_not_found', 'Workflow not found.', HttpStatus.NOT_FOUND);
    }

    if (exception instanceof NameTakenError) {
      return this.problem('name_taken', 'A workflow with that name already exists.', HttpStatus.CONFLICT);
    }

    if (exception instanceof RunNotFoundError) {
      return this.problem('run_not_found', 'Run not found.', HttpStatus.NOT_FOUND);
    }

    if (exception instanceof UnknownTenantError) {
      return this.problem('unknown_tenant', 'The tenant is not available.', HttpStatus.UNAUTHORIZED);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    return this.problem('internal', 'Something went wrong.', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private fromHttpException(exception: HttpException): ApiProblem {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const asObject = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

    const declared = { ...asObject, status };
    if (isApiProblem(declared)) {
      return declared;
    }

    if (asObject['type'] === 'validation_failed') {
      const errors = asObject['errors'] as ApiProblem['errors'];
      return { ...this.problem('validation_failed', 'Some fields need attention.', status), errors };
    }

    return this.problem(this.typeForStatus(status), exception.message, status);
  }

  private typeForStatus(status: number): ProblemType {
    if (status === HttpStatus.NOT_FOUND) {
      return 'not_found';
    }

    return status >= 400 && status < 500 ? 'bad_request' : 'internal';
  }

  private problem(type: ProblemType, title: string, status: number): ApiProblem {
    return { type, title, status };
  }
}
