import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import {
  GenerationService,
  GENERATION_STAGES,
  GenerationCancelledError,
} from './generation.service';
import { GenerationGateway } from '../../gateways/generation.gateway';
import { GENERATION_QUEUE } from '../../common/queue/queue.service';
import { ResultPersistenceService } from '../../common/persistence/result-persistence.service';

/**
 * 生成任务处理器
 *
 * 相对旧实现的关键变化（对标即梦）：
 *   1. 去掉 setInterval 假进度定时器 —— 进度只在真实阶段切换时推进
 *   2. 阶段真实可观测：QUEUED → DISPATCHING → GENERATING → PERSISTING → COMPLETED
 *   3. 支持取消：生成过程中轮询 cancelRequested，命中即中止并退积分
 *   4. 全链路带 traceId（对标即梦 logid），HTTP → 队列 → WebSocket 一致
 */
@Processor(GENERATION_QUEUE)
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private aiService: AiService,
    private generationService: GenerationService,
    private gateway: GenerationGateway,
    private persistence: ResultPersistenceService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { taskId, userId, model, prompt, params, traceId } = job.data;

    // ---------- 已被取消：直接结束 ----------
    if (await this.generationService.isCancelRequested(taskId)) {
      await this.generationService.cancelled(taskId, '任务在开始前被取消');
      this.gateway.sendCancelled(userId, taskId, '任务在开始前被取消', traceId);
      return { success: false, cancelled: true };
    }

    try {
      // ---------- 1. DISPATCHING：已被 worker 接手 ----------
      await this.generationService.updateStage(taskId, GENERATION_STAGES.DISPATCHING, 5);
      this.gateway.sendStage(userId, taskId, GENERATION_STAGES.DISPATCHING, 5, traceId);

      // ---------- 2. GENERATING：调用真实模型 ----------
      await this.generationService.updateStage(taskId, GENERATION_STAGES.GENERATING, 20);
      this.gateway.sendStage(userId, taskId, GENERATION_STAGES.GENERATING, 20, traceId);

      let cancelFlag = false;
      const cancelWatcher = setInterval(async () => {
        try {
          if (await this.generationService.isCancelRequested(taskId)) {
            cancelFlag = true;
          }
        } catch {
          // 轮询失败不影响生成
        }
      }, 2000);
      cancelWatcher.unref?.();

      let result;
      try {
        result = await this.aiService.generate(model, { prompt, ...params });
      } finally {
        clearInterval(cancelWatcher);
      }

      // 生成过程中被取消 → 中止，不落库结果
      if (cancelFlag || (await this.generationService.isCancelRequested(taskId))) {
        await this.generationService.cancelled(taskId, '任务在生成过程中被取消');
        this.gateway.sendCancelled(userId, taskId, '任务在生成过程中被取消', traceId);
        return { success: false, cancelled: true };
      }

      if (!result.success) {
        throw new Error(result.error || '生成失败');
      }

      const rawUrls = result.urls || [];
      if (rawUrls.length === 0) {
        throw new Error('生成成功但未返回图片地址');
      }

      // ---------- 3. PERSISTING：转存到自有存储，避免外部签名 URL（约 24h）过期 ----------
      await this.generationService.updateStage(taskId, GENERATION_STAGES.PERSISTING, 80);
      this.gateway.sendStage(userId, taskId, GENERATION_STAGES.PERSISTING, 80, traceId);

      const urls = await this.persistence.persistBatch(rawUrls, { kind: 'image' });

      // ---------- 4. COMPLETED ----------
      await this.generationService.complete(taskId, urls);
      this.gateway.sendCompleted(userId, taskId, urls, traceId);

      await job.updateProgress(100);
      return { success: true, urls };
    } catch (error) {
      if (error instanceof GenerationCancelledError) {
        await this.generationService.cancelled(taskId, error.message);
        this.gateway.sendCancelled(userId, taskId, error.message, traceId);
        return { success: false, cancelled: true };
      }
      const msg = (error as Error).message;
      this.logger.error(`[${traceId || taskId}] 生成失败：${msg}`);
      await this.generationService.fail(taskId, msg);
      this.gateway.sendFailed(userId, taskId, msg, traceId);
      throw error;
    }
  }
}
