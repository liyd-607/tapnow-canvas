import { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Logger } from '@nestjs/common';
import { McpToolsService } from './mcp-tools.service';
import { registerTapnowTools } from './mcp-registry';
import { checkServiceToken } from '../../common/guards/service-token.guard';

/**
 * 把 TapNow 暴露成 MCP server（Streamable HTTP）。
 *
 * 路径：/api/mcp
 * 认证：X-TapNow-Service-Token（认证）+ X-TapNow-User-Id（授权）
 *
 * 两个关键实现细节：
 *  1. **无状态模式**（sessionIdGenerator: undefined）：每个请求独立建 server + transport，
 *     不做 session 管理。客户端不需要持有会话 id。
 *  2. **body 已被 Nest 的 json() 解析过** → 直接把 req.body 传给 handleRequest 的第三个参数，
 *     不要再叠 express.raw()（叠了也读不到，流已被消费）。
 */

const logger = new Logger('McpHttp');

export function createMcpHandler(tools: McpToolsService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const check = checkServiceToken(req.headers as Record<string, any>);
    if (!check.ok) {
      res.status(401).json({
        statusCode: 401,
        error: 'Unauthorized',
        message: check.reason,
      });
      return;
    }

    try {
      const server = new McpServer(
        { name: 'tapnow', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      registerTapnowTools(server, tools, check.userId!);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // 无状态
      });

      // ⚠️ 必须 connect：不然 transport 收不到 server 的路由，
      //    表现为 HTTP 200 + text/event-stream 但一个字节都不吐。
      await server.connect(transport);

      res.on('close', () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });

      await transport.handleRequest(req, res, req.body);
    } catch (e: any) {
      logger.error(`MCP 请求处理失败：${e?.message ?? e}`);
      if (!res.headersSent) {
        res.status(500).json({
          statusCode: 500,
          message: `MCP 处理失败：${e?.message ?? e}`,
        });
      }
      return;
    }
    void next;
  };
}
