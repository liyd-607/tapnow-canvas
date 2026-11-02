import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { McpToolsService } from './modules/mcp/mcp-tools.service';
import { createMcpHandler } from './modules/mcp/mcp-http';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://localhost:5180',
        'http://127.0.0.1:5180',
      ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // 把平台本身暴露成 MCP server（Streamable HTTP），路径 /api/mcp
  // 供 WorkBuddy 直连（像 LibTV 那样拿到 mcp__tapnow__* 工具）。
  // 注意：setGlobalPrefix 只影响 Nest 路由，app.use() 不受影响，所以这里就是 /api/mcp。
  const mcpTools = app.get(McpToolsService);
  app.use('/api/mcp', createMcpHandler(mcpTools));
  console.log('[TapNow Server] MCP endpoint: http://localhost:' + (process.env.PORT || 3001) + '/api/mcp');

  // 统一异常响应结构（附带 requestId，便于日志串联）
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`[TapNow Server] running on http://localhost:${port}`);
}

bootstrap();
