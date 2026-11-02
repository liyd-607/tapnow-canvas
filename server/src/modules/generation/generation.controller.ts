import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Query,
  Param,
} from '@nestjs/common';
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

  /**
   * 创建生成任务
   *
   * 支持 `clientRequestId` 幂等键：重复提交返回同一个任务（不会重复扣费 / 重复生成）。
   */
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

  /**
   * 对账：把「已入库但队列丢失」的任务重新入队（对标即梦 reconcileBySubmitId）
   */
  @Post('reconcile')
  @UseGuards(JwtAuthGuard)
  reconcile(@CurrentUser() user: any) {
    return this.generationService.reconcile(user.userId);
  }

  /**
   * 取消生成任务（对标即梦 cancel_generate）
   */
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.generationService.cancel(user.userId, id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  detail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.generationService.detail(user.userId, id);
  }
}
