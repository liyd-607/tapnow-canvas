import { Controller, Get, Put, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../../common/guards/service-token.guard';
import { OrchestratorService, WriteNodeResultDto, LibtvBindingDto } from './orchestrator.service';

/**
 * 编排器接口（机器对机器）
 *
 * 与用户面接口（/canvas/*，JwtAuthGuard）物理隔离：
 *  - 认证：X-TapNow-Service-Token（服务端环境变量比对）
 *  - 授权：X-TapNow-User-Id（缺省回落 ORCHESTRATOR_USER_ID）
 *
 * 典型调用方：WorkBuddy 通过 LibTV MCP 生成后，把结果回写到这里。
 */
@Controller('orchestrator')
@UseGuards(ServiceTokenGuard)
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  /** 机器可读画布图（含 LibTV 绑定投影） */
  @Get('canvases/:canvasId/graph')
  getGraph(@Req() req: any, @Param('canvasId') canvasId: string) {
    return this.orchestratorService.getGraph(req.actingUserId, canvasId);
  }

  /** 写回单节点结果 / 状态（不整图覆盖，避免抹掉用户并发编辑） */
  @Post('canvases/:canvasId/nodes/:nodeId/result')
  writeResult(
    @Req() req: any,
    @Param('canvasId') canvasId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: WriteNodeResultDto,
  ) {
    return this.orchestratorService.writeNodeResult(
      req.actingUserId,
      canvasId,
      nodeId,
      dto,
    );
  }

  /** 写回 LibTV 绑定状态（projectId / nodeMap / revision / modelCatalog） */
  @Put('canvases/:canvasId/libtv-binding')
  writeBinding(
    @Req() req: any,
    @Param('canvasId') canvasId: string,
    @Body() dto: LibtvBindingDto,
  ) {
    return this.orchestratorService.writeBinding(req.actingUserId, canvasId, dto);
  }
}
