import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkillsService, CreateSkillDto } from './skills.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.skillsService.list(category, type, Number(page), Number(pageSize));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.skillsService.detail(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateSkillDto) {
    return this.skillsService.create(userId, dto);
  }

  @Post('seed')
  seed() {
    return this.skillsService.seedOfficialSkills();
  }

  @Post(':id/execute')
  @UseGuards(JwtAuthGuard)
  execute(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { canvasId: string },
  ) {
    return this.skillsService.executeOnCanvas(userId, id, body.canvasId);
  }
}
