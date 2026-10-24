import { Module, OnModuleInit } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule implements OnModuleInit {
  constructor(private skillsService: SkillsService) {}

  async onModuleInit() {
    try {
      await this.skillsService.seedOfficialSkills();
      console.log('[Skills] 官方技能已初始化');
    } catch (e) {
      console.warn('[Skills] 初始化官方技能失败（可能表未创建）', (e as Error).message);
    }
  }
}
