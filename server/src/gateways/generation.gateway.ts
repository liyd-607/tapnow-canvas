import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

/**
 * 生成事件网关
 *
 * 事件载荷统一携带 `stage` 与 `traceId`（对标即梦 logid），
 * 前端可据此区分「排队中 / 生成中 / 转存中」，并把追踪号报给后端排查。
 */
@WebSocketGateway({
  namespace: '/generation',
  cors: { origin: '*' },
})
export class GenerationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userRooms = new Map<string, string>();

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as any)?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      const payload = this.jwtService.verify(token);
      client.join(`user:${payload.sub}`);
      this.userRooms.set(client.id, payload.sub);
      console.log(`[WS] 用户 ${payload.sub} 已连接`);
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.userRooms.get(client.id);
    if (userId) {
      console.log(`[WS] 用户 ${userId} 已断开`);
      this.userRooms.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe:task')
  subscribeTask(client: Socket, taskId: string) {
    client.join(`task:${taskId}`);
  }

  @SubscribeMessage('unsubscribe:task')
  unsubscribeTask(client: Socket, taskId: string) {
    client.leave(`task:${taskId}`);
  }

  /** 阶段推进事件（替代旧的假进度） */
  sendStage(userId: string, taskId: string, stage: string, progress: number, traceId?: string) {
    this.server.to(`user:${userId}`).emit('generation:progress', {
      taskId,
      progress,
      stage,
      traceId,
    });
  }

  sendProgress(userId: string, taskId: string, progress: number, traceId?: string) {
    this.server.to(`user:${userId}`).emit('generation:progress', {
      taskId,
      progress,
      traceId,
    });
  }

  sendCompleted(userId: string, taskId: string, urls: string[], traceId?: string) {
    this.server.to(`user:${userId}`).emit('generation:completed', { taskId, urls, traceId });
  }

  sendFailed(userId: string, taskId: string, error: string, traceId?: string) {
    this.server.to(`user:${userId}`).emit('generation:failed', { taskId, error, traceId });
  }

  sendCancelled(userId: string, taskId: string, error: string, traceId?: string) {
    this.server.to(`user:${userId}`).emit('generation:cancelled', { taskId, error, traceId });
  }
}
