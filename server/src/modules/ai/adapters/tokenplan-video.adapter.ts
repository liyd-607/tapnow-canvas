import { Injectable, Logger } from '@nestjs/common';
import { BaseAIAdapter, GenerationParams, GenerationResult } from './base.adapter';

/**
 * 阿里百炼 Token Plan 视频生成适配器
 *
 * 所有视频模型共用同一个 video-synthesis 端点（异步），只是 model 参数不同。
 *   POST {ROOT}/api/v1/services/aigc/video-generation/video-synthesis
 *   GET  {ROOT}/api/v1/tasks/{task_id}
 *
 * 请求头必须带 X-DashScope-Async: enable
 *
 * 请求体：
 *   {
 *     "model": "<model-name>",
 *     "input": { "prompt": "...", "media": [...] },
 *     "parameters": { "resolution": "720P", "ratio": "16:9", "duration": 5 }
 *   }
 *
 * 创建任务返回 output.task_id，轮询至 SUCCEEDED 后从 output.video_url 或 results 中取视频 URL。
 */

abstract class TokenPlanVideoBaseAdapter extends BaseAIAdapter {
  abstract readonly apiModel: string;

  private readonly logger = new Logger('TokenPlanVideo');

  private readonly rootUrl =
    process.env.TOKENPLAN_ROOT_URL ||
    'https://token-plan.cn-beijing.maas.aliyuncs.com';
  private readonly apiKey = process.env.TOKENPLAN_API_KEY || '';

  // 视频为异步任务，轮询设置
  private readonly pollIntervalMs = 15000;
  private readonly maxWaitMs = 5 * 60 * 1000;

  private get submitEndpoint() {
    return `${this.rootUrl.replace(/\/$/, '')}/api/v1/services/aigc/video-generation/video-synthesis`;
  }

  private taskEndpoint(taskId: string) {
    return `${this.rootUrl.replace(/\/$/, '')}/api/v1/tasks/${taskId}`;
  }

  private get useMock() {
    return !this.apiKey;
  }

  async generate(params: GenerationParams): Promise<GenerationResult> {
    this.logger.log(
      `[${this.modelId}] 视频生成: prompt="${params.prompt}", size=${params.size || '1280x720'}, refs=${(params.references || []).length}`,
    );

    if (this.useMock) {
      return this.mockGenerate(params);
    }

    try {
      // 构造 media
      const media: Array<{ type: string; url: string }> = [];
      const refs = params.references || [];

      // 首帧图
      const firstFrame = refs.find((r) => r.role === 'firstFrame');
      if (firstFrame?.url) {
        media.push({ type: 'first_frame', url: firstFrame.url });
      }
      // 尾帧图
      const lastFrame = refs.find((r) => r.role === 'lastFrame');
      if (lastFrame?.url) {
        media.push({ type: 'last_frame', url: lastFrame.url });
      }
      // 通用参考图（非首尾帧）
      for (const ref of refs) {
        if (
          ref.role === 'image' ||
          ref.role === 'subject'
        ) {
          if (ref.url && ref !== firstFrame && ref !== lastFrame) {
            media.push({ type: 'reference_image', url: ref.url });
          }
        }
      }

      // 根据尺寸推断 resolution 和 ratio
      const { resolution, ratio } = this.inferVideoParams(params.size);

      const body: Record<string, any> = {
        model: this.apiModel,
        input: {
          prompt: params.prompt,
        },
        parameters: {
          resolution,
          ratio,
          duration: 5,
          prompt_extend: true,
        },
      };

      if (media.length > 0) {
        body.input.media = media;
      }
      if (params.negativePrompt) {
        body.input.negative_prompt = params.negativePrompt;
      }
      if (params.seed !== undefined) {
        body.parameters.seed = params.seed;
      }

      // 1. 提交任务
      const taskId = await this.submitTask(body);
      this.logger.log(`视频任务已提交 [${this.apiModel}]: ${taskId}`);

      // 2. 轮询
      const videoUrl = await this.pollTask(taskId);

      return { success: true, urls: [videoUrl] };
    } catch (e) {
      this.logger.error(`视频生成失败 [${this.apiModel}]: ${(e as Error).message}`);
      return { success: false, error: (e as Error).message };
    }
  }

  private inferVideoParams(size?: string): { resolution: string; ratio: string } {
    if (!size) {
      return { resolution: '720P', ratio: '16:9' };
    }
    const match = /^(\d+)\s*[x*X]\s*(\d+)$/.exec(size.trim());
    if (!match) {
      return { resolution: '720P', ratio: '16:9' };
    }
    const w = Number(match[1]);
    const h = Number(match[2]);

    // 推断分辨率档位（取短边最接近的档位）
    const shortSide = Math.min(w, h);
    let resolution = '480P';
    if (shortSide >= 1000) resolution = '1080P';
    else if (shortSide >= 700) resolution = '720P';

    // 推断宽高比
    const r = w / h;
    let ratio = '16:9';
    if (Math.abs(r - 1) < 0.05) ratio = '1:1';
    else if (r > 2) ratio = '21:9';
    else if (r > 1.4) ratio = '16:9';
    else if (r > 1.1) ratio = '4:3';
    else if (r > 0.85) ratio = '1:1';
    else if (r > 0.65) ratio = '3:4';
    else ratio = '9:16';

    return { resolution, ratio };
  }

  private async submitTask(body: Record<string, any>): Promise<string> {
    const res = await fetch(this.submitEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.message || data?.code || `HTTP ${res.status}`;
      this.logger.error(`提交视频任务失败: ${res.status} ${JSON.stringify(data)}`);
      throw new Error(`提交视频任务失败: ${msg}`);
    }

    const taskId: string | undefined = data?.output?.task_id;
    if (!taskId) {
      throw new Error('提交视频任务失败：未返回 task_id');
    }
    return taskId;
  }

  private async pollTask(taskId: string): Promise<string> {
    const start = Date.now();

    // 首次等待
    await this.sleep(5000);

    while (Date.now() - start < this.maxWaitMs) {
      const res = await fetch(this.taskEndpoint(taskId), {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      const data: any = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.message || data?.code || `HTTP ${res.status}`;
        throw new Error(`查询视频任务失败: ${msg}`);
      }

      const status: string = data?.output?.task_status || data?.task_status || '';

      if (status === 'SUCCEEDED') {
        // 结果可能在 output.video_url 或 output.results[*].video_url
        const output = data?.output || {};
        let url: string | undefined = output.video_url;
        if (!url && Array.isArray(output.results) && output.results.length > 0) {
          url = output.results[0]?.video_url || output.results[0]?.url;
        }
        if (!url && Array.isArray(output.video_urls) && output.video_urls.length > 0) {
          url = output.video_urls[0];
        }
        if (!url) {
          throw new Error('视频生成成功但未找到视频 URL');
        }
        return url;
      }

      if (status === 'FAILED' || status === 'CANCELED') {
        const msg =
          data?.output?.message ||
          data?.message ||
          data?.code ||
          `任务状态: ${status}`;
        throw new Error(`视频生成失败: ${msg}`);
      }

      // PENDING / RUNNING 继续等待
      this.logger.log(`视频任务状态 [${taskId}]: ${status}`);
      await this.sleep(this.pollIntervalMs);
    }

    throw new Error('视频生成超时');
  }

  private async mockGenerate(params: GenerationParams): Promise<GenerationResult> {
    this.logger.warn(`未配置 TOKENPLAN_API_KEY，[${this.modelId}] 使用 mock 模式`);
    await new Promise((r) => setTimeout(r, 2000));
    // 返回一个示例视频 URL（占位，非真实生成）
    return {
      success: true,
      urls: [
        'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/qigswt/wan-r2v-role2.mp4',
      ],
    };
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

/** 万相 wan3.0-video（标准版） */
@Injectable()
export class TokenPlanWan3VideoAdapter extends TokenPlanVideoBaseAdapter {
  readonly modelId = 'tokenplan-wan3.0-video';
  readonly modelName = '万相 wan3.0-video（标准版）';
  readonly apiModel = 'wan3.0-video';
  readonly creditCostPerImage = 25;
}

/** HappyHorse 1.1 文生视频 */
@Injectable()
export class TokenPlanHappyHorseT2VAdapter extends TokenPlanVideoBaseAdapter {
  readonly modelId = 'tokenplan-happyhorse-t2v';
  readonly modelName = 'HappyHorse 1.1 文生视频';
  readonly apiModel = 'happyhorse-1.1-t2v';
  readonly creditCostPerImage = 20;
}

/** HappyHorse 1.1 图生视频 */
@Injectable()
export class TokenPlanHappyHorseI2VAdapter extends TokenPlanVideoBaseAdapter {
  readonly modelId = 'tokenplan-happyhorse-i2v';
  readonly modelName = 'HappyHorse 1.1 图生视频';
  readonly apiModel = 'happyhorse-1.1-i2v';
  readonly creditCostPerImage = 22;
}

/** HappyHorse 1.1 参考生视频 */
@Injectable()
export class TokenPlanHappyHorseR2VAdapter extends TokenPlanVideoBaseAdapter {
  readonly modelId = 'tokenplan-happyhorse-r2v';
  readonly modelName = 'HappyHorse 1.1 参考生视频';
  readonly apiModel = 'happyhorse-1.1-r2v';
  readonly creditCostPerImage = 25;
}
