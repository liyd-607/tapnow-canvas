import { Injectable, Logger } from '@nestjs/common';
import {
  AICapabilities,
  BaseAIAdapter,
  GenerationParams,
  GenerationResult,
} from './base.adapter';

/**
 * MiniMax（国内版）视频生成适配器
 *
 * 异步流程：
 *   1. POST /video_generation            -> { task_id }
 *   2. GET  /query/video_generation       -> Processing | Success(file_id) | Fail
 *   3. GET  /files/retrieve?file_id=      -> file.download_url
 *
 * 支持：
 *   - 文生视频：仅 prompt
 *   - 图生视频：references 中 role=firstFrame 的图片作为首帧（参数 first_frame_image）
 */
@Injectable()
export class MiniMaxVideoAdapter extends BaseAIAdapter {
  readonly modelId = 'minimax-video';
  readonly modelName = 'MiniMax 视频（video-01）';
  readonly creditCostPerImage = 20;

  readonly capabilities: AICapabilities = {
    type: 'VIDEO',
    sizes: ['1280x720', '720x1280', '1024x1024'],
    ratios: ['16:9', '9:16', '1:1'],
    maxCount: 1,
    durations: [6],
    supportsReferences: true,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsTextToImage: true,
    description: '文生视频 / 首帧图生视频',
  };

  private readonly logger = new Logger(MiniMaxVideoAdapter.name);

  private readonly baseUrl =
    process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
  private readonly apiKey = process.env.MINIMAX_API_KEY || '';
  private readonly videoModel = process.env.MINIMAX_VIDEO_MODEL || 'video-01';

  // 视频为异步任务，轮询设置
  private readonly pollIntervalMs = 5000;
  private readonly maxWaitMs = 5 * 60 * 1000;

  async generate(params: GenerationParams): Promise<GenerationResult> {
    this.logger.log(
      `MiniMax 视频生成: prompt="${params.prompt}", refs=${(params.references || []).length}`,
    );

    if (!this.apiKey) {
      return { success: false, error: '未配置 MINIMAX_API_KEY' };
    }

    try {
      const firstFrame = (params.references || []).find(
        (r) => r.role === 'firstFrame' || r.role === 'image',
      );

      const body: Record<string, any> = {
        model: this.videoModel,
        prompt: params.prompt,
      };
      if (firstFrame?.url) {
        body.first_frame_image = firstFrame.url;
      }

      // 1. 提交任务
      const submit = await fetch(`${this.baseUrl}/video_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const submitData: any = await submit.json();
      if (!submit.ok || submitData?.base_resp?.status_code !== 0) {
        throw new Error(
          submitData?.base_resp?.status_msg || `提交视频任务失败: HTTP ${submit.status}`,
        );
      }
      const taskId: string = submitData.task_id;
      this.logger.log(`视频任务已提交: ${taskId}`);

      // 2. 轮询
      const fileId = await this.pollTask(taskId);

      // 3. 取下载地址
      const downloadUrl = await this.retrieveFile(fileId);

      return { success: true, urls: [downloadUrl] };
    } catch (e) {
      this.logger.error(`视频生成失败: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  private async pollTask(taskId: string): Promise<string> {
    const start = Date.now();

    // 首次等待
    await this.sleep(3000);

    while (Date.now() - start < this.maxWaitMs) {
      const res = await fetch(
        `${this.baseUrl}/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } },
      );
      const data: any = await res.json();
      const status: string = data.status;

      if (status === 'Success') {
        return String(data.file_id);
      }
      if (status === 'Fail') {
        throw new Error(data.base_resp?.status_msg || '视频生成失败');
      }
      // Processing 继续
      await this.sleep(this.pollIntervalMs);
    }

    throw new Error('视频生成超时');
  }

  private async retrieveFile(fileId: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
    );
    const data: any = await res.json();
    const url = data?.file?.download_url;
    if (!url) {
      throw new Error('未获取到视频下载地址');
    }
    return url;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
