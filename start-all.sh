#!/bin/bash
# TapNow Canvas 一键启动 (使用 PM2 守护)
# 用法: ./start-all.sh
set -e

PM2="/Users/dong/.npm-global/bin/pm2"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo "▶ 检查 Docker (Postgres + Redis)..."
if ! docker info >/dev/null 2>&1; then
  echo "  ⚠ Docker 未运行,尝试启动 Docker Desktop..."
  open -a Docker
  for i in {1..30}; do
    if docker info >/dev/null 2>&1; then
      echo "  ✓ Docker 就绪 (${i}s)"
      break
    fi
    sleep 1
  done
fi

echo "▶ 启动 Postgres + Redis 容器..."
docker compose up -d 2>&1 | grep -v "^time=" || true

echo "▶ 等待数据库健康..."
for i in {1..30}; do
  if docker compose ps 2>/dev/null | grep -q "healthy"; then
    echo "  ✓ DB healthy"
    break
  fi
  sleep 1
done

echo "▶ 检查 default Tenant (登录依赖)..."
TAPNO_PG="docker exec tapnow-postgres psql -U tapnow -d tapnow_canvas -tAc"
if ! $TAPNO_PG "SELECT id FROM \"Tenant\" WHERE id='default'" 2>/dev/null | grep -q default; then
  echo "  插入 default Tenant..."
  docker exec tapnow-postgres psql -U tapnow -d tapnow_canvas -c \
    "INSERT INTO \"Tenant\" (id, name, slug, \"createdAt\", \"updatedAt\") VALUES ('default', 'Default Tenant', 'default', NOW(), NOW()) ON CONFLICT DO NOTHING;" >/dev/null
  echo "  ✓ 已插入"
else
  echo "  ✓ default Tenant 已存在"
fi

echo "▶ 启动 PM2 进程 (server + client)..."
$PM2 startOrReload ecosystem.config.cjs

echo ""
echo "✅ 启动完成"
echo ""
echo "📊 状态: $PM2 status"
echo "📜 日志: $PM2 logs"
echo "🌐 访问: http://localhost:5173/  (前端)"
echo "         http://localhost:3001/  (后端 API)"
echo "🔑 验证码: 任意手机号 + 后端日志里的 6 位数 (mock)"
echo ""
echo "常用命令:"
echo "  $PM2 status          查看状态"
echo "  $PM2 logs            实时日志"
echo "  $PM2 restart all     重启"
echo "  $PM2 stop all        停止"