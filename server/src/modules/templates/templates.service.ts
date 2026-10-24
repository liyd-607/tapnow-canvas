import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category?: string;
  thumbnail?: string;
  graph: { nodes: any[]; edges: any[] };
  tags?: string[];
  isPublic?: boolean;
}

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  /** 从画布"另存为模板" */
  async createFromCanvas(
    userId: string,
    canvasId: string,
    dto: { name?: string; description?: string; category?: string; tags?: string[] },
  ) {
    const canvas = await this.prisma.canvas.findUnique({ where: { id: canvasId } });
    if (!canvas || canvas.userId !== userId) {
      throw new NotFoundException('画布不存在');
    }

    const settings = (canvas.settings || {}) as Record<string, any>;
    const graph = settings.graph;
    if (!graph || !Array.isArray(graph.nodes)) {
      throw new BadRequestException('该画布还没有可保存的节点');
    }

    // 缩略图取第一个有结果的节点
    const thumbnail =
      graph.nodes.find((n: any) => n.resultUrl)?.resultUrl || null;

    return this.prisma.template.create({
      data: {
        tenantId: canvas.tenantId || 'default',
        ownerId: userId,
        name: dto.name || canvas.name || '未命名模板',
        description: dto.description ?? canvas.description ?? '',
        category: dto.category || 'custom',
        thumbnail,
        graph,
        tags: dto.tags || [],
        isPublic: true,
      },
    });
  }

  async list(
    options: { category?: string; keyword?: string } = {},
  ) {
    const where: any = { isPublic: true };
    if (options.category && options.category !== 'all') {
      where.category = options.category;
    }
    if (options.keyword?.trim()) {
      where.OR = [
        { name: { contains: options.keyword.trim(), mode: 'insensitive' } },
        { description: { contains: options.keyword.trim(), mode: 'insensitive' } },
      ];
    }

    return this.prisma.template.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: 100,
    });
  }

  async detail(id: string) {
    const t = await this.prisma.template.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('模板不存在');
    return t;
  }

  /** 从模板新建画布：克隆图，节点状态重置为 idle、结果默认保留以便查看 */
  async instantiate(userId: string, templateId: string) {
    const template = await this.detail(templateId);
    const graph = JSON.parse(JSON.stringify(template.graph));

    // 保留已生成的图作为参考成品，但把状态标记为 idle 便于用户重新生成
    for (const node of graph.nodes || []) {
      node.status = node.resultUrl ? 'completed' : 'idle';
      node.error = null;
    }

    const canvas = await this.prisma.canvas.create({
      data: {
        tenantId: template.tenantId || 'default',
        userId,
        name: `${template.name}（副本）`,
        description: template.description,
        width: 1024,
        height: 1024,
        settings: { fromTemplateId: template.id, graph },
      },
    });

    await this.prisma.template.update({
      where: { id: templateId },
      data: { usageCount: { increment: 1 } },
    });

    return canvas;
  }

  async remove(userId: string, id: string) {
    const t = await this.detail(id);
    if (t.ownerId && t.ownerId !== userId) {
      throw new BadRequestException('只能删除自己的模板');
    }
    await this.prisma.template.delete({ where: { id } });
    return { success: true };
  }
}
