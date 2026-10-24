import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AIModel {
  id: string;
  name: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT';
  modelKey: string;
  creditCost: number;
  enabled: boolean;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Prisma 模型里字段叫 modelType (因为 type 是关键字)。
 * 前端 API 契约用 type,所以这里统一做映射。
 */
function toDto<T extends { modelType?: any }>(m: T): Omit<T, 'modelType'> & { type: string } {
  const { modelType, ...rest } = m as any;
  return { ...rest, type: modelType };
}

@Injectable()
export class ModelService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const models = await this.prisma.aIModel.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return models.map(toDto);
  }

  async getById(id: string) {
    const model = await this.prisma.aIModel.findUnique({ where: { id } });
    return model ? toDto(model) : null;
  }

  async create(data: {
    name: string;
    type: 'IMAGE' | 'VIDEO' | 'TEXT';
    modelKey: string;
    creditCost: number;
    enabled?: boolean;
    config?: Record<string, any>;
  }) {
    // 确保config是对象
    const config = data.config && typeof data.config === 'object'
      ? data.config
      : {};

    return this.prisma.aIModel.create({
      data: {
        name: data.name,
        modelType: data.type,
        modelKey: data.modelKey,
        creditCost: data.creditCost,
        enabled: data.enabled ?? true,
        config: config,
        tenantId: 'default', // 临时默认值，后续修复多租户
      },
    });
  }

  async update(id: string, data: {
    name?: string;
    creditCost?: number;
    enabled?: boolean;
    config?: Record<string, any>;
  }) {
    return this.prisma.aIModel.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    try {
      await this.prisma.aIModel.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      throw new NotFoundException('模型不存在');
    }
  }

  async toggleEnabled(id: string) {
    const model = await this.prisma.aIModel.findUnique({ where: { id } });
    if (!model) {
      throw new NotFoundException('模型不存在');
    }
    const updated = await this.prisma.aIModel.update({
      where: { id },
      data: { enabled: !model.enabled },
    });
    return toDto(updated);
  }

  async seedDefaultModels() {
    /**
     * 默认模型（已验证可真实生成）：
     *
     * 图片生成：
     *   - 万相 wan2.7-image（标准版）   [默认]
     *   - 万相 wan2.7-image-pro（专业版）
     *   - 千问 qwen-image-3.0-pro
     *   - MiniMax image-01
     *
     * 视频生成：
     *   - 万相 wan3.0-video
     *   - HappyHorse 1.1 文生/图生/参考生视频
     *   - MiniMax video-01
     */
    const defaults = [
      {
        name: '万相 wan2.7-image（标准版）',
        type: 'IMAGE' as const,
        modelKey: 'tokenplan-wan2.7',
        creditCost: 3,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          docs: 'https://www.alibabacloud.com/help/en/model-studio/token-plan-multimodal-gen',
          models: ['wan2.7-image'],
          requiresKey: true,
        },
      },
      {
        name: '万相 wan2.7-image-pro（专业版）',
        type: 'IMAGE' as const,
        modelKey: 'tokenplan-wan2.7-pro',
        creditCost: 5,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          models: ['wan2.7-image-pro'],
          requiresKey: true,
        },
      },
      {
        name: '千问 qwen-image-3.0-pro',
        type: 'IMAGE' as const,
        modelKey: 'tokenplan-qwen-image-3.0-pro',
        creditCost: 4,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          models: ['qwen-image-3.0-pro'],
          requiresKey: true,
        },
      },
      {
        name: 'MiniMax 图像（image-01）',
        type: 'IMAGE' as const,
        modelKey: 'minimax-image',
        creditCost: 5,
        config: {
          provider: 'minimax',
          authType: 'api_key',
          baseUrl: 'https://api.minimaxi.com/v1',
          docs: 'https://platform.minimaxi.com/document/Guides%20for%20accessing%20MiniMax%20OpenAPI',
          models: ['image-01'],
          requiresKey: true,
        },
      },
      {
        name: '万相 wan3.0-video',
        type: 'VIDEO' as const,
        modelKey: 'tokenplan-wan3.0-video',
        creditCost: 25,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          docs: 'https://docs.bailian.console.aliyun.com/zh/model-studio/wan3-video-generation-api-reference',
          models: ['wan3.0-video'],
          requiresKey: true,
        },
      },
      {
        name: 'HappyHorse 1.1 文生视频',
        type: 'VIDEO' as const,
        modelKey: 'tokenplan-happyhorse-t2v',
        creditCost: 20,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          models: ['happyhorse-1.1-t2v'],
          requiresKey: true,
        },
      },
      {
        name: 'HappyHorse 1.1 图生视频',
        type: 'VIDEO' as const,
        modelKey: 'tokenplan-happyhorse-i2v',
        creditCost: 22,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          models: ['happyhorse-1.1-i2v'],
          requiresKey: true,
        },
      },
      {
        name: 'HappyHorse 1.1 参考生视频',
        type: 'VIDEO' as const,
        modelKey: 'tokenplan-happyhorse-r2v',
        creditCost: 25,
        config: {
          provider: 'alibaba',
          authType: 'api_key',
          baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com',
          models: ['happyhorse-1.1-r2v'],
          requiresKey: true,
        },
      },
      {
        name: 'MiniMax 视频（video-01）',
        type: 'VIDEO' as const,
        modelKey: 'minimax-video',
        creditCost: 20,
        config: {
          provider: 'minimax',
          authType: 'api_key',
          baseUrl: 'https://api.minimaxi.com/v1',
          models: ['video-01'],
          requiresKey: true,
        },
      },
    ];

    for (const model of defaults) {
      const existing = await this.prisma.aIModel.findFirst({
        where: { modelKey: model.modelKey },
      });

      if (existing) {
        // 已存在则同步为最新配置
        await this.prisma.aIModel.update({
          where: { id: existing.id },
          data: {
            name: model.name,
            modelType: model.type,
            creditCost: model.creditCost,
            enabled: true,
            config: model.config,
          },
        });
      } else {
        await this.prisma.aIModel.create({
          data: {
            name: model.name,
            modelType: model.type,
            modelKey: model.modelKey,
            creditCost: model.creditCost,
            enabled: true,
            config: model.config,
            tenantId: 'default',
          },
        });
      }
    }

    // 删除默认列表之外、且属于 default 租户的模型（含历史杂模型与测试模型）
    await this.prisma.aIModel.deleteMany({
      where: {
        modelKey: { notIn: defaults.map((m) => m.modelKey) },
        OR: [{ tenantId: 'default' }, { tenantId: null }],
      },
    });

    return this.list();
  }
}
