import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ModelController } from './model.controller';
import { ModelService } from './model.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule implements OnApplicationBootstrap {
  constructor(private modelService: ModelService) {}

  async onApplicationBootstrap() {
    // Seed default models when application starts
    await this.modelService.seedDefaultModels();
  }
}
