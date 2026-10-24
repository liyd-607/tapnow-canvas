import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get()
  list(@Query('category') category?: string, @Query('keyword') keyword?: string) {
    return this.templatesService.list({ category, keyword });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.templatesService.detail(id);
  }

  @Post(':id/instantiate')
  @UseGuards(JwtAuthGuard)
  instantiate(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.templatesService.instantiate(userId, id);
  }

  @Post('from-canvas/:canvasId')
  @UseGuards(JwtAuthGuard)
  createFromCanvas(
    @CurrentUser('userId') userId: string,
    @Param('canvasId') canvasId: string,
    @Body() body: { name?: string; description?: string; category?: string; tags?: string[] },
  ) {
    return this.templatesService.createFromCanvas(userId, canvasId, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.templatesService.remove(userId, id);
  }
}
