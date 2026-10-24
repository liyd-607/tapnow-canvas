import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { MiniMaxImageAdapter } from './adapters/minimax.adapter';
import { MiniMaxVideoAdapter } from './adapters/minimax-video.adapter';
import { AudioMockAdapter } from './adapters/audio-mock.adapter';
import {
  TokenPlanWan27Adapter,
  TokenPlanWan27ProAdapter,
  TokenPlanQwenImage3ProAdapter,
} from './adapters/tokenplan-image.adapter';
import {
  TokenPlanWan3VideoAdapter,
  TokenPlanHappyHorseT2VAdapter,
  TokenPlanHappyHorseI2VAdapter,
  TokenPlanHappyHorseR2VAdapter,
} from './adapters/tokenplan-video.adapter';
import { BaseAIAdapter, GenerationParams } from './adapters/base.adapter';

/**
 * AI 模型注册中心。
 *
 * 当前已接入并验证的模型（图片 / 视频）：
 *
 * 图片生成：
 *   1. 万相 wan2.7-image（标准版）  —— 默认模型
 *   2. 万相 wan2.7-image-pro（专业版）
 *   3. 千问 qwen-image-3.0-pro
 *   4. MiniMax image-01
 *
 * 视频生成：
 *   1. 万相 wan3.0-video
 *   2. HappyHorse 1.1 文生视频 / 图生视频 / 参考生视频
 *   3. MiniMax video-01
 *
 * 文本/语音类模型暂不在主路径上，后续按需接入。
 */
@Injectable()
export class AiService implements OnModuleInit {
  private adapters = new Map<string, BaseAIAdapter>();

  /** 默认模型 id（前端未指定/首个选项使用） */
  readonly defaultModelId = 'tokenplan-wan2.7';

  constructor(
    private miniMaxImage: MiniMaxImageAdapter,
    private miniMaxVideo: MiniMaxVideoAdapter,
    private tokenPlanWan27: TokenPlanWan27Adapter,
    private tokenPlanWan27Pro: TokenPlanWan27ProAdapter,
    private tokenPlanQwenImage3Pro: TokenPlanQwenImage3ProAdapter,
    private tokenPlanWan3Video: TokenPlanWan3VideoAdapter,
    private tokenPlanHappyHorseT2V: TokenPlanHappyHorseT2VAdapter,
    private tokenPlanHappyHorseI2V: TokenPlanHappyHorseI2VAdapter,
    private tokenPlanHappyHorseR2V: TokenPlanHappyHorseR2VAdapter,
    private audioMock: AudioMockAdapter,
  ) {}

  onModuleInit() {
    // 图片
    this.register(this.tokenPlanWan27);
    this.register(this.tokenPlanWan27Pro);
    this.register(this.tokenPlanQwenImage3Pro);
    this.register(this.miniMaxImage);
    // 视频
    this.register(this.tokenPlanWan3Video);
    this.register(this.tokenPlanHappyHorseT2V);
    this.register(this.tokenPlanHappyHorseI2V);
    this.register(this.tokenPlanHappyHorseR2V);
    this.register(this.miniMaxVideo);
    // 其他
    this.register(this.audioMock);
  }

  register(adapter: BaseAIAdapter) {
    this.adapters.set(adapter.modelId, adapter);
    for (const alias of adapter.aliases ?? []) {
      this.adapters.set(alias, adapter);
    }
  }

  getAdapter(modelId: string): BaseAIAdapter {
    const adapter = this.adapters.get(modelId);
    if (!adapter) {
      throw new BadRequestException(`不支持的模型: ${modelId}`);
    }
    return adapter;
  }

  listModels() {
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; creditCostPerImage: number }> = [];
    for (const a of this.adapters.values()) {
      if (seen.has(a.modelId)) continue;
      seen.add(a.modelId);
      out.push({
        id: a.modelId,
        name: a.modelName,
        creditCostPerImage: a.creditCostPerImage,
      });
    }

    // 保证默认模型排在第一位
    return out.sort((a, b) => {
      if (a.id === this.defaultModelId) return -1;
      if (b.id === this.defaultModelId) return 1;
      return 0;
    });
  }

  async generate(modelId: string, params: GenerationParams) {
    const adapter = this.getAdapter(modelId);
    return adapter.generate(params);
  }

  getCreditCost(modelId: string, params: GenerationParams): number {
    const adapter = this.getAdapter(modelId);
    return adapter.getCreditCost(params);
  }
}
