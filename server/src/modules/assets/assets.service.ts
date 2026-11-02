import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CLASSIC_ASSETS, classicAssetUrl } from './classic-assets';

export interface CreateAssetDto {
  name: string;
  type: 'CHARACTER' | 'PRODUCT' | 'STYLE' | 'REFERENCE';
  url: string;
  thumbnail?: string;
  description?: string;
  tags?: string[];
}

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateAssetDto) {
    if (!dto.name?.trim() || !dto.url?.trim()) {
      throw new BadRequestException('资产名称和地址不能为空');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    return this.prisma.asset.create({
      data: {
        tenantId: user?.tenantId || 'default',
        userId,
        name: dto.name,
        type: dto.type,
        url: dto.url,
        thumbnail: dto.thumbnail,
        description: dto.description,
        tags: dto.tags || [],
      },
    });
  }

  async list(
    userId: string,
    options: { type?: string; keyword?: string } = {},
  ) {
    const where: any = { userId };
    if (options.type && options.type !== 'all') {
      where.type = options.type;
    }
    if (options.keyword?.trim()) {
      where.OR = [
        { name: { contains: options.keyword.trim(), mode: 'insensitive' } },
        { description: { contains: options.keyword.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.asset.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async detail(userId: string, id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.userId !== userId) {
      throw new NotFoundException('资产不存在');
    }
    return asset;
  }

  async update(userId: string, id: string, dto: Partial<CreateAssetDto>) {
    await this.detail(userId, id);
    return this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.thumbnail !== undefined ? { thumbnail: dto.thumbnail } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.detail(userId, id);
    await this.prisma.asset.delete({ where: { id } });
    return { success: true };
  }

  async incrementUsage(id: string) {
    return this.prisma.asset.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  }

  /**
   * 一键添加经典资产包（幂等）：按「用户 + 名称」去重，
   * 已存在的跳过，只补缺失的。
   */
  async seedClassics(userId: string) {
    const existing = await this.prisma.asset.findMany({
      where: { userId, name: { in: CLASSIC_ASSETS.map((a) => a.name) } },
      select: { name: true },
    });
    const have = new Set(existing.map((a) => a.name));

    const missing = CLASSIC_ASSETS.filter((a) => !have.has(a.name));
    if (missing.length > 0) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      await this.prisma.asset.createMany({
        data: missing.map((a) => {
          const url = classicAssetUrl(a.mediaKey);
          return {
            tenantId: user?.tenantId || 'default',
            userId,
            name: a.name,
            type: a.type,
            url,
            thumbnail: url,
            description: a.description,
            tags: a.tags,
          };
        }),
      });
    }

    return {
      created: missing.length,
      skipped: CLASSIC_ASSETS.length - missing.length,
      total: CLASSIC_ASSETS.length,
    };
  }
}
