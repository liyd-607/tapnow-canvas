import { Module } from '@nestjs/common';
import { McpToolsService } from './mcp-tools.service';
import { CanvasModule } from '../canvas/canvas.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [CanvasModule, AiModule],
  providers: [McpToolsService],
  exports: [McpToolsService],
})
export class McpModule {}
