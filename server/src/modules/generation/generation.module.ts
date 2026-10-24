import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GenerationService } from './generation.service';
import { GenerationController } from './generation.controller';
import { GenerationProcessor } from './generation.processor';
import { CreditsModule } from '../credits/credits.module';
import { AiModule } from '../ai/ai.module';
import { GENERATION_QUEUE } from '../../common/queue/queue.service';
import { GenerationGatewayModule } from '../../gateways/generation-gateway.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: GENERATION_QUEUE }),
    CreditsModule,
    AiModule,
    GenerationGatewayModule,
  ],
  providers: [GenerationService, GenerationProcessor],
  controllers: [GenerationController],
  exports: [GenerationService],
})
export class GenerationModule {}
