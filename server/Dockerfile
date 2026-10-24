# ===========================================
# TapNow Canvas API - Dockerfile
# ===========================================

# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production=false

# 复制源码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate

# 构建
RUN npm run build

# ===========================================
# 生产阶段
# ===========================================

FROM node:20-alpine AS production

WORKDIR /app

# 安全：创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# 复制 package 文件
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# 设置用户
USER nestjs

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# 启动
EXPOSE 3000

CMD ["node", "dist/main"]
