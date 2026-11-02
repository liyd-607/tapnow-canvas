import { Injectable } from '@nestjs/common';
import { CanvasService } from '../canvas/canvas.service';
import {
  CanvasLibtvBinding,
  CanvasNodeLibtv,
  CanvasNodeVersion,
} from '../canvas/canvas-graph.types';

export interface WriteNodeResultDto {
  status?: 'idle' | 'generating' | 'completed' | 'failed';
  resultUrl?: string | null;
  versions?: CanvasNodeVersion[];
  libtv?: CanvasNodeLibtv;
  /** 乐观锁基线（画布图版本号）；不传则跳过版本校验 */
  baseVersion?: number;
}

export interface LibtvBindingDto extends Partial<CanvasLibtvBinding> {}

/**
 * 编排器服务（供外部 Agent 通过服务令牌驱动本平台）
 *
 * 职责边界：只做「读图 / 单节点回写 / 绑定状态」三件事，
 * 自身不含任何 LibTV 相关代码 —— LibTV 调用全部发生在 WorkBuddy 侧。
 */
@Injectable()
export class OrchestratorService {
  constructor(private readonly canvasService: CanvasService) {}

  getGraph(userId: string, canvasId: string) {
    return this.canvasService.getGraphWithBinding(userId, canvasId);
  }

  writeNodeResult(
    userId: string,
    canvasId: string,
    nodeId: string,
    dto: WriteNodeResultDto,
  ) {
    return this.canvasService.writeNodeResult(userId, canvasId, nodeId, dto);
  }

  writeBinding(userId: string, canvasId: string, dto: LibtvBindingDto) {
    return this.canvasService.updateLibtvBinding(userId, canvasId, dto);
  }
}
