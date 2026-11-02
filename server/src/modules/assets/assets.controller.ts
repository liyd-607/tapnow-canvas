import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AssetsService, CreateAssetDto } from './assets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private assetsService: AssetsService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateAssetDto) {
    return this.assetsService.create(userId, dto);
  }

  @Post('seed-classics')
  seedClassics(@CurrentUser('userId') userId: string) {
    return this.assetsService.seedClassics(userId);
  }

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.assetsService.list(userId, { type, keyword });
  }

  @Get(':id')
  detail(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.assetsService.detail(userId, id);
  }

  @Put(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateAssetDto>,
  ) {
    return this.assetsService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.assetsService.remove(userId, id);
  }
}
