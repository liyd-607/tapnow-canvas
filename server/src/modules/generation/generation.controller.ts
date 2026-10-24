import { Controller, Post, Body, Get, UseGuards, Query, Param } from '@nestjs/common';
import { GenerationService, CreateGenerationDto } from './generation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('generations')
export class GenerationController {
  constructor(private generationService: GenerationService) {}

  @Get('models')
  @UseGuards(JwtAuthGuard)
  models() {
    return this.generationService.listModels();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: any, @Body() dto: CreateGenerationDto) {
    return this.generationService.create(user.userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  list(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.generationService.list(
      user.userId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  detail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.generationService.detail(user.userId, id);
  }
}
