# TapNow Canvas - UGREEN NAS 部署指南

## 前置条件

- 绿联 NAS（UGOS 系统），已启用 Docker 功能
- NAS 可用内存 ≥ 4GB
- 已获取阿里通义万相 API Key（可选）
- 已获取 MiniMax API Key（可选，用于视频生成）

## 部署步骤

### 1. 准备文件

将以下文件复制到 NAS 共享文件夹，例如 `/共享文件夹/tapnow-canvas/`：

```
tapnow-canvas/
├── deploy/
│   └── nas/
│       ├── docker-compose.yml
│       ├── nginx.conf
│       └── .env.example
├── server/          # 完整 server 目录
├── client/          # 完整 client 目录
```

### 2. 配置环境变量

在 `deploy/nas/` 目录下执行：

```bash
cd /共享文件夹/tapnow-canvas/deploy/nas
cp .env.example .env
```

编辑 `.env`，**必须修改**以下配置：

```bash
# 数据库密码（设置强密码）
POSTGRES_PASSWORD=你的强密码

# JWT 密钥（生成随机字符串）
JWT_SECRET=$(openssl rand -hex 32)

# NAS 局域网 IP（替换为实际 IP）
ALLOWED_ORIGINS=http://192.168.1.100:9999
FRONTEND_URL=http://192.168.1.100:9999
SERVER_PUBLIC_URL=http://192.168.1.100:9999

# AI 模型 API Key（可选）
TOKENPLAN_API_KEY=你的阿里TokenPlan密钥
MINIMAX_API_KEY=你的MiniMax密钥
```

### 3. 构建并启动

#### 方式 A：通过绿联 Docker Manager（推荐）

1. 打开绿联 NAS 管理界面
2. 进入 **Docker Manager** → **Compose**
3. 点击 **新增项目**
4. 选择 `deploy/nas/docker-compose.yml` 文件
5. 点击 **部署**

#### 方式 B：通过 SSH 命令行

```bash
cd /共享文件夹/tapnow-canvas/deploy/nas

# 构建镜像
docker-compose build

# 启动服务（后台运行）
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4. 验证部署

等待约 1-2 分钟，访问：

```
http://NAS_IP:9999
```

例如：`http://192.168.1.100:9999`

首次访问会自动初始化数据库。

### 5. 常用命令

```bash
# 查看服务状态
docker-compose ps

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 更新镜像（代码更新后）
docker-compose build
docker-compose up -d

# 查看 API 日志
docker logs -f tapnow-api

# 查看前端日志
docker logs -f tapnow-front
```

## 数据持久化

- **数据库数据**：`./data/postgres/`（绑定挂载到 NAS 本地）
- **Redis 数据**：`./data/redis/`（绑定挂载到 NAS 本地）
- **上传文件**：Docker named volume `uploads`（可通过 `docker volume inspect` 查看位置）

### 备份建议

```bash
# 备份数据库
docker exec tapnow-postgres pg_dump -U tapnow tapnow_canvas > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260930.sql | docker exec -i tapnow-postgres psql -U tapnow tapnow_canvas
```

## 故障排查

### 服务启动失败

```bash
# 查看详细日志
docker-compose logs api

# 检查端口占用
netstat -tlnp | grep 9999

# 重建容器
docker-compose down
docker-compose up -d --build
```

### 无法访问 AI 功能

检查 `.env` 中的 API Key 是否正确配置：

```bash
docker exec tapnow-api env | grep API_KEY
```

### 数据库连接失败

```bash
# 检查数据库是否运行
docker-compose ps postgres

# 查看数据库日志
docker logs tapnow-postgres
```

## 性能优化建议

- **内存分配**：如果 NAS 内存 ≥ 8GB，可在 `docker-compose.yml` 中为 Redis 增加 `--maxmemory 1gb`
- **存储性能**：如果 NAS 支持 SSD，将 `./data/postgres` 放在 SSD 分区可显著提升性能
- **网络**：确保 NAS 和访问设备在同一局域网，避免跨网段延迟

## 安全建议

1. **修改默认密码**：`.env` 中的 `POSTGRES_PASSWORD` 和 `JWT_SECRET` 必须修改
2. **限制访问**：如果 NAS 暴露到公网，建议配置防火墙规则，仅允许特定 IP 访问 9999 端口
3. **定期备份**：每周至少备份一次数据库和上传文件
4. **更新镜像**：定期检查并更新 Docker 镜像，修复安全漏洞

## 技术支持

- 项目文档：查看项目根目录 README.md
- 问题反馈：提交 Issue 或联系开发团队
