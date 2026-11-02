import { apiClient } from './client';

/**
 * 模型能力元数据（服务端下发）
 *
 * 对标即梦 `video_generate/get_common_config` / `capability/capsules`：
 * 尺寸、比例、数量上限等参数由服务端统一描述，前端不再硬编码枚举。
 */
export interface AICapabilities {
  type: 'IMAGE' | 'VIDEO' | 'TEXT' | 'AUDIO' | 'MULTIMODAL';
  sizes: string[];
  ratios: string[];
  maxCount: number;
  durations?: number[];
  supportsReferences?: boolean;
  supportsNegativePrompt?: boolean;
  supportsSeed?: boolean;
  supportsTextToImage?: boolean;
  description?: string;
}

export interface CapabilityModel {
  id: string;
  name: string;
  type: AICapabilities['type'];
  creditCost: number;
  enabled: boolean;
  capabilities: AICapabilities;
}

export interface CapabilityScene {
  type: AICapabilities['type'];
  defaultModel?: string;
  models: CapabilityModel[];
}

export interface CapabilitiesResponse {
  version: string;
  updatedAt: string;
  defaultModel: string;
  scenes: Record<string, CapabilityScene>;
  models: CapabilityModel[];
}

export const capabilitiesApi = {
  /** 获取服务端下发的模型能力配置 */
  get: (): Promise<CapabilitiesResponse> =>
    apiClient.get('/capabilities').then((r) => r.data),
};
