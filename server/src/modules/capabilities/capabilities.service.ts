import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AICapabilities } from '../ai/adapters/base.adapter';

/** 能力配置版本号：前端可据此判断本地缓存是否过期 */
export const CAPABILITIES_VERSION = '2026.11.02';

export interface CapabilityModel {
  id: string;
  name: string;
  type: AICapabilities['type'];
  creditCost: number;
  enabled: boolean;
  capabilities: AICapabilities;
  /** 来自 AIModel.config 的自定义覆盖 */
  overrides?: Record<string, any>;
}

export interface CapabilityScene {
  type: AICapabilities['type'];
  defaultModel?: string;
  models: CapabilityModel[];
}

/**
 * 模型能力下发服务
 *
 * 对标即梦：
 *   - `video_generate/get_common_config`  → 下发模型参数配置
 *   - `capability/capsules`                → 下发能力胶囊（可用模型/参数集合）
 *   - `get_experiment_params`              → 下发实验参数
 *
 * 本实现把「adapter 静态能力声明」与「AIModel 表动态配置（启停 / 积分 / 名称）」合并，
 * 由服务端统一出口，前端不再硬编码模型与参数枚举。
 */
@Injectable()
export class CapabilitiesService {
  constructor(
    private aiService: AiService,
    private prisma: PrismaService,
  ) {}

  async getCapabilities() {
    const adapters = this.aiService.listModelCapabilities();

    // 数据库侧的模型配置（可能不存在，此时以 adapter 声明为准）
    let dbModels: Array<{
      modelKey: string;
      name: string;
      modelType: string;
      creditCost: number;
      enabled: boolean;
      config: unknown;
    }> = [];
    try {
      dbModels = (await this.prisma.aIModel.findMany()) as any;
    } catch {
      // 表不存在时降级为纯 adapter 能力
      dbModels = [];
    }
    const dbByKey = new Map(dbModels.map((m) => [m.modelKey, m]));

    const models: CapabilityModel[] = adapters.map((a) => {
      const db = dbByKey.get(a.id);
      const cfg = (db?.config || {}) as Record<string, any>;
      const cfgCaps = (cfg.capabilities || {}) as Partial<AICapabilities>;

      return {
        id: a.id,
        name: db?.name || a.name,
        type: a.capabilities.type,
        creditCost: db?.creditCost ?? a.creditCostPerImage,
        enabled: db ? db.enabled : true,
        capabilities: { ...a.capabilities, ...cfgCaps },
        overrides: Object.keys(cfg).length ? cfg : undefined,
      };
    });

    const byType = (type: AICapabilities['type']) => models.filter((m) => m.type === type);

    const scenes: Record<string, CapabilityScene> = {
      IMAGE: this.buildScene('IMAGE', byType('IMAGE')),
      VIDEO: this.buildScene('VIDEO', byType('VIDEO')),
      TEXT: this.buildScene('TEXT', byType('TEXT')),
      AUDIO: this.buildScene('AUDIO', byType('AUDIO')),
    };

    const defaultModel = this.aiService.defaultModelId;

    return {
      version: CAPABILITIES_VERSION,
      updatedAt: new Date().toISOString(),
      defaultModel,
      scenes,
      models,
    };
  }

  private buildScene(type: AICapabilities['type'], models: CapabilityModel[]): CapabilityScene {
    const enabled = models.filter((m) => m.enabled);
    const fallback = enabled[0] || models[0];
    return {
      type,
      defaultModel: fallback?.id,
      models: enabled.length ? enabled : models,
    };
  }
}
