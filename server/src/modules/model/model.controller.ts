import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { ModelService } from './model.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('models')
@UseGuards(JwtAuthGuard)
export class ModelController {
  constructor(private modelService: ModelService) {}

  @Get()
  list() {
    return this.modelService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.modelService.getById(id);
  }

  @Post()
  create(@Body() dto: {
    name: string;
    type: 'IMAGE' | 'VIDEO' | 'TEXT';
    modelKey: string;
    creditCost: number;
    enabled?: boolean;
    config?: Record<string, any>;
  }) {
    return this.modelService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: {
    name?: string;
    creditCost?: number;
    enabled?: boolean;
    config?: Record<string, any>;
  }) {
    return this.modelService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      return await this.modelService.remove(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { success: false, message: error.message };
      }
      return { success: false, message: '删除失败' };
    }
  }

  @Post(':id/toggle')
  async toggle(@Param('id') id: string) {
    try {
      return await this.modelService.toggleEnabled(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { success: false, message: error.message };
      }
      return { success: false, message: '切换状态失败' };
    }
  }

  @Post('seed')
  async seed() {
    // 不需要认证，直接创建所有模型
    return this.modelService.seedDefaultModels();
  }
}
