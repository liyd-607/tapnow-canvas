#!/bin/bash
# 停止所有 TapNow 服务
set -e
PM2="/Users/dong/.npm-global/bin/pm2"
$PM2 stop all 2>&1 || true
echo "✅ PM2 进程已停止"
echo "   (Docker 容器 Postgres/Redis 仍在运行,如需停止: docker compose down)"