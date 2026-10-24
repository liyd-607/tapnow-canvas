import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
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

/**
 * Token Plan 所有已接入模型（同类型共享适配器基类，子类仅配置 model 名）：
 *
 * 图片生成（multimodal-generation 端点）：
 *   - tokenplan-wan2.7        万相 wan2.7-image（标准版）  [默认]
 *   - tokenplan-wan2.7-pro    万相 wan2.7-image-pro（专业版）
 *   - tokenplan-qwen-image-3.0-pro  千问 qwen-image-3.0-pro
 *
 * 视频生成（video-synthesis 异步端点）：
 *   - tokenplan-wan3.0-video       万相 wan3.0-video
 *   - tokenplan-happyhorse-t2v     HappyHorse 1.1 文生视频
 *   - tokenplan-happyhorse-i2v     HappyHorse 1.1 图生视频
 *   - tokenplan-happyhorse-r2v     HappyHorse 1.1 参考生视频
 *
 * 其他已验证模型：
 *   - MiniMax 图像（image-01）
 *   - MiniMax 视频（video-01）
 *   - Mock 音频（本地开发演示用）
 *
 * 字节即梦（JimengAdapter）等暂不注册；文件保留以便后续接入。
 */
@Module({
  providers: [
    AiService,
    // MiniMax
    MiniMaxImageAdapter,
    MiniMaxVideoAdapter,
    // Token Plan 图片
    TokenPlanWan27Adapter,
    TokenPlanWan27ProAdapter,
    TokenPlanQwenImage3ProAdapter,
    // Token Plan 视频
    TokenPlanWan3VideoAdapter,
    TokenPlanHappyHorseT2VAdapter,
    TokenPlanHappyHorseI2VAdapter,
    TokenPlanHappyHorseR2VAdapter,
    // Mock
    AudioMockAdapter,
  ],
  exports: [AiService],
})
export class AiModule {}
