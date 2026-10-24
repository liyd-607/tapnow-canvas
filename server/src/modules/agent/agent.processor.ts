import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AgentService } from './agent.service';
import { ShotPlannerService, PlannedScript } from './shot-planner.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ResultPersistenceService } from '../../common/persistence/result-persistence.service';
import { AiService } from '../ai/ai.service';
import { CreditsService } from '../credits/credits.service';
import { AGENT_QUEUE } from '../../common/queue/queue.service';
import { randomUUID } from 'crypto';
import type { CanvasGraphNode } from '../canvas/canvas-graph.types';

const IMAGE_MODEL = process.env.AGENT_IMAGE_MODEL || 'minimax-image';

@Injectable()
@Processor(AGENT_QUEUE)
export class AgentProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentProcessor.name);

  constructor(
    private agentService: AgentService,
    private planner: ShotPlannerService,
    private prisma: PrismaService,
    private persistence: ResultPersistenceService,
    private aiService: AiService,
    private credits: CreditsService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { taskId, userId, vision } = job.data;

    try {
      // 1. 真实规划分镜
      await this.agentService.updateStatus(taskId, 'PLANNING', 12);
      const script: PlannedScript = await this.planner.plan(vision);
      await this.agentService.setScript(taskId, script as any);

      // 2. 创建一张画布，把分镜预布为图片节点（横向排列，暂无连线）
      const canvas = await this.prisma.canvas.create({
        data: {
          tenantId: 'default',
          userId,
          name: script.title || `Agent·${vision.slice(0, 12)}`,
          description: script.logline,
          width: 1024,
          height: 1024,
          settings: { agentTaskId: taskId, vision },
        },
      });

      const nodes: CanvasGraphNode[] = script.shots.map((shot, i) => ({
        id: `shot_${shot.id}`,
        type: 'image' as const,
        x: 80 + i * 380,
        y: 120,
        width: 340,
        height: 400,
        zIndex: i + 1,
        locked: false,
        visible: true,
        title: `${shot.scene}·${shot.title}`,
        gen: {
          model: IMAGE_MODEL,
          prompt: `${vision}。${shot.description}`,
          aspectRatio: '1024x1024',
          count: 1,
          subjectType: 'character' as const,
          shot,
        },
        status: 'idle',
        error: null,
        versions: [],
      }));

      const graph = { nodes, edges: [] };
      await this.prisma.canvas.update({
        where: { id: canvas.id },
        data: { settings: { agentTaskId: taskId, vision, graph } as any },
      });

      // 3. 逐镜真实出图
      const resultUrls: string[] = [];
      const total = nodes.length;

      for (let i = 0; i < total; i++) {
        const node = nodes[i];
        const nodeGen = node.gen!;
        const progress = 30 + Math.round(((i + 1) / total) * 65);
        await this.agentService.updateStatus(taskId, 'GENERATING', progress);

        const creditCost = this.aiService.getCreditCost(IMAGE_MODEL, {
          prompt: nodeGen.prompt,
          count: 1,
        });
        const balance = await this.credits.getBalance(userId);

        if (balance.balance < creditCost) {
          node.status = 'failed';
          node.error = `积分不足，当前 ${balance.balance}，需要 ${creditCost}`;
          this.logger.warn(`${node.id}: ${node.error}`);
          continue;
        }

        await this.credits.deduct(userId, creditCost, 'GENERATION', node.id);

        const result = await this.aiService.generate(IMAGE_MODEL, {
          prompt: nodeGen.prompt,
          size: '1024x1024',
          count: 1,
          references: [],
        });

        if (!result.success || !(result.urls || []).length) {
          await this.credits.add(userId, creditCost, 'REFUND', node.id);
          node.status = 'failed';
          continue;
        }

        // 转存
        const persisted = await this.persistence.persistBatch(result.urls!, { kind: 'image' });
        node.resultUrl = persisted[0];
        node.status = 'completed';
        node.versions.push({
          id: randomUUID(),
          resultUrl: persisted[0],
          prompt: nodeGen.prompt,
          model: IMAGE_MODEL,
          params: nodeGen,
          createdAt: new Date().toISOString(),
        });
        resultUrls.push(persisted[0]);
      }

      // 保存最终画布图
      await this.prisma.canvas.update({
        where: { id: canvas.id },
        data: { settings: { agentTaskId: taskId, vision, graph } as any },
      });

      // 记录分镜与完成
      await this.agentService.setShots(taskId, script.shots as any);
      await this.agentService.attachCanvas(taskId, canvas.id).catch(() => {});
      await this.agentService.complete(taskId, resultUrls);

      return { success: true, taskId, canvasId: canvas.id, resultUrls };
    } catch (error) {
      await this.agentService.fail(taskId, (error as Error).message);
      throw error;
    }
  }
}
