import { Injectable, Logger } from '@nestjs/common';
import {
  AICapabilities,
  BaseAIAdapter,
  GenerationParams,
  GenerationResult,
} from './base.adapter';
import { sizeToAspectRatio } from './sizes';

/**
 * MiniMax（国内版，OpenAI 兼容风格）图片生成适配器
 *
 * 文档: https://platform.minimaxi.com/document/Guides%20for%20accessing%20MiniMax%20OpenAPI
 * Base URL: https://api.minimaxi.com/v1
 * Endpoint: POST /image_generation
 * 默认 model: image-01
 * 返回: { data: { image_urls: string[] }, base_resp: { status_code, status_msg } }
 *
 * 注意: 国内 key（sk-cp- 前缀）只能走 api.minimaxi.com；
 *       国际端点 api.minimax.io 会返回 2049 invalid api key。
 */
@Injectable()
export class MiniMaxImageAdapter extends BaseAIAdapter {
  readonly modelId = 'minimax-image';
  readonly modelName = 'MiniMax 图像（image-01）';
  readonly creditCostPerImage = 5;
  // 兼容历史数据库里用户手建的 "MiniMax-H3" 记录
  readonly aliases = ['MiniMax-H3'];

  readonly capabilities: AICapabilities = {
    type: 'IMAGE',
    sizes: ['1024x1024', '1280x720', '720x1280'],
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxCount: 4,
    supportsReferences: true,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsTextToImage: true,
    description: '支持主体参考（角色/商品一致）',
  };

  private readonly logger = new Logger(MiniMaxImageAdapter.name);

  private readonly baseUrl =
    process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
  private readonly apiKey = process.env.MINIMAX_API_KEY || '';
  private readonly imageModel = process.env.MINIMAX_IMAGE_MODEL || 'image-01';

  private get useMock() {
    return !this.apiKey || process.env.MINIMAX_FORCE_MOCK === 'true';
  }

  async generate(params: GenerationParams): Promise<GenerationResult> {
    const count = params.count || 1;
    this.logger.log(
      `MiniMax 图片生成: prompt="${params.prompt}", count=${count}, size=${params.size || '1024x1024'}, refs=${(params.references || []).length}`,
    );

    if (this.useMock) {
      return this.mockGenerate(params);
    }

    const aspectRatio = sizeToAspectRatio(params.size || '1024x1024');

    // 主体参考（角色/产品）+ 通用图参考：支持多张
    const subjectRefs = (params.references || []).filter((r) => r.role === 'subject' || r.role === 'image');

    // image_generation 单次只稳定返回 1 张，多张时并发调用。
    const results = await Promise.all(
      Array.from({ length: count }, () =>
        this.callOnce(params.prompt, aspectRatio, params.negativePrompt, subjectRefs, params.subjectType),
      ),
    );

    const urls = results.filter((u): u is string => Boolean(u));
    if (urls.length === 0) {
      return {
        success: false,
        error: 'MiniMax 未返回任何图片，请检查密钥、端点或稍后重试',
      };
    }

    return { success: true, urls };
  }

  private async callOnce(
    prompt: string,
    aspectRatio: string,
    negativePrompt?: string,
    subjectRefs?: Array<{ url: string }>,
    subjectType?: 'character' | 'product',
  ): Promise<string | null> {
    try {
      const fullPrompt = negativePrompt ? `${prompt}` : prompt;

      const body: Record<string, any> = {
        model: this.imageModel,
        prompt: fullPrompt,
        aspect_ratio: aspectRatio,
      };

      if (negativePrompt) {
        body.negative_prompt = negativePrompt;
      }

      if (subjectRefs && subjectRefs.length > 0) {
        body.subject_reference = subjectRefs
          .filter((r) => r.url)
          .map((r) => ({
            type: subjectType || 'character',
            image_file: r.url,
          }));
      }

      const response = await fetch(`${this.baseUrl}/image_generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data: any = await response.json().catch(() => null);

      // 国内版业务错误也可能返回 HTTP 200，需要看 base_resp.status_code
      const statusCode = data?.base_resp?.status_code;
      if (!response.ok || (typeof statusCode === 'number' && statusCode !== 0)) {
        const msg =
          data?.base_resp?.status_msg ||
          data?.message ||
          `HTTP ${response.status}`;
        this.logger.error(`MiniMax API 错误: ${response.status} ${JSON.stringify(data)}`);
        throw new Error(`MiniMax 调用失败: ${msg}`);
      }

      const url: string | undefined = data?.data?.image_urls?.[0];
      if (!url) {
        throw new Error('MiniMax 返回中缺少 data.image_urls[0]');
      }
      return url;
    } catch (e) {
      this.logger.error(`MiniMax 单次生成失败: ${(e as Error).message}`);
      return null;
    }
  }

  private async mockGenerate(params: GenerationParams): Promise<GenerationResult> {
    const count = params.count || 1;
    const size = params.size || '1024x1024';
    const [w, h] = size.split('x').map(Number);

    if (process.env.MINIMAX_FORCE_MOCK === 'true') {
      this.logger.warn('MINIMAX_FORCE_MOCK=true，临时走 mock 模式（非真实生成）');
    } else {
      this.logger.warn('未配置 MINIMAX_API_KEY，使用 mock 模式（非真实生成）');
    }

    await new Promise((r) => setTimeout(r, 1000));

    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(Math.random() * 100000);
      urls.push(`https://picsum.photos/seed/${seed}/${w || 1024}/${h || 1024}`);
    }

    return { success: true, urls };
  }
}

/**
 * MiniMax 文本/对话适配器（OpenAI 兼容 chat completions）
 *
 * 当前默认模型列表中不启用（图片生成优先），保留实现以便后续扩展。
 */
@Injectable()
export class MiniMaxTextAdapter extends BaseAIAdapter {
  readonly modelId = 'minimax-text';
  readonly modelName = 'MiniMax 对话';
  readonly creditCostPerImage = 2;

  private readonly logger = new Logger(MiniMaxTextAdapter.name);

  private readonly baseUrl =
    process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1';
  private readonly apiKey = process.env.MINIMAX_API_KEY || '';
  private readonly textModel = process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M2';

  readonly capabilities: AICapabilities = {
    type: 'TEXT',
    sizes: [],
    ratios: [],
    maxCount: 1,
    supportsReferences: false,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsTextToImage: false,
    description: '文本对话模型',
  };

  private get useMock() {
    return !this.apiKey;
  }

  async generate(params: GenerationParams): Promise<GenerationResult> {
    this.logger.log(`MiniMax 对话: prompt="${params.prompt}"`);
    if (this.useMock) {
      return { success: true, urls: [`[mock] ${params.prompt}`] };
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.textModel,
          messages: [{ role: 'user', content: params.prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 调用失败 (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      return { success: true, urls: [text] };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
}
