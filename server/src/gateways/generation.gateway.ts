import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
  },
  namespace: 'generation',
})
export class GenerationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private userRooms = new Map<string, string>(); // socketId -> userId

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth.token || client.handshake.query.token;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync(token as string, {
        secret: this.configService.get('JWT_SECRET') || 'dev-secret',
      });
      this.userRooms.set(client.id, payload.sub);
      client.join(`user:${payload.sub}`);
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

  sendProgress(userId: string, taskId: string, progress: number) {
    this.server.to(`user:${userId}`).emit('generation:progress', { taskId, progress });
  }

  sendCompleted(userId: string, taskId: string, urls: string[]) {
    this.server.to(`user:${userId}`).emit('generation:completed', { taskId, urls });
  }

  sendFailed(userId: string, taskId: string, error: string) {
    this.server.to(`user:${userId}`).emit('generation:failed', { taskId, error });
  }
}
