import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'path';
import { StorageModule } from './modules/storage/storage.module';
import { PersistenceModule } from './common/persistence/persistence.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GenerationModule } from './modules/generation/generation.module';
import { CreditsModule } from './modules/credits/credits.module';
import { AiModule } from './modules/ai/ai.module';
import { CanvasModule } from './modules/canvas/canvas.module';
import { SkillsModule } from './modules/skills/skills.module';
import { AgentModule } from './modules/agent/agent.module';
import { AssetsModule } from './modules/assets/assets.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ModelModule } from './modules/model/model.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { GenerationGatewayModule } from './gateways/generation-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 将本地存储目录 ./uploads 挂载为 /media，供上传文件与转存结果访问
    ServeStaticModule.forRoot({
      rootPath: resolve(process.cwd(), 'uploads'),
      serveRoot: '/media',
      serveStaticOptions: { index: false },
    }),
    StorageModule,
    PersistenceModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    AuthModule,
    UsersModule,
    GenerationModule,
    CreditsModule,
    AiModule,
    CanvasModule,
    SkillsModule,
    AgentModule,
    AssetsModule,
    TemplatesModule,
    ModelModule,
    GenerationGatewayModule,
  ],
})
export class AppModule {}
