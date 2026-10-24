#!/bin/bash
# 查看 TapNow 服务状态
PM2="/Users/dong/.npm-global/bin/pm2"
echo "========== PM2 =========="
$PM2 status
echo ""
echo "========== Docker =========="
docker compose ps 2>&1 | tail -10
echo ""
echo "========== HTTP 探测 =========="
echo -n "  前端 5173: "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://localhost:5173/ || echo "down"
echo -n "  后端 3001: "; curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 http://localhost:3001/api || echo "down"