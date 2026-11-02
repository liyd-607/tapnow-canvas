import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpToolsService, type McpToolResult } from './mcp-tools.service';

/**
 * 把业务方法注册成 MCP 工具。
 *
 * 只做协议层的事：定义 inputSchema、把返回值包成 content、把异常转成 isError。
 * 业务逻辑全在 McpToolsService 里。
 */

/** 统一的结果包装：成功给可读摘要，失败给可读原因（不要让模型看到裸堆栈） */
function wrap(
  fn: (args: any) => Promise<McpToolResult>,
): (args: any) => Promise<{ content: any[]; isError?: boolean }> {
  return async (args: any) => {
    try {
      const r = await fn(args);
      if (r?.ok === false) {
        return {
          content: [
            { type: 'text', text: `❌ ${r.error ?? '操作失败'}` },
            { type: 'text', text: JSON.stringify(r, null, 2) },
          ],
          isError: true,
        };
      }
      return {
        content: [
          { type: 'text', text: summarize(r) },
          { type: 'text', text: JSON.stringify(r, null, 2) },
        ],
      };
    } catch (e: any) {
      const status = e?.status ?? e?.response?.statusCode;
      const msg = e?.response?.message ?? e?.message ?? String(e);
      return {
        content: [
          {
            type: 'text',
            text:
              status === 409
                ? `❌ 版本冲突：画布已被其他操作修改，请重新读取后再试（${msg}）`
                : `❌ ${msg}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/** 给模型看的第一段是人话摘要，不是 JSON 堆 */
function summarize(r: McpToolResult): string {
  if (r.canvases) {
    const list = r.canvases as any[];
    return `共 ${r.total} 个画布：\n` +
      list.map((c) => `- ${c.name}（id=${c.id}，${c.nodeCount} 个节点）`).join('\n');
  }
  if (r.nodes && r.canvas) {
    return `画布「${r.canvas.name}」共 ${(r.nodes as any[]).length} 个节点，版本 v${r.canvas.graphVersion}。`;
  }
  if (r.node) {
    const verb = r.action === 'created' ? '已创建节点' : r.action === 'updated' ? '已更新节点' : '节点';
    return `${verb}：${JSON.stringify(r.node)}`;
  }
  if (r.edge) return `已连线：${r.edge.from} → ${r.edge.to}`;
  if (r.models) {
    const list = r.models as any[];
    return `可用模型 ${list.length} 个：` + list.map((m) => `${m.id}(${m.name})`).join(', ');
  }
  if (r.executed) {
    return `已执行 ${(r.executed as string[]).length} 个节点，完成 ${r.completed} 个，失败 ${r.failed} 个。`;
  }
  if (r.changed === false) return '未发生变更。';
  return '✅ 完成';
}

export function registerTapnowTools(
  server: McpServer,
  tools: McpToolsService,
  actingUserId: string,
) {
  const uid = actingUserId;

  server.registerTool(
    'tapnow_list_canvases',
    {
      title: '列出画布',
      description: '列出当前用户的所有 TapNow 画布（含 id、名称、节点数）。',
      inputSchema: {
        page: z.number().int().min(1).optional().describe('页码，从 1 开始'),
        pageSize: z.number().int().min(1).max(100).optional().describe('每页条数，默认 20'),
      },
    },
    wrap((a) => tools.listCanvases(uid, a.page ?? 1, a.pageSize ?? 20)),
  );

  server.registerTool(
    'tapnow_get_canvas',
    {
      title: '读取画布',
      description:
        '读取画布详情 + 全部节点 + 连线。节点含 prompt、模型、状态、结果 URL。',
      inputSchema: { canvasId: z.string().min(1).describe('画布 id') },
    },
    wrap((a) => tools.getCanvas(uid, a.canvasId)),
  );

  server.registerTool(
    'tapnow_create_canvas',
    {
      title: '新建画布',
      description: '新建一个空白画布，返回画布 id。',
      inputSchema: {
        name: z.string().min(1).describe('画布名称'),
        width: z.number().int().optional().describe('画布宽，默认 1024'),
        height: z.number().int().optional().describe('画布高，默认 1024'),
      },
    },
    wrap((a) => tools.createCanvas(uid, a.name, a.width ?? 1024, a.height ?? 1024)),
  );

  server.registerTool(
    'tapnow_create_node',
    {
      title: '新建节点',
      description:
        '在画布上新建节点。image/video 节点可同时带 model + prompt，之后可调 tapnow_generate_node 生成。',
      inputSchema: {
        canvasId: z.string().min(1),
        type: z
          .enum(['text', 'image', 'video', 'media', 'group', 'editor'])
          .describe('节点类型'),
        title: z.string().optional().describe('节点标题'),
        x: z.number().optional().describe('左上角 X'),
        y: z.number().optional().describe('左上角 Y'),
        width: z.number().optional(),
        height: z.number().optional(),
        model: z.string().optional().describe('模型 id，如 minimax-image / tokenplan-wan2.7'),
        prompt: z.string().optional().describe('提示词'),
        aspectRatio: z.string().optional().describe('画幅，如 1024x1024'),
        count: z.number().int().optional(),
      },
    },
    wrap((a) => tools.createNode(uid, a.canvasId, a)),
  );

  server.registerTool(
    'tapnow_update_node',
    {
      title: '更新节点',
      description:
        '改节点的标题 / 位置 / 尺寸 / 提示词 / 模型 / 状态。改 prompt 后需要重新生成才会生效。',
      inputSchema: {
        canvasId: z.string().min(1),
        nodeId: z.string().min(1),
        title: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        model: z.string().optional(),
        prompt: z.string().optional(),
        aspectRatio: z.string().optional(),
        count: z.number().int().optional(),
        status: z.enum(['idle', 'generating', 'completed', 'failed']).optional(),
      },
    },
    wrap((a) => tools.updateNode(uid, a.canvasId, a.nodeId, a)),
  );

  server.registerTool(
    'tapnow_delete_node',
    {
      title: '删除节点',
      description: '删除节点，并连带清理与它相连的边。',
      inputSchema: {
        canvasId: z.string().min(1),
        nodeId: z.string().min(1),
      },
    },
    wrap((a) => tools.deleteNode(uid, a.canvasId, a.nodeId)),
  );

  server.registerTool(
    'tapnow_connect_nodes',
    {
      title: '连接节点',
      description:
        '连一条边：下游节点生成时会自动把上游产物作为参考图。role=firstFrame 表示用作视频首帧。',
      inputSchema: {
        canvasId: z.string().min(1),
        from: z.string().min(1).describe('上游节点 id'),
        to: z.string().min(1).describe('下游节点 id'),
        role: z
          .enum(['subject', 'image', 'firstFrame', 'lastFrame'])
          .optional()
          .describe('引用用途，缺省按节点类型推导'),
      },
    },
    wrap((a) => tools.connectNodes(uid, a.canvasId, a.from, a.to, a.role)),
  );

  server.registerTool(
    'tapnow_disconnect_nodes',
    {
      title: '断开连接',
      description: '删除指定方向的连线。',
      inputSchema: {
        canvasId: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
      },
    },
    wrap((a) => tools.disconnectNodes(uid, a.canvasId, a.from, a.to)),
  );

  server.registerTool(
    'tapnow_generate_node',
    {
      title: '生成节点内容',
      description:
        '对单个 image/video 节点真实出图（走平台已接入的阿里百炼 / MiniMax 模型）。会自动收集上游参考图。返回结果 URL。',
      inputSchema: {
        canvasId: z.string().min(1),
        nodeId: z.string().min(1),
      },
    },
    wrap((a) => tools.generateNode(uid, a.canvasId, a.nodeId)),
  );

  server.registerTool(
    'tapnow_run_graph',
    {
      title: '批量执行画布',
      description:
        '按拓扑顺序执行画布上所有未完成的 image/video 节点（上游先跑，下游自动带上游产物作参考）。',
      inputSchema: {
        canvasId: z.string().min(1),
        nodeIds: z.array(z.string()).optional().describe('只跑指定节点；留空则跑全部未完成节点'),
        force: z.boolean().optional().describe('true 时连已完成的节点也重跑'),
      },
    },
    wrap((a) => tools.runGraph(uid, a.canvasId, a.nodeIds, a.force ?? false)),
  );

  server.registerTool(
    'tapnow_list_models',
    {
      title: '列出可用模型',
      description: '列出平台已接入的生成模型（id / 名称 / 积分单价），用于给节点选模型。',
      inputSchema: {},
    },
    wrap(async () => tools.listModels()),
  );
}
