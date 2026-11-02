import {
  AICapabilities,
  BaseAIAdapter,
  GenerationParams,
  GenerationResult,
} from './base.adapter';

/**
 * Mock 音频生成适配器。
 *
 * 用于本地开发演示，生成一段静音的 WAV 音频作为占位。
 * 后续接入真实 TTS / 音乐生成模型时，替换为真实适配器即可。
 */
export class AudioMockAdapter extends BaseAIAdapter {
  readonly modelId = 'mock-audio';
  readonly modelName = 'Mock 音频生成';
  readonly creditCostPerImage = 5;
  readonly aliases = ['audio-mock', 'tts-mock'] as const;

  readonly capabilities: AICapabilities = {
    type: 'AUDIO',
    sizes: [],
    ratios: [],
    maxCount: 1,
    durations: [5, 10, 30],
    supportsReferences: false,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsTextToImage: true,
    description: '本地 mock 音频生成（开发演示用）',
  };

  async generate(params: GenerationParams): Promise<GenerationResult> {
    // 模拟生成延迟
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500));

    const count = params.count || 1;
    const urls: string[] = [];

    for (let i = 0; i < count; i++) {
      // 生成一段 2 秒的静音 WAV（8kHz, 8-bit, mono）
      const wav = this.generateSilentWav(2, 8000);
      urls.push(`data:audio/wav;base64,${wav}`);
    }

    return { success: true, urls };
  }

  /** 生成指定时长的静音 WAV base64 */
  private generateSilentWav(seconds: number, sampleRate: number): string {
    const numSamples = sampleRate * seconds;
    const dataSize = numSamples; // 8-bit mono
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt subchunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 1, true); // byte rate
    view.setUint16(32, 1, true); // block align
    view.setUint16(34, 8, true); // bits per sample

    // data subchunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // 静音数据（8-bit 中点 128）
    for (let i = 0; i < numSamples; i++) {
      view.setUint8(44 + i, 128);
    }

    // 转 base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}
