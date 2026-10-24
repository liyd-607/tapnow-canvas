import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 积分服务（已禁用积分限制）
 *
 * 为了让所有已接入模型直接可用，积分扣减逻辑已跳过：
 *   - getBalance 永远返回一个极大数（999999），保证所有"余额校验"都通过
 *   - deduct / add 不再操作数据库，仅记录日志级别为空
 *
 * 数据库中的 tapies 字段、creditTransaction 表、以及调用方的
 * 积分校验代码均保留不变，方便未来重新启用积分。
 */
@Injectable()
export class CreditsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 查询余额 —— 始终返回 999999，绕过所有积分不足校验。
   */
  async getBalance(_userId: string) {
    return { balance: 999999 };
  }

  async getTransactions(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.creditTransaction.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }

  /**
   * 扣减积分 —— 已禁用，仅返回一个大数，不操作数据库。
   */
  async deduct(_userId: string, _amount: number, _type: string, _taskId?: string) {
    return 999999;
  }

  /**
   * 增加积分 —— 已禁用，仅返回一个大数，不操作数据库。
   */
  async add(_userId: string, _amount: number, _type: string, _taskId?: string) {
    return 999999;
  }
}
