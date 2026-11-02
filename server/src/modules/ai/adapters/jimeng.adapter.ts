import { Injectable, Logger } from '@nestjs/common';
import {
  AICapabilities,
  BaseAIAdapter,
  GenerationParams,
  GenerationResult,
} from './base.adapter';

/**
 * 字节即梦（Jimeng）模型适配器
 * 
 * 开发环境：未配置火山引擎 Key 时走 mock，返回示例图片
 * 生产环境：调用火山引擎即梦 API（需自行对接签名）
 */
@Injectable()
export class JimengAdapter extends BaseAIAdapter {
  readonly modelId = 'jimeng-t2i';
  readonly modelName = '即梦（文生图）';
  readonly creditCostPerImage = 5;

  readonly capabilities: AICapabilities = {
    type: 'IMAGE',
    sizes: ['1024x1024', '1280x720', '720x1280'],
    ratios: ['1:1', '16:9', '9:16'],
    maxCount: 4,
    supportsReferences: true,
    supportsNegativePrompt: true,
    supportsSeed: false,
    supportsTextToImage: true,
    description: '即梦（文生图）',
  };

  private readonly logger = new Logger(JimengAdapter.name);
  private readonly useMock = !process.env.VOLCENGINE_ACCESS_KEY_ID;

  async generate(params: GenerationParams): Promise<GenerationResult> {
    this.logger.log(`即梦生成任务: prompt="${params.prompt}", count=${params.count || 1}`);

    if (this.useMock) {
      return this.mockGenerate(params);
    }

    try {
      // TODO: 调用火山引擎即梦 API
      // 参考文档: https://www.volcengine.com/docs/6791/1297538
      // 需要构建签名、发起 HTTP 请求、轮询结果
      return this.mockGenerate(params);
    } catch (e) {
      return {
        success: false,
        error: (e as Error).message,
      };
    }
  }

  /**
   * Mock 生成：返回占位图片，模拟生成延迟
   */
  private async mockGenerate(params: GenerationParams): Promise<GenerationResult> {
    const count = params.count || 1;
    const size = params.size || '1024x1024';
    const [w, h] = size.split('x').map(Number);

    // 模拟生成延迟 2-4 秒
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));

    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      // 使用 picsum 作为 mock 图片
      const seed = Math.floor(Math.random() * 10000);
      urls.push(`https://picsum.photos/seed/${seed}/${w}/${h}`);
    }

    return { success: true, urls };
  }
}
