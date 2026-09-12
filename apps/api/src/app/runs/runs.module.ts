import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { RuntimeClientService } from '../runtime-client.service';

@Module({
  controllers: [RunsController],
  providers: [RunsService, RuntimeClientService],
  exports: [RuntimeClientService, RunsService],
})
export class RunsModule {}
