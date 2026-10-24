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
import { CanvasService, CreateCanvasDto, UpdateCanvasDto } from './canvas.service';
import { AssetsService } from '../assets/assets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('canvas')
@UseGuards(JwtAuthGuard)
export class CanvasController {
  constructor(
    private readonly canvasService: CanvasService,
    private readonly assetsService: AssetsService,
  ) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateCanvasDto) {
    return this.canvasService.create(userId, dto);
  }

  @Get()
  list(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.canvasService.list(userId, Number(page), Number(pageSize));
  }

  @Get(':id')
  detail(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.canvasService.detail(userId, id);
  }

  @Put(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCanvasDto,
  ) {
    return this.canvasService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.canvasService.remove(userId, id);
  }

  @Put(':id/layers')
  updateLayers(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body('layers') layers: any[],
  ) {
    return this.canvasService.updateLayers(userId, id, layers);
  }

  @Put(':id/settings')
  updateSettings(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() settings: Record<string, any>,
  ) {
    return this.canvasService.updateSettings(userId, id, settings);
  }

  // ---------- 统一画布图模型 ----------

  @Get(':id/graph')
  getGraph(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.canvasService.getGraph(userId, id);
  }

  @Put(':id/graph')
  updateGraph(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() graph: any,
  ) {
    return this.canvasService.updateGraph(userId, id, graph);
  }

  @Post(':id/nodes/:nodeId/generate')
  generateNode(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.canvasService.generateNode(userId, id, nodeId);
  }

  @Post(':id/nodes/:nodeId/attach-asset')
  attachAsset(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { assetId: string },
  ) {
    return this.assetsService
      .detail(userId, body.assetId)
      .then((asset) =>
        this.canvasService.attachAsset(userId, id, nodeId, {
          id: asset.id,
          url: asset.url,
          type: asset.type,
          name: asset.name,
        }),
      );
  }

  @Post(':id/run')
  runGraph(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { nodeIds?: string[]; force?: boolean } = {},
  ) {
    return this.canvasService.runGraph(userId, id, body.nodeIds, { force: body.force });
  }
}
