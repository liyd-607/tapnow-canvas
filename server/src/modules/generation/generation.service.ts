import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { AiService } from '../ai/ai.service';
import { QueueService } from '../../common/queue/queue.service';

/**
 * 生成阶段（真实阶段，而非假进度）
 *
 * 对标即梦 `aigc_draft/generate` 的任务流转：
 *   QUEUED（已入库/待调度） → DISPATCHING（已取到队列） → GENERATING（模型生成中）
 *   → PERSISTING（结果转存自有存储） → COMPLETED / FAILED / CANCELLED
 */
export const GENERATION_STAGES = {
  QUEUED: 'QUEUED',
  DISPATCHING: 'DISPATCHING',
  GENERATING: 'GENERATING',
  PERSISTING: 'PERSISTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export interface CreateGenerationDto {
  model: string;
  prompt: string;
  size?: string;
  style?: string;
  count?: number;
  /**
   * 客户端幂等键（对标即梦 generate_id）。
   * 同一用户重复提交相同 clientRequestId 时，直接复用已有任务，
   * 不重复扣费、不重复生成（解决「断网重试 / 用户连点」）。
   */
  clientRequestId?: string;
  /** 链路追踪号（对标即梦 logid）；不传则由服务端生成 */
  traceId?: string;
}

/** 取消任务时抛出的错误，Processor 据此区分「取消」与「失败」 */
export class GenerationCancelledError extends Error {
  constructor(message = '任务已取消') {
    super(message);
    this.name = 'GenerationCancelledError';
  }
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private prisma: PrismaService,
    private creditsService: CreditsService,
    private aiService: AiService,
    private queueService: QueueService,
  ) {}

  /**
   * 创建生成任务：幂等校验 -> 能力校验 -> 积分校验 -> 扣减 -> 入库 -> 入队
   */
  async create(userId: string, dto: CreateGenerationDto) {
    if (!dto.prompt || !dto.prompt.trim()) {
      throw new BadRequestException('提示词不能为空');
    }

    const clientRequestId = dto.clientRequestId?.trim() || undefined;
    const traceId = dto.traceId?.trim() || randomUUID();

    // ---------- 1. 幂等：命中已有任务则直接返回，不重复扣费 / 不重复生成 ----------
    if (clientRequestId) {
      const existing = await this.prisma.generationTask.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId } },
      });
      if (existing) {
        this.logger.log(
          `[${traceId}] 幂等命中，复用任务 ${existing.id}（clientRequestId=${clientRequestId}）`,
        );
        return { ...existing, idempotent: true };
      }
    }

    // ---------- 2. 能力校验（服务端下发口径，前端不再硬编码） ----------
    const caps = this.aiService.getModelCapabilities(dto.model);
    if (!caps) {
      throw new BadRequestException(`不支持的模型: ${dto.model}`);
    }
    const count = dto.count || 1;
    if (count < 1 || count > (caps.capabilities.maxCount || 4)) {
      throw new BadRequestException(
        `生成数量必须在 1-${caps.capabilities.maxCount || 4} 之间`,
      );
    }

    const params = {
      size: dto.size || caps.capabilities.sizes?.[0] || '1024x1024',
      style: dto.style || 'general',
      count,
    };

    const creditCost = this.aiService.getCreditCost(dto.model, { prompt: dto.prompt, ...params });

    // ---------- 3. 积分校验 ----------
    const balance = await this.creditsService.getBalance(userId);
    if (balance.balance < creditCost) {
      throw new BadRequestException(`积分不足，当前 ${balance.balance}，需要 ${creditCost}`);
    }

    // ---------- 4. 任务类型由模型能力决定（IMAGE / VIDEO / TEXT） ----------
    const type =
      caps.capabilities.type === 'VIDEO'
        ? 'VIDEO'
        : caps.capabilities.type === 'TEXT'
          ? 'TEXT'
          : 'IMAGE';

    // ---------- 5. 入库（唯一约束兜底并发重复提交） ----------
    let task;
    try {
      task = await this.prisma.generationTask.create({
        data: {
          userId,
          type: type as any,
          model: dto.model,
          prompt: dto.prompt,
          params,
          status: 'PENDING',
          stage: GENERATION_STAGES.QUEUED,
          creditCost,
          clientRequestId,
          traceId,
          metadata: { requestId: traceId, clientRequestId: clientRequestId ?? null },
        },
      });
    } catch (err: any) {
      // 并发下同一 clientRequestId 只允许一个任务落库
      if (err?.code === 'P2002' && clientRequestId) {
        const existing = await this.prisma.generationTask.findUnique({
          where: { userId_clientRequestId: { userId, clientRequestId } },
        });
        if (existing) return { ...existing, idempotent: true };
      }
      throw err;
    }

    // ---------- 6. 扣减积分 ----------
    await this.creditsService.deduct(userId, creditCost, 'GENERATION', task.id);

    // ---------- 7. 入队（jobId 与 taskId 一致，便于取消时精确移除） ----------
    await this.enqueue(task.id, userId, dto.model, dto.prompt, params, traceId);

    return task;
  }

  /**
   * 入队（幂等：jobId = taskId，重复入队不会产生第二个任务）
   */
  async enqueue(
    taskId: string,
    userId: string,
    model: string,
    prompt: string,
    params: Record<string, any>,
    traceId?: string,
  ) {
    await this.queueService.generationQueue.add(
      'generate',
      { taskId, userId, model, prompt, params, traceId },
      { jobId: taskId, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
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
      throw new NotFoundException('任务不存在');
    }
    return task;
  }

  /**
   * 取消任务（对标即梦 cancel_generate）
   *
   * - 尚未被 worker 取走：直接从队列移除并立即置为 CANCELLED
   * - 已在生成中：置 cancelRequested，Processor 在安全点检测后中止
   */
  async cancel(userId: string, taskId: string) {
    const task = await this.detail(userId, taskId);

    if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') {
      return { ...task, cancelRequested: task.cancelRequested };
    }

    await this.prisma.generationTask.update({
      where: { id: taskId },
      data: { cancelRequested: true },
    });

    // 排队中：尝试从队列移除
    let removed = false;
    try {
      const job = await this.queueService.generationQueue.getJob(taskId);
      if (job) {
        await job.remove();
        removed = true;
      }
    } catch (e) {
      this.logger.warn(`[${task.traceId || taskId}] 移除队列任务失败：${(e as Error).message}`);
    }

    // 移除成功（说明还没被 worker 取走）→ 立即取消并退积分
    if (removed && task.status === 'PENDING') {
      await this.prisma.generationTask.update({
        where: { id: taskId },
        data: {
          status: 'CANCELLED',
          stage: GENERATION_STAGES.CANCELLED,
          completedAt: new Date(),
          errorMsg: '任务已被用户取消',
        },
      });
      await this.creditsService.add(task.userId, task.creditCost, 'REFUND', task.id);
    }

    return this.prisma.generationTask.findUnique({ where: { id: taskId } });
  }

  /** 是否已被请求取消 */
  async isCancelRequested(taskId: string): Promise<boolean> {
    const task = await this.prisma.generationTask.findUnique({
      where: { id: taskId },
      select: { cancelRequested: true },
    });
    return !!task?.cancelRequested;
  }

  /**
   * 对账（对标即梦 reconcileBySubmitId）
   *
   * 扫描「已入库但队列里没有对应 job」的僵尸任务并重新入队，
   * 解决 worker 崩溃 / Redis 重启导致任务丢失的问题。
   */
  async reconcile(userId?: string) {
    const stale = await this.prisma.generationTask.findMany({
      where: {
        ...(userId ? { userId } : {}),
        status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const requeued: string[] = [];
    for (const task of stale) {
      try {
        const job = await this.queueService.generationQueue.getJob(task.id);
        if (job) continue; // 队列中仍有任务，无需处理
        if (task.status === 'PROCESSING') continue; // 正在执行中，不重复入队
        const params = (task.params || {}) as Record<string, any>;
        await this.enqueue(
          task.id,
          task.userId,
          task.model,
          task.prompt,
          params,
          task.traceId || undefined,
        );
        requeued.push(task.id);
      } catch (e) {
        this.logger.warn(`对账失败 ${task.id}: ${(e as Error).message}`);
      }
    }
    return { scanned: stale.length, requeued };
  }

  async updateProgress(taskId: string, progress: number) {
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: { status: 'PROCESSING', progress },
    });
  }

  /**
   * 推进真实阶段
   */
  async updateStage(
    taskId: string,
    stage: string,
    progress?: number,
    extra?: { status?: any; errorMsg?: string },
  ) {
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: {
        stage,
        ...(progress !== undefined ? { progress } : {}),
        // 进入 DISPATCHING 即视为已被 worker 接手
        ...(stage === GENERATION_STAGES.DISPATCHING
          ? { status: 'PROCESSING', startedAt: new Date() }
          : {}),
        ...(extra?.status ? { status: extra.status } : {}),
        ...(extra?.errorMsg !== undefined ? { errorMsg: extra.errorMsg } : {}),
      },
    });
  }

  async complete(taskId: string, resultUrls: string[]) {
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        stage: GENERATION_STAGES.COMPLETED,
        progress: 100,
        resultUrls,
        completedAt: new Date(),
      },
    });
  }

  async fail(taskId: string, errorMsg: string) {
    // 失败时返还积分
    const task = await this.prisma.generationTask.findUnique({ where: { id: taskId } });
    if (task && task.status !== 'COMPLETED' && task.status !== 'CANCELLED') {
      await this.creditsService.add(task.userId, task.creditCost, 'REFUND', task.id);
    }
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        stage: GENERATION_STAGES.FAILED,
        errorMsg,
        completedAt: new Date(),
      },
    });
  }

  /** 取消完成：置 CANCELLED 并退积分 */
  async cancelled(taskId: string, reason = '任务已取消') {
    const task = await this.prisma.generationTask.findUnique({ where: { id: taskId } });
    if (task && task.status !== 'COMPLETED' && task.status !== 'CANCELLED') {
      await this.creditsService.add(task.userId, task.creditCost, 'REFUND', task.id);
    }
    return this.prisma.generationTask.update({
      where: { id: taskId },
      data: {
        status: 'CANCELLED',
        stage: GENERATION_STAGES.CANCELLED,
        errorMsg: reason,
        completedAt: new Date(),
      },
    });
  }

  listModels() {
    return this.aiService.listModels();
  }
}
