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

  /**
   * 全量保存画布图（支持乐观锁）
   *
   * body 兼容两种形态：
   *   { graph: { nodes, edges }, baseVersion: 3 }   ← 新版
   *   { nodes, edges }                                ← 旧版（无 baseVersion，跳过冲突检查）
   */
  @Put(':id/graph')
  updateGraph(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Query('baseVersion') baseVersionQuery?: string,
  ) {
    const isWrapped = body && typeof body === 'object' && body.graph && typeof body.graph === 'object';
    const graph = isWrapped ? body.graph : body;
    const baseVersionRaw =
      (isWrapped ? body.baseVersion : undefined) ??
      (baseVersionQuery !== undefined ? Number(baseVersionQuery) : undefined);
    const baseVersion =
      baseVersionRaw === undefined || baseVersionRaw === null || Number.isNaN(Number(baseVersionRaw))
        ? undefined
        : Number(baseVersionRaw);
    return this.canvasService.updateGraph(userId, id, graph, baseVersion);
  }

  /**
   * 提交增量变更集（对标即梦 submit_changeset）
   * POST /api/canvas/:id/changes  body: { baseVersion?, ops: [...] }
   */
  @Post(':id/changes')
  submitChanges(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() body: { baseVersion?: number; ops: any[] },
  ) {
    return this.canvasService.submitChanges(userId, id, body?.ops || [], body?.baseVersion);
  }

  /**
   * 拉取增量变更集（对标即梦 fetch_changeset）
   * GET /api/canvas/:id/changes?since=seq
   */
  @Get(':id/changes')
  getChanges(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Query('since') since = '0',
  ) {
    return this.canvasService.getChanges(userId, id, Number(since) || 0);
  }

  @Post(':id/nodes/:nodeId/generate')
  generateNode(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { clientRequestId?: string } = {},
  ) {
    return this.canvasService.generateNode(userId, id, nodeId, body?.clientRequestId);
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
