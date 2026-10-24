import { Injectable, Logger } from '@nestjs/common';

export interface PlannedShot {
  id: number;
  title: string;
  scene: string; // 景别
  description: string; // 画面描述（用于出图）
  camera: string; // 运镜
  duration: number; // 秒
}

export interface PlannedScript {
  title: string;
  logline: string;
  shots: PlannedShot[];
}

/**
 * 分镜规划服务：调用阿里 Token Plan 对话模型，
 * 把"创作愿景"扩写为结构化分镜脚本 JSON。
 */
@Injectable()
export class ShotPlannerService {
  private readonly logger = new Logger(ShotPlannerService.name);

  private readonly baseUrl =
    process.env.TOKENPLAN_BASE_URL ||
    'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
  private readonly apiKey = process.env.TOKENPLAN_API_KEY || '';
  private readonly model = process.env.AGENT_PLANNER_MODEL || 'qwen3.7-max';

  async plan(vision: string, maxShots = 4): Promise<PlannedScript> {
    if (!this.apiKey) throw new Error('未配置 TOKENPLAN_API_KEY，无法规划');

    const system = `你是一名专业广告/短片分镜导演。根据用户的创作愿景，设计一组可直接用于 AI 出图的分镜。
要求：
1. 只输出 JSON，不要任何解释或 Markdown 代码块。
2. JSON 结构严格为：
{"title":"标题","logline":"一句话故事","shots":[{"id":1,"title":"镜头名","scene":"景别(全景/中景/特写等)","description":"用于文生图的具体画面描述，包含主体、场景、光影、风格","camera":"运镜方式","duration":3}]}
3. 分镜 ${Math.max(2, maxShots - 1)}-${maxShots} 个，画面描述要具体、可视化，且主体与风格在各镜头间保持一致。`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: vision },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`规划模型调用失败: ${response.status} ${t}`);
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content || '';

    return this.parseScript(content);
  }

  private parseScript(content: string): PlannedScript {
    const jsonText = this.extractJson(content);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('规划结果不是有效 JSON');
    }

    const shots: PlannedShot[] = Array.isArray(parsed.shots)
      ? parsed.shots.map((s: any, i: number) => ({
          id: Number(s.id) || i + 1,
          title: String(s.title || `镜头 ${i + 1}`),
          scene: String(s.scene || '中景'),
          description: String(s.description || ''),
          camera: String(s.camera || '固定'),
          duration: Number(s.duration) || 3,
        }))
      : [];

    if (shots.length === 0) throw new Error('规划结果中没有分镜');

    return {
      title: String(parsed.title || '未命名创作'),
      logline: String(parsed.logline || ''),
      shots,
    };
  }

  /** 容错提取 JSON：去掉可能的代码块包裹，截取首个 { 到末个 } */
  private extractJson(text: string): string {
    let t = text.trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return t.slice(start, end + 1);
    }
    return t;
  }
}
