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

export abstract class BaseAIAdapter {
  abstract readonly modelId: string;
  abstract readonly modelName: string;
  abstract readonly creditCostPerImage: number;
  /**
   * 同 adapter 也支持的别名 modelKey（如历史 DB 里用户手建的 key）
   */
  readonly aliases: readonly string[] = [];

  abstract generate(params: GenerationParams): Promise<GenerationResult>;

  getCreditCost(_params: GenerationParams): number {
    return this.creditCostPerImage * (_params.count || 1);
  }
}
