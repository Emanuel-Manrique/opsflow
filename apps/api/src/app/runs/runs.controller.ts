import type { TenantContext } from '@opsflow/contracts';
import { CurrentTenant } from '../../common/tenant/current-tenant';
import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { Body, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Response } from 'express';
import type { Page, RawQueryParams, RunDto } from '@opsflow/contracts';
import { parseRunListQuery } from '@opsflow/contracts';
import { Permit, TenantGuard } from '../../common/tenant/tenant.guard';
import { RunsService } from './runs.service';
import { StartRunDto } from './start-run.dto';

@Controller()
@UseGuards(TenantGuard)
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post('workflows/:workflowId/runs')
  @Permit('run.mutate')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @CurrentTenant() context: TenantContext, @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @Res({ passthrough: true }) res: Response, @Body() body: StartRunDto
  ): Promise<RunDto> {
    const run = await this.runs.start(context, workflowId, body.scenario);
    res.location(`/api/runs/${run.id}`);
    return run;
  }

  @Get('runs')
  list(@CurrentTenant() context: TenantContext, @Query() query: RawQueryParams): Promise<Page<RunDto>> {
    if (Object.values(query).some((value) => typeof value !== 'string')) {
      throw new BadRequestException('Query parameters must be single strings.');
    }
    return this.runs.list(context, parseRunListQuery(query));
  }

  @Get('runs/:id')
  findById(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RunDto> {
    return this.runs.findById(context, id);
  }

  @Sse('runs/:id/events')
  events(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<Observable<MessageEvent>> {
    return this.runs.watch(context, id);
  }

  @Post('runs/:id/cancel')
  @Permit('run.mutate')
  @HttpCode(HttpStatus.ACCEPTED)
  cancel(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RunDto> {
    return this.runs.cancel(context, id);
  }

  @Post('runs/:id/retry')
  @Permit('run.mutate')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<RunDto> {
    const run = await this.runs.retry(context, id);
    res.location(`/api/runs/${run.id}`);
    return run;
  }
}
