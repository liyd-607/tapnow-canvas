import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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
}
