import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export const GENERATION_QUEUE = 'generation';
export const AGENT_QUEUE = 'agent-tasks';

@Injectable()
export class QueueService implements OnModuleInit {
  public generationQueue: Queue;
  public agentQueue: Queue;

  constructor(private redisService: RedisService) {}

  onModuleInit() {
    const connection = this.redisService.getClient();
    this.generationQueue = new Queue(GENERATION_QUEUE, { connection });
    this.agentQueue = new Queue(AGENT_QUEUE, { connection });
  }
}
