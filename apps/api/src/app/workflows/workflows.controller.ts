import type { TenantContext } from '@opsflow/contracts';
import { CurrentTenant } from '../../common/tenant/current-tenant';
import { Body, Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { Param, ParseUUIDPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { parseWorkflowListQuery } from '@opsflow/contracts';
import type { Page, RawQueryParams, WorkflowDto } from '@opsflow/contracts';
import { Permit, TenantGuard } from '../../common/tenant/tenant.guard';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(TenantGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(@CurrentTenant() context: TenantContext, @Query() query: RawQueryParams): Promise<Page<WorkflowDto>> {
    if (Object.values(query).some((value) => typeof value !== 'string')) {
      throw new BadRequestException('Query parameters must be single strings.');
    }
    return this.workflows.list(context, parseWorkflowListQuery(query));
  }

  @Get(':id')
  findOne(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<WorkflowDto> {
    return this.workflows.findById(context, id);
  }

  @Post()
  @Permit('workflow.write')
  async create(@CurrentTenant() context: TenantContext, @Body() body: CreateWorkflowDto, @Res({ passthrough: true }) res: Response): Promise<WorkflowDto> {
    const created = await this.workflows.create(context, body);

    res.location(`/api/workflows/${created.id}`);

    return created;
  }

  @Put(':id')
  @Permit('workflow.write')
  update(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateWorkflowDto): Promise<WorkflowDto> {
    return this.workflows.update(context, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permit('workflow.write')
  remove(@CurrentTenant() context: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.workflows.remove(context, id);
  }
}
