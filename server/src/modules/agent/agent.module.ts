import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentProcessor } from './agent.processor';
import { ShotPlannerService } from './shot-planner.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { CreditsModule } from '../credits/credits.module';
import { AGENT_QUEUE } from '../../common/queue/queue.service';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    CreditsModule,
    BullModule.registerQueue({ name: AGENT_QUEUE }),
  ],
  controllers: [AgentController],
  providers: [AgentService, AgentProcessor, ShotPlannerService],
  exports: [AgentService],
})
export class AgentModule {}
