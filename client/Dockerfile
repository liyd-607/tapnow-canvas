# ===========================================
# TapNow Canvas Frontend - Dockerfile
# ===========================================

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源码
COPY . .

# 构建
RUN npm run build

# ===========================================
# Nginx 服务阶段
# ===========================================

FROM nginx:alpine AS production

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY deploy/nginx.conf /etc/nginx/nginx.conf

# 安全：移除默认配置
RUN rm /etc/nginx/conf.d/default.conf

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/health || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
