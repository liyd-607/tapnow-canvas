import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SmsService } from './sms.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly useMock = !process.env.ALIYUN_SMS_ACCESS_KEY_ID;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private smsService: SmsService,
  ) {}

  async sendCode(phone: string) {
    // Mock 模式下固定验证码为 123456，方便开发调试
    const code = this.useMock ? '123456' : this.generateCode();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.smsCode.create({
      data: {
        phone,
        code,
        expiresAt,
        tenantId: 'default', // 添加默认租户ID
      },
    });

    const sent = await this.smsService.sendCode(phone, code);
    if (!sent) {
      throw new BadRequestException('短信发送失败，请稍后重试');
    }

    if (this.useMock) {
      this.logger.log(`[MOCK] 验证码: ${code}（开发环境可直接使用）`);
    }

    return { success: true, expiresIn: 300 };
  }

  async login(phone: string, code: string) {
    const latest = await this.prisma.smsCode.findFirst({
      where: { phone, used: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      throw new BadRequestException('请先获取验证码');
    }

    if (latest.code !== code) {
      throw new BadRequestException('验证码错误');
    }

    if (new Date() > latest.expiresAt) {
      throw new BadRequestException('验证码已过期');
    }

    await this.prisma.smsCode.update({
      where: { id: latest.id },
      data: { used: true },
    });

    let user = await this.prisma.user.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' }
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          nickname: `用户${phone.slice(-4)}`,
          tapies: 100,
          tenantId: 'default', // 添加默认租户ID
        },
      });
      await this.prisma.creditTransaction.create({
        data: {
          userId: user.id,
          amount: 100,
          type: 'BONUS',
          balanceAfter: 100,
        },
      });
    }

    const payload = { sub: user.id, phone: user.phone, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        tapies: user.tapies,
        role: user.role,
      },
    };
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
