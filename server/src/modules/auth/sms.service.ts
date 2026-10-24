import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly useMock = !process.env.ALIYUN_SMS_ACCESS_KEY_ID;

  /**
   * 发送短信验证码
   * 开发环境未配置阿里云 Key 时，走 mock 流程，验证码固定为 123456
   */
  async sendCode(phone: string, code: string): Promise<boolean> {
    if (this.useMock) {
      this.logger.log(`[MOCK SMS] 发送验证码到 ${phone}: ${code}`);
      return true;
    }

    try {
      // TODO: 集成阿里云短信 SDK
      this.logger.warn('阿里云短信 SDK 暂未集成，走 mock 流程');
      this.logger.log(`[SMS] 发送验证码到 ${phone}: ${code}`);
      return true;
    } catch (e) {
      this.logger.error(`短信发送失败: ${(e as Error).message}`);
      return false;
    }
  }
}
