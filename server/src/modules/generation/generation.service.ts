import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { AiService } from '../ai/ai.service';
import { QueueService } from '../../common/queue/queue.service';

export interface CreateGenerationDto {
  model: string;
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
}

@Injectable()
export class GenerationService {
  constructor(
    private prisma: PrismaService,
    private creditsService: CreditsService,
    private aiService: AiService,
    private queueService: QueueService,
  ) {}

  /**
   * 创建生成任务：校验积分 -> 扣减 -> 入库 -> 入队
   */
  async create(userId: string, dto: CreateGenerationDto) {
    const count = dto.count || 1;
    if (count < 1 || count > 4) {
      throw new BadRequestException('生成数量必须在 1-4 之间');
    }
    if (!dto.prompt.trim()) {
      throw new BadRequestException('提示词不能为空');
    }

    const params = {
      size: dto.size || '1024x1024',
      style: dto.style || 'general',
      count,
    };

    const creditCost = this.aiService.getCreditCost(dto.model, { prompt: dto.prompt, ...params });

    // 检查积分
    const balance = await this.creditsService.getBalance(userId);
    if (balance.balance < creditCost) {
      throw new BadRequestException(`积分不足，当前 ${balance.balance}，需要 ${creditCost}`);
    }

    // 创建任务记录
    const task = await this.prisma.generationTask.create({
      data: {
        userId,
        type: 'IMAGE',
        model: dto.model,
        prompt: dto.prompt,
        params,
        status: 'PENDING',
        creditCost,
      },
    });

    // 扣减积分
    await this.creditsService.deduct(userId, creditCost, 'GENERATION', task.id);

    // 入队
    await this.queueService.generationQueue.add('generate', {
      taskId: task.id,
      userId,
      model: dto.model,
      prompt: dto.prompt,
      params,
    });

    return task;
  }

  async list(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      this.prisma.generationTask.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.generationTask.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }

  async detail(userId: string, taskId: string) {
    const task = await this.prisma.generationTask.findUnique({
      where: { id: taskId },
    });
    if (!task || task.userId !== userId) {
      throw new BadRequestException('任务不存在');
    }
    return task;
  }

  async updateProgress(taskId: string, progress: number) {
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'PROCESSING', progress },
    });
  }

  async complete(taskId: string, resultUrls: string[]) {
    return this.prisma.generationTask.update({
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
    // 失败时返还积分
    const task = await this.prisma.generationTask.findUnique({ where: { id: taskId } });
    if (task && task.status !== 'COMPLETED') {
      await this.creditsService.add(task.userId, task.creditCost, 'REFUND', task.id);
    }
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'FAILED', errorMsg, completedAt: new Date() },
    });
  }

  listModels() {
    return this.aiService.listModels();
  }
}
