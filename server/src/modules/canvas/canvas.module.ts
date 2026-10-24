import { Module } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { CreditsModule } from '../credits/credits.module';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [PrismaModule, AiModule, CreditsModule, AssetsModule],
  controllers: [CanvasController],
  providers: [CanvasService],
  exports: [CanvasService],
})
export class CanvasModule {}
