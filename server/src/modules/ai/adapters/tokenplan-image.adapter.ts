import { Injectable, Logger } from '@nestjs/common';
import {
  AICapabilities,
  BaseAIAdapter,
  GenerationParams,
  GenerationResult,
} from './base.adapter';
import { sizeToWanSize } from './sizes';

/**
 * 阿里百炼 Token Plan 图片生成适配器
 *
 * 所有图片模型共用同一个 multimodal-generation 端点，只是 model 参数不同。
 *   POST {ROOT}/api/v1/services/aigc/multimodal-generation/generation
 *
 * 请求体（messages 格式）：
 *   {
 *     "model": "<model-name>",
 *     "input": { "messages": [{ "role":"user", "content":[{"text":"..."}] }] },
 *     "parameters": { "size": "1024*1024" }
 *   }
 *
 * 返回图片在：output.choices[*].message.content[*].image
 *
 * 每种模型一个子类，共享同一个底层实现（apiModel 不同）。
 */

abstract class TokenPlanImageBaseAdapter extends BaseAIAdapter {
  abstract readonly apiModel: string;

  private readonly logger = new Logger('TokenPlanImage');

  private readonly rootUrl =
    process.env.TOKENPLAN_ROOT_URL ||
    'https://token-plan.cn-beijing.maas.aliyuncs.com';
  private readonly apiKey = process.env.TOKENPLAN_API_KEY || '';

  private get endpoint() {
    return `${this.rootUrl.replace(/\/$/, '')}/api/v1/services/aigc/multimodal-generation/generation`;
  }

  private get useMock() {
    return !this.apiKey;
  }

  async generate(params: GenerationParams): Promise<GenerationResult> {
    const count = params.count || 1;
    this.logger.log(
      `[${this.modelId}] 图片生成: prompt="${params.prompt}", count=${count}, size=${params.size || '1024x1024'}, refs=${(params.references || []).length}`,
    );

    if (this.useMock) {
      return this.mockGenerate(params);
    }

    const wanSize = sizeToWanSize(params.size || '1024x1024');

    // 取所有参考图（主体/通用），支持多张参考图
    const refs = (params.references || []).filter(
      (r) => r.role === 'subject' || r.role === 'image',
    );

    // 该端点单次返回 1 张，多张时并发调用。
    // 用 allSettled 保留供应商真实报错，不退化成「请检查密钥」这类无信息量的提示。
    const settled = await Promise.allSettled(
      Array.from({ length: count }, () =>
        this.callOnce(params.prompt, wanSize, params.negativePrompt, refs),
      ),
    );

    const urls: string[] = [];
    const errors: string[] = [];
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) urls.push(s.value);
      else if (s.status === 'rejected') errors.push(String((s.reason as Error)?.message ?? s.reason));
    }

    if (urls.length === 0) {
      return { success: false, error: this.describeFailure(errors) };
    }

    return { success: true, urls };
  }

  /** 把供应商原始报错翻译成可执行的建议（别再把「额度用尽」说成「密钥有问题」） */
  private describeFailure(errors: string[]): string {
    const raw = errors.filter(Boolean);
    if (raw.length === 0) {
      return `${this.modelName} 未返回任何图片，请检查密钥、模型权限或稍后重试`;
    }
    const short = raw[0];
    const joined = raw.join(' / ');

    if (/url error|please check url/i.test(short)) {
      return `${this.modelName} 端点或请求格式被拒（${joined}）。当前走的是百炼 multimodal-generation 端点，请核对 TOKENPLAN_ROOT_URL 是否为 https://token-plan.<region>.maas.aliyuncs.com（不要带 /compatible-mode/v1）。`;
    }
    if (/额度|quota|insufficient|arrears|欠费|已过期/i.test(short)) {
      return `${this.modelName} 额度不足（${joined}）。请到百炼控制台确认该模型已开通并有可用额度。`;
    }
    if (/api.?key|Unauthorized|鉴权|401/i.test(short)) {
      return `${this.modelName} 密钥无效（${joined}）。请核对 TOKENPLAN_API_KEY。`;
    }
    if (/model|权限|not found|不存在/i.test(short)) {
      return `${this.modelName} 模型不可用（${joined}）。请确认账号已开通 ${this.apiModel} 的调用权限。`;
    }
    return `${this.modelName} 调用失败：${joined}`;
  }

  private async callOnce(
    prompt: string,
    size: string,
    negativePrompt?: string,
    refs?: Array<{ url: string }>,
  ): Promise<string | null> {
    try {
      const text = negativePrompt ? `${prompt}\n避免：${negativePrompt}` : prompt;
      const content: any[] = [];
      // 添加所有参考图
      if (refs && refs.length > 0) {
        for (const ref of refs) {
          if (ref.url) {
            content.push({ image: ref.url });
          }
        }
      }
      content.push({ text });

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.apiModel,
          input: {
            messages: [{ role: 'user', content }],
          },
          parameters: {
            size,
          },
        }),
      });

      const data: any = await response.json().catch(() => null);

      if (!response.ok) {
        // 百炼的错误体是 { error: { message, code } }，也兼容顶层 message/code
        const msg =
          data?.error?.message ||
          data?.message ||
          data?.code ||
          `HTTP ${response.status}`;
        this.logger.error(
          `TokenPlan API 错误 [${this.apiModel}]: ${response.status} ${JSON.stringify(data)}`,
        );
        throw new Error(`阿里通义调用失败: ${msg}`);
      }

      const contents: any[] = data?.output?.choices?.[0]?.message?.content || [];
      const imageItem = contents.find((c) => c.image);
      const url: string | undefined = imageItem?.image;

      if (!url) {
        throw new Error('TokenPlan 返回中缺少 output.choices[0].message.content[*].image');
      }
      return url;
    } catch (e) {
      this.logger.error(`TokenPlan 单次生成失败: ${(e as Error).message}`);
      return null;
    }
  }

  private async mockGenerate(params: GenerationParams): Promise<GenerationResult> {
    const count = params.count || 1;
    const size = params.size || '1024x1024';
    const [w, h] = size.split('x').map(Number);

    this.logger.warn(`未配置 TOKENPLAN_API_KEY，[${this.modelId}] 使用 mock 模式`);

    await new Promise((r) => setTimeout(r, 1000));

    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(Math.random() * 100000);
      urls.push(`https://picsum.photos/seed/${seed}/${w || 1024}/${h || 1024}`);
    }

    return { success: true, urls };
  }
}

/** 万相 wan2.7-image（标准版） */
@Injectable()
export class TokenPlanWan27Adapter extends TokenPlanImageBaseAdapter {
  readonly modelId = 'tokenplan-wan2.7';
  readonly modelName = '万相 wan2.7-image（标准版）';
  readonly apiModel = 'wan2.7-image';
  readonly creditCostPerImage = 3;
  readonly aliases = ['tokenplan-image', 'wan2.7-image'];

  readonly capabilities: AICapabilities = {
    type: 'IMAGE',
    sizes: ['1024x1024', '1280x720', '720x1280'],
    ratios: ['1:1', '16:9', '9:16'],
    maxCount: 4,
    supportsReferences: true,
    supportsNegativePrompt: true,
    supportsSeed: false,
    supportsTextToImage: true,
    description: '通用文生图，支持主体/参考图输入',
  };
}

/** 万相 wan2.7-image-pro（专业版） */
@Injectable()
export class TokenPlanWan27ProAdapter extends TokenPlanImageBaseAdapter {
  readonly modelId = 'tokenplan-wan2.7-pro';
  readonly modelName = '万相 wan2.7-image-pro（专业版）';
  readonly apiModel = 'wan2.7-image-pro';
  readonly creditCostPerImage = 5;

  readonly capabilities: AICapabilities = {
    type: 'IMAGE',
    sizes: ['1024x1024', '1280x720', '720x1280'],
    ratios: ['1:1', '16:9', '9:16'],
    maxCount: 4,
    supportsReferences: true,
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsTextToImage: true,
    description: '专业版，细节与构图更佳，支持参考图与种子',
  };
}

/** 千问 qwen-image-3.0-pro */
@Injectable()
export class TokenPlanQwenImage3ProAdapter extends TokenPlanImageBaseAdapter {
  readonly modelId = 'tokenplan-qwen-image-3.0-pro';
  readonly modelName = '千问 qwen-image-3.0-pro';
  readonly apiModel = 'qwen-image-3.0-pro';
  readonly creditCostPerImage = 4;

  readonly capabilities: AICapabilities = {
    type: 'IMAGE',
    sizes: ['1024x1024', '1280x720', '720x1280', '1664*928', '928*1664'],
    ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    maxCount: 4,
    supportsReferences: true,
    supportsNegativePrompt: true,
    supportsSeed: false,
    supportsTextToImage: true,
    description: '文字渲染能力突出，适合海报/标题图',
  };
}
