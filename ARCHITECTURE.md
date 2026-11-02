# TapNow Canvas - 平台化架构文档

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户层                                    │
│              Web / App / 小程序 / API 客户端                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                      Nginx API Gateway                             │
│   路由 · 限流 · SSL · 静态文件 · Gzip压缩                        │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  NestJS API   │  │   前端静态     │  │   Redis       │
│  (可水平扩展)  │  │   (Nginx)     │  │   缓存/会话   │
└───────┬───────┘  └───────────────┘  └───────────────┘
        │
        ▼
┌───────────────┐
│  PostgreSQL   │
│  (多租户)     │
└───────────────┘
```

## 二、技术栈

| 组件 | 技术 | 说明 |
|-----|------|------|
| 前端 | React 19 + Vite + TailwindCSS | 已容器化 |
| 后端 | NestJS + Prisma | 可水平扩展 |
| 数据库 | PostgreSQL 15 | 多租户支持 |
| 缓存 | Redis 7 | 会话/队列 |
| 网关 | Nginx | 路由/限流 |
| 容器 | Docker Compose | 开发/测试 |
| 编排 | K8s | 生产环境 |

## 三、多租户设计

### 3.1 数据模型

```prisma
model Tenant {
  id    String @id @default(cuid())
  name  String  // 租户名称
  slug  String  @unique  // 租户标识
  plan  TenantPlan @default(FREE)  // free/pro/enterprise
  users User[]
  // ...
}

model User {
  id        String @id @default(cuid())
  tenantId  String
  tenant    Tenant @relation(...)
  phone     String  // 同租户唯一
  role      UserRole @default(USER)  // owner/admin/member/guest
  // ...
}
```

### 3.2 套餐配额

| 资源 | Free | Pro | Enterprise |
|-----|------|-----|-----------|
| 图片/月 | 50 | 500 | 无限 |
| 视频/月 | 10 | 50 | 无限 |
| 存储 | 1GB | 10GB | 无限 |
| 成员数 | 3 | 10 | 无限 |

## 四、快速部署

### 4.1 开发环境

```bash
# 启动基础设施
docker-compose up -d postgres redis

# 安装依赖
cd server && npm install && npm run prisma:migrate
cd ../client && npm install

# 启动开发服务器
cd server && npm run start:dev
cd client && npm run dev
```

### 4.2 生产环境

```bash
cd deploy

# 配置环境变量
cp .env.example .env
vim .env  # 编辑数据库密码和 JWT Secret

# 部署
./deploy.sh
```

## 五、文件结构

```
tapnow-canvas/
├── client/                    # 前端应用
│   ├── src/
│   │   ├── pages/
│   │   │   └── CanvasEditor.tsx   # 画布编辑器
│   │   └── ...
│   ├── Dockerfile              # 前端镜像构建
│   └── package.json
│
├── server/                    # 后端服务
│   ├── src/
│   │   ├── modules/
│   │   │   ├── canvas/       # 画布模块
│   │   │   ├── generation/   # 生成任务
│   │   │   ├── auth/          # 认证
│   │   │   ├── storage/       # 文件存储
│   │   │   └── ...
│   │   ├── common/
│   │   │   ├── decorators/    # 装饰器
│   │   │   └── tenant/       # 租户上下文
│   │   └── ...
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型
│   │   └── seed.sql          # 种子数据
│   ├── Dockerfile
│   └── package.json
│
├── deploy/                    # 部署配置
│   ├── docker-compose.prod.yml  # 生产环境
│   ├── nginx.conf              # Nginx 配置
│   ├── k8s.yaml                # K8s 编排
│   ├── .env.example            # 环境变量模板
│   └── deploy.sh               # 部署脚本
│
└── README.md
```

## 六、API 设计

### 6.1 认证

```bash
# 发送验证码
POST /api/auth/send-code
Body: { "phone": "13800138000" }

# 登录
POST /api/auth/login
Body: { "phone": "13800138000", "code": "123456" }

# 返回 JWT Token
Response: { "accessToken": "eyJ..." }
```

### 6.2 画布管理

```bash
# 创建画布
POST /api/canvas
Headers: Authorization: Bearer <token>
Body: { "name": "我的画布" }

# 获取画布列表
GET /api/canvas

# 获取画布详情
GET /api/canvas/:id

# 更新画布
PUT /api/canvas/:id
Body: { "layers": [...], "settings": {...} }

# 删除画布
DELETE /api/canvas/:id
```

### 6.3 文件上传

```bash
# 上传图片
POST /api/upload/image
Headers: Authorization: Bearer <token>
Body: FormData { "file": <file> }

Response: { "url": "...", "key": "images/xxx.jpg", "size": 12345 }
```

### 6.4 生成任务（幂等 / 取消 / 对账）

```bash
# 创建生成任务（clientRequestId 幂等键）
POST /api/generations
Headers: Authorization: Bearer <token>
Body: {
  "model": "seedream-4.0",
  "prompt": "一只猫",
  "size": "1024x1024",
  "count": 2,
  "clientRequestId": "客户端生成的幂等键(UUID)",
  "traceId": "可选，全链路追踪号"
}
# 相同 userId + clientRequestId 重复提交 → 返回同一任务，不重复扣费

# 取消任务（对标即梦 cancel_generate）
POST /api/generations/:id/cancel

# 对账：把「已入库但队列丢失」的任务重新入队（对标即梦 reconcileBySubmitId）
POST /api/generations/reconcile
Response: { "scanned": 3, "requeued": ["task_xxx"] }

# 任务详情（含 stage / traceId）
GET /api/generations/:id
```

生成任务的真实阶段（`stage` 字段）：

```
QUEUED → DISPATCHING → GENERATING → PERSISTING → COMPLETED
                          ↓
                     FAILED / CANCELLED
```

### 6.5 模型能力下发

```bash
GET /api/capabilities
```

```json
{
  "version": "2026.11.02",
  "updatedAt": "2026-11-02T00:00:00.000Z",
  "defaultModel": "seedream-4.0",
  "scenes": {
    "IMAGE": { "type": "IMAGE", "defaultModel": "seedream-4.0", "models": [ ... ] },
    "VIDEO": { "type": "VIDEO", "defaultModel": "...", "models": [ ... ] }
  },
  "models": [
    {
      "id": "seedream-4.0",
      "name": "Seedream 4.0",
      "type": "IMAGE",
      "creditCost": 4,
      "enabled": true,
      "capabilities": {
        "type": "IMAGE",
        "sizes": ["1024x1024", "1280x720"],
        "ratios": ["1:1", "16:9"],
        "maxCount": 4,
        "supportsReferences": true,
        "supportsNegativePrompt": true,
        "supportsSeed": true,
        "supportsTextToImage": true
      }
    }
  ]
}
```

### 6.6 画布图（快照 + 变更集）

```bash
# 全量快照（含 version 版本号）
GET /api/canvas/:id/graph

# 全量保存（乐观锁）
PUT /api/canvas/:id/graph
Body: { "graph": { "nodes": [...], "edges": [...] }, "baseVersion": 3 }
# baseVersion 与服务端不一致 → 409，错误体带 serverVersion / serverGraph

# 提交增量变更集（对标即梦 submit_changeset）
POST /api/canvas/:id/changes
Body: { "baseVersion": 3, "ops": [
  { "op": "node.upsert", "node": { ... } },
  { "op": "edge.remove", "id": "edge_1" }
]}

# 拉取增量变更集（对标即梦 fetch_changeset）
GET /api/canvas/:id/changes?since=12
```

### 6.7 编排器接口（机器对机器）

```bash
# 需服务令牌，与用户面 JWT 完全隔离
Headers:
  X-TapNow-Service-Token: <ORCHESTRATOR_TOKEN>
  X-TapNow-User-Id: <用户ID，可省略回落 ORCHESTRATOR_USER_ID>

GET  /api/orchestrator/canvases/:canvasId/graph
POST /api/orchestrator/canvases/:canvasId/nodes/:nodeId/result
PUT  /api/orchestrator/canvases/:canvasId/libtv-binding
```

### 6.8 可观测性约定

- 每个 HTTP 请求生成/透传 `x-request-id`，响应头回写同一值；
- 错误统一返回 `{ statusCode, message, error, requestId, timestamp, path }`；
- 生成任务落库 `traceId`，WebSocket 事件（`generation:progress/completed/failed/cancelled`）均携带 `stage` 与 `traceId`。

## 七、扩展指南

### 7.1 添加新的 AI 模型

1. 在 `AIModel` 表中添加模型配置
2. 在 `modules/ai/` 中创建适配器
3. 在 `generation.service.ts` 中集成

### 7.2 添加新的计费方式

1. 在 `CreditType` 枚举中添加类型
2. 在计费服务中处理新逻辑

### 7.3 微服务拆分

当前为单体架构，可按以下顺序拆分：

1. `auth-service` - 认证服务
2. `canvas-service` - 画布服务
3. `generation-service` - 生成服务
4. `billing-service` - 计费服务

## 八、监控运维

### 8.1 健康检查

```bash
# API 健康检查
curl http://localhost:3000/health

# Nginx 健康检查
curl http://localhost/health
```

### 8.2 日志查看

```bash
# API 日志
docker logs -f tapnow-api

# Nginx 日志
docker logs -f tapnow-front
```

### 8.3 数据库连接

```bash
docker exec -it tapnow-postgres psql -U tapnow -d tapnow_canvas
```

## 九、安全建议

1. **JWT Secret**: 生产环境必须使用强随机密钥
2. **数据库密码**: 生产环境必须使用强密码
3. **HTTPS**: 生产环境建议启用 HTTPS
4. **CORS**: 生产环境配置允许的域名
5. **限流**: Nginx 已配置限流，生产环境调整阈值

## 十、生成与协同增强（即梦对标改造）

> 本章记录 2026-11-02 基于《即梦 Jimeng 技术实现逆向分析》落地的增强，
> 详细接口契约见 `即梦对标优化说明.md`。

### 10.1 生成幂等与对账

| 即梦机制 | TapNow 实现 |
|---|---|
| `generate_id` 幂等 | `GenerationTask.clientRequestId` + `@@unique([userId, clientRequestId])`，重复提交直接复用任务；并发插入触发 P2002 时回查既有任务 |
| `reconcileBySubmitId` 对账 | `POST /api/generations/reconcile`，扫描「已入库但队列无 job」的任务重新入队（`jobId = taskId`） |
| `cancel_generate` 撤销 | `POST /api/generations/:id/cancel`：排队中 → 移出队列并退积分；生成中 → 置 `cancelRequested`，Processor 在安全点中止 |
| 真实阶段推进 | 移除旧的 `setInterval` 假进度，改为 `DISPATCHING → GENERATING → PERSISTING → COMPLETED` 的真实阶段，落库 `stage` 字段 |

### 10.2 能力下发

`AICapabilities`（尺寸 / 比例 / 数量上限 / 是否支持参考图、负面提示词、种子）声明在
`BaseAIAdapter` 上，由 `CapabilitiesService` 聚合 adapter 声明 + `AIModel` 表的
`enabled / creditCost / name` 覆盖，通过 `GET /api/capabilities` 统一出口。
前端不再硬编码模型与参数枚举——新增模型只需加 adapter，无需改前端。

### 10.3 画布变更集

- `Canvas.graphVersion`：画布图版本号，乐观锁基线；
- `CanvasChange`：`seq = graphVersion` 的有序变更集（`node.upsert / node.remove / edge.upsert / edge.remove`），
  支持 `since=seq` 增量拉取与断线续传；
- 全量快照仍是权威副本，变更集用于增量下发与多端协同（对标即梦 `fetch_snapshot / submit_changeset / fetch_changeset`）。

### 10.4 可观测性

- `RequestContextMiddleware`：透传或生成 `x-request-id`，响应头回写；
- `AllExceptionsFilter`：统一错误体 `{ statusCode, message, error, requestId, timestamp, path }`，
  并保留 `HttpException` 自定义附加字段（如画布冲突的 `serverVersion / serverGraph`）；
- 任务落库 `traceId`，WebSocket 事件携带 `stage / traceId`，前端错误提示附带追踪号。

## 十一、许可证

私有项目 - All Rights Reserved
