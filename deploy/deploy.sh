#!/bin/bash
# ===========================================
# TapNow Canvas 部署脚本
# ===========================================

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  TapNow Canvas 部署脚本${NC}"
echo -e "${GREEN}==========================================${NC}"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker 未安装${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

# 进入部署目录
cd "$(dirname "$0")"

# 创建 .env 文件
if [ ! -f .env ]; then
    echo -e "${YELLOW}创建 .env 文件...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}请编辑 .env 文件配置数据库密码和 JWT Secret${NC}"
    read -p "按 Enter 继续..."
fi

# 构建镜像
echo -e "${YELLOW}构建 Docker 镜像...${NC}"
docker-compose -f docker-compose.prod.yml build

# 启动服务
echo -e "${YELLOW}启动服务...${NC}"
docker-compose -f docker-compose.prod.yml up -d

# 等待数据库就绪
echo -e "${YELLOW}等待数据库就绪...${NC}"
sleep 10

# 执行数据库迁移
echo -e "${YELLOW}执行数据库迁移...${NC}"
docker-compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy

# 执行种子数据
echo -e "${YELLOW}导入种子数据...${NC}"
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U tapnow -d tapnow_canvas -f /app/prisma/seed.sql 2>/dev/null || true

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "前端: http://localhost"
echo -e "API:  http://localhost/api"
echo -e ""
echo -e "按 Ctrl+C 停止服务"
echo -e "或运行: docker-compose -f docker-compose.prod.yml down"
