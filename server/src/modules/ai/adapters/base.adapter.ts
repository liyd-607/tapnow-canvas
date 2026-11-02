export interface AIReference {
  /** 参考资源地址（http/https）；本机 /media 地址需可被模型访问 */
  url: string;
  /** 用途：subject(主体/角色) | image(通用图) | firstFrame(首帧) | lastFrame(尾帧) */
  role: 'subject' | 'image' | 'firstFrame' | 'lastFrame';
}

export interface GenerationParams {
  prompt: string;
  negativePrompt?: string;
  size?: string;
  style?: string;
  count?: number;
  seed?: number;
  /** 主体类型（MiniMax subject_reference） */
  subjectType?: 'character' | 'product';
  /** 参考图列表 */
  references?: AIReference[];
  /** 参考强度等高级参数 */
  referenceStrength?: number;
  [key: string]: any;
}

export interface GenerationResult {
  success: boolean;
  urls?: string[];
  error?: string;
}

/** 模型能力类型（与 Prisma ModelType 对齐） */
export type AICapabilityType = 'IMAGE' | 'VIDEO' | 'TEXT' | 'AUDIO' | 'MULTIMODAL';

/**
 * 模型能力元数据
 *
 * 对标即梦 `video_generate/get_common_config`、`capability/capsules`：
 * 模型的可选尺寸 / 比例 / 数量 / 时长等参数由服务端下发，
 * 前端不再硬编码枚举，模型接入方只需在 adapter 上声明能力。
 */
export interface AICapabilities {
  /** 能力大类 */
  type: AICapabilityType;
  /** 支持的尺寸（WxH） */
  sizes: string[];
  /** 支持的宽高比 */
  ratios: string[];
  /** 单次最大出图/出片数量 */
  maxCount: number;
  /** 视频时长档位（秒），仅 VIDEO 有效 */
  durations?: number[];
  /** 是否支持参考图（主体/首帧/尾帧） */
  supportsReferences?: boolean;
  /** 是否支持负面提示词 */
  supportsNegativePrompt?: boolean;
  /** 是否支持随机种子 */
  supportsSeed?: boolean;
  /** 是否为文生（仅提示词即可生成） */
  supportsTextToImage?: boolean;
  /** 备注说明 */
  description?: string;
}

/** 默认能力：图片、方形、1 张、无参考图 */
export const DEFAULT_IMAGE_CAPABILITIES: AICapabilities = {
  type: 'IMAGE',
  sizes: ['1024x1024', '1280x720', '720x1280'],
  ratios: ['1:1', '16:9', '9:16'],
  maxCount: 4,
  supportsReferences: false,
  supportsNegativePrompt: false,
  supportsSeed: false,
  supportsTextToImage: true,
};

/** 默认能力：视频、16:9、1 条、5s */
export const DEFAULT_VIDEO_CAPABILITIES: AICapabilities = {
  type: 'VIDEO',
  sizes: ['1280x720', '720x1280', '1024x1024'],
  ratios: ['16:9', '9:16', '1:1'],
  maxCount: 1,
  durations: [5, 10],
  supportsReferences: true,
  supportsNegativePrompt: false,
  supportsSeed: false,
  supportsTextToImage: true,
};

export abstract class BaseAIAdapter {
  abstract readonly modelId: string;
  abstract readonly modelName: string;
  abstract readonly creditCostPerImage: number;
  /**
   * 同 adapter 也支持的别名 modelKey（如历史 DB 里用户手建的 key）
   */
  readonly aliases: readonly string[] = [];
  /**
   * 能力元数据：由服务端统一下发给前端（对标即梦 get_common_config）
   */
  readonly capabilities: AICapabilities = DEFAULT_IMAGE_CAPABILITIES;

  abstract generate(params: GenerationParams): Promise<GenerationResult>;

  getCreditCost(_params: GenerationParams): number {
    return this.creditCostPerImage * (_params.count || 1);
  }
}
