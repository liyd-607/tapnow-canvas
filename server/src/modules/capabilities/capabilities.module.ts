import { Module } from '@nestjs/common';
import { CapabilitiesService } from './capabilities.service';
import { CapabilitiesController } from './capabilities.controller';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [AiModule, PrismaModule],
  controllers: [CapabilitiesController],
  providers: [CapabilitiesService],
  exports: [CapabilitiesService],
})
export class CapabilitiesModule {}
