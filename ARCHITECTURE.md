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

## 十、许可证

私有项目 - All Rights Reserved
