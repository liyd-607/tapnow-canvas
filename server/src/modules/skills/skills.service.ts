import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface CreateSkillDto {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  type: string;
  config?: Record<string, any>;
  thumbnail?: string;
  isPublic?: boolean;
}

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  async list(
    category?: string,
    type?: string,
    page = 1,
    pageSize = 20,
  ) {
    const where: any = { isPublic: true };
    if (category) where.category = category;
    if (type) where.type = type;

    const skip = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        orderBy: { usageCount: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.skill.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async detail(skillId: string) {
    const skill = await this.prisma.skill.findUnique({
      where: { id: skillId },
    });
    if (!skill) throw new NotFoundException('技能不存在');
    return skill;
  }

  async create(userId: string, dto: CreateSkillDto) {
    const slug =
      dto.slug ||
      dto.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
    return this.prisma.skill.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        category: (dto.category as 'OFFICIAL' | 'CUSTOM' | 'MARKETPLACE') || 'CUSTOM',
        type: dto.type as 'IMAGE' | 'VIDEO' | 'WORKFLOW',
        tenantId: 'default', // 添加默认租户ID
        config: dto.config || {},
        thumbnail: dto.thumbnail,
        isPublic: dto.isPublic ?? true,
        authorId: userId,
      },
    });
  }

  async incrementUsage(skillId: string) {
    return this.prisma.skill.update({
      where: { id: skillId },
      data: { usageCount: { increment: 1 } },
    });
  }

  /**
   * 在指定画布上执行技能：按 config 插入一个预配置节点。
   * 返回更新后的画布图（节点已加入）。autoRun=true 时由调用方触发生成。
   */
  async executeOnCanvas(userId: string, skillId: string, canvasId: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) throw new NotFoundException('技能不存在');

    const config = (skill.config || {}) as Record<string, any>;
    if (config.action !== 'add_node') {
      throw new BadRequestException('该技能暂不支持在画布上执行');
    }

    // 读取画布图
    const canvas = await this.prisma.canvas.findUnique({ where: { id: canvasId } });
    if (!canvas || canvas.userId !== userId) {
      throw new NotFoundException('画布不存在');
    }
    const settings = (canvas.settings || {}) as Record<string, any>;
    const graph = (settings.graph as { nodes: any[]; edges: any[] }) || { nodes: [], edges: [] };

    const nodeType = config.nodeType || 'image';
    const node = {
      id: randomUUID(),
      type: nodeType,
      x: 120 + graph.nodes.length * 28,
      y: 120 + graph.nodes.length * 28,
      width: nodeType === 'video' ? 360 : 340,
      height: nodeType === 'video' ? 440 : 400,
      zIndex: graph.nodes.length + 1,
      locked: false,
      visible: true,
      title: skill.name,
      gen: {
        model: config.model || 'minimax-image',
        prompt: config.prompt || '',
        aspectRatio: config.aspectRatio || '1024x1024',
        count: config.count || 1,
      },
      status: 'idle',
      versions: [],
    };

    graph.nodes.push(node);

    await this.prisma.canvas.update({
      where: { id: canvasId },
      data: { settings: { ...settings, graph } as any },
    });

    await this.incrementUsage(skillId);

    return { nodeId: node.id, graph, autoRun: Boolean(config.autoRun) };
  }

  async seedOfficialSkills() {
    /**
     * 技能 = 可执行预设。config.action 描述在画布上执行的动作：
     *   - add_node：插入一个预配置节点（可选立即生成）
     * 字段：nodeType / model / prompt(模板) / aspectRatio / count / autoRun
     */
    const officialSkills: Array<{
      name: string;
      slug: string;
      description: string;
      category: 'OFFICIAL' | 'CUSTOM' | 'MARKETPLACE';
      type: 'IMAGE' | 'VIDEO' | 'WORKFLOW';
      config: Record<string, any>;
    }> = [
      {
        name: '文生图·通用',
        slug: 'text-to-image',
        description: '插入一个通义万相图片节点，输入描述即可出图',
        category: 'OFFICIAL',
        type: 'IMAGE',
        config: {
          action: 'add_node',
          nodeType: 'image',
          model: 'tokenplan-image',
          prompt: '',
          aspectRatio: '1024x1024',
          count: 1,
          autoRun: false,
        },
      },
      {
        name: '电影感人像',
        slug: 'cinematic-portrait',
        description: '电影光影风格的人物肖像生成预设',
        category: 'OFFICIAL',
        type: 'IMAGE',
        config: {
          action: 'add_node',
          nodeType: 'image',
          model: 'tokenplan-image',
          prompt: '电影感人像，浅景深，柔和侧光，胶片颗粒质感，',
          aspectRatio: '1024x1792',
          count: 1,
          autoRun: false,
        },
      },
      {
        name: '产品精修图',
        slug: 'product-shot',
        description: '电商产品主图，干净背景、棚拍质感',
        category: 'OFFICIAL',
        type: 'IMAGE',
        config: {
          action: 'add_node',
          nodeType: 'image',
          model: 'tokenplan-image',
          prompt: '产品商业摄影，纯白背景，柔和棚拍光，高清细节，',
          aspectRatio: '1024x1024',
          count: 1,
          autoRun: false,
        },
      },
      {
        name: '图生视频',
        slug: 'image-to-video',
        description: '从一张图片生成动态视频，插入视频节点',
        category: 'OFFICIAL',
        type: 'VIDEO',
        config: {
          action: 'add_node',
          nodeType: 'video',
          model: 'minimax-video',
          prompt: '镜头缓慢推进，主体自然运动，',
          aspectRatio: '1024x1024',
          count: 1,
          autoRun: false,
        },
      },
      {
        name: '万相·艺术风格',
        slug: 'wan-art-style',
        description: '用阿里通义万相做艺术化/风格化图片',
        category: 'OFFICIAL',
        type: 'IMAGE',
        config: {
          action: 'add_node',
          nodeType: 'image',
          model: 'tokenplan-image',
          prompt: '高质量艺术插画，丰富细节，',
          aspectRatio: '1024x1024',
          count: 1,
          autoRun: false,
        },
      },
    ];

    for (const skill of officialSkills) {
      const existing = await this.prisma.skill.findFirst({
        where: { slug: skill.slug, tenantId: 'default' },
      });
      if (existing) {
        // 同步最新可执行配置
        await this.prisma.skill.update({
          where: { id: existing.id },
          data: {
            name: skill.name,
            description: skill.description,
            type: skill.type,
            config: skill.config,
          },
        });
      } else {
        await this.prisma.skill.create({
          data: {
            name: skill.name,
            slug: skill.slug,
            description: skill.description,
            category: skill.category,
            type: skill.type,
            config: skill.config,
            tenantId: 'default',
            isPublic: true,
          },
        });
      }
    }

    // 删除旧的、已废弃的技能（h3-master / instant-reshoot 等）
    await this.prisma.skill.deleteMany({
      where: {
        tenantId: 'default',
        slug: { notIn: officialSkills.map((s) => s.slug) },
      },
    });

    return { seeded: officialSkills.length };
  }
}
