import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AiService } from '../ai/ai.service';
import { GenerationService } from './generation.service';
import { GenerationGateway } from '../../gateways/generation.gateway';
import { GENERATION_QUEUE } from '../../common/queue/queue.service';
import { ResultPersistenceService } from '../../common/persistence/result-persistence.service';

@Processor(GENERATION_QUEUE)
export class GenerationProcessor extends WorkerHost {
  constructor(
    private aiService: AiService,
    private generationService: GenerationService,
    private gateway: GenerationGateway,
    private persistence: ResultPersistenceService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    const { taskId, userId, model, prompt, params } = job.data;

    // 更新状态为处理中
    await this.generationService.updateProgress(taskId, 10);
    this.gateway.sendProgress(userId, taskId, 10);

    // 用一次性定时器平滑推进进度，生成结束/出错时统一清理，避免 interval 泄漏
    let progress = 10;
    const progressTimer = setInterval(async () => {
      try {
        progress = Math.min(90, progress + 10);
        await this.generationService.updateProgress(taskId, progress);
        this.gateway.sendProgress(userId, taskId, progress);
      } catch {
        // 进度推送失败不影响主流程
      }
    }, 2000);
    // 不阻止进程退出
    progressTimer.unref?.();

    try {
      // 调用真实 AI 模型生成
      const result = await this.aiService.generate(model, { prompt, ...params });

      if (!result.success) {
        throw new Error(result.error || '生成失败');
      }

      const rawUrls = result.urls || [];
      if (rawUrls.length === 0) {
        throw new Error('生成成功但未返回图片地址');
      }

      // 转存到自有存储，避免外部签名 URL（约 24h）过期
      const urls = await this.persistence.persistBatch(rawUrls, { kind: 'image' });

      await this.generationService.complete(taskId, urls);
      this.gateway.sendCompleted(userId, taskId, urls);

      await job.updateProgress(100);
      return { success: true, urls };
    } catch (error) {
      const msg = (error as Error).message;
      await this.generationService.fail(taskId, msg);
      this.gateway.sendFailed(userId, taskId, msg);
      throw error;
    } finally {
      clearInterval(progressTimer);
    }
  }
}
