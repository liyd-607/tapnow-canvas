import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';

export interface CreateAgentTaskDto {
  vision: string;
}

@Injectable()
export class AgentService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  async create(userId: string, dto: CreateAgentTaskDto) {
    if (!dto.vision?.trim()) {
      throw new BadRequestException('创作愿景不能为空');
    }

    const task = await this.prisma.agentTask.create({
      data: {
        userId,
        vision: dto.vision,
        status: 'PLANNING',
        progress: 0,
      },
    });

    // 入队执行 Agent 流程
    await this.queueService.agentQueue.add('execute', {
      taskId: task.id,
      userId,
      vision: dto.vision,
    });

    return task;
  }

  async list(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      this.prisma.agentTask.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.agentTask.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }

  async detail(userId: string, taskId: string) {
    const task = await this.prisma.agentTask.findUnique({
      where: { id: taskId },
    });
    if (!task || task.userId !== userId) {
      throw new NotFoundException('任务不存在');
    }
    return task;
  }

  async updateStatus(taskId: string, status: 'PLANNING' | 'WRITING_SCRIPT' | 'PREDICTING_SHOTS' | 'GENERATING' | 'COMPLETED' | 'FAILED', progress?: number) {
    return this.prisma.agentTask.update({
      where: { id: taskId },
      data: { status, progress: progress ?? undefined },
    });
  }

  async setScript(taskId: string, script: any) {
    return this.prisma.agentTask.update({
      where: { id: taskId },
      data: { script, status: 'PREDICTING_SHOTS', progress: 30 },
    });
  }

  async setShots(taskId: string, shots: any[]) {
    return this.prisma.agentTask.update({
      where: { id: taskId },
      data: { shots, status: 'GENERATING', progress: 60 },
    });
  }

  async complete(taskId: string, resultUrls: string[]) {
    return this.prisma.agentTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        resultUrls,
        completedAt: new Date(),
      },
    });
  }

  async fail(taskId: string, errorMsg: string) {
    return this.prisma.agentTask.update({
      where: { id: taskId },
      data: { status: 'FAILED', errorMsg, completedAt: new Date() },
    });
  }

  /** 关联生成的画布 id（存入 metadata） */
  async attachCanvas(taskId: string, canvasId: string) {
    const task = await this.prisma.agentTask.findUnique({ where: { id: taskId } });
    const metadata = (task?.metadata || {}) as Record<string, any>;
    return this.prisma.agentTask.update({
      where: { id: taskId },
      data: { metadata: { ...metadata, canvasId } },
    });
  }
}
