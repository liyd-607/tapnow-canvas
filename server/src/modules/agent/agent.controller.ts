import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AgentService, CreateAgentTaskDto } from './agent.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('tasks')
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateAgentTaskDto) {
    return this.agentService.create(userId, dto);
  }

  @Get('tasks')
  list(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.agentService.list(userId, Number(page), Number(pageSize));
  }

  @Get('tasks/:id')
  detail(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.agentService.detail(userId, id);
  }
}
