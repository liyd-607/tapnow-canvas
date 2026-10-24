# TapNow Canvas 登录问题排查与修复

## 问题原因

你无法登录的根本原因是：**后端服务没有运行**。

TapNow Canvas 是一个完整的前后端分离项目：
- 前端运行在 `http://localhost:5173`（当前已正常运行）
- 后端API服务需要运行在 `http://localhost:3001`

当前前端服务正常，但后端服务未启动，所以登录请求无法到达服务器。

## 解决方案

### 1. 启动后端服务

打开一个新的终端窗口，执行以下步骤：

```bash
cd /Users/dong/Documents/图片和视频类知识库/视频知识库/tapnow-canvas/server

# 安装依赖（如果首次运行）
npm install

# 生成Prisma客户端
npm run prisma:generate

# 启动开发服务器
npm run start:dev
```

### 2. 数据库配置（如果需要）

如果遇到数据库连接问题，请检查 `.env` 文件中的数据库配置：

```bash
cat /Users/dong/Documents/图片和视频类知识库/视频知识库/tapnow-canvas/server/.env
```

### 3. 访问登录页面

后端服务启动后，访问：`http://localhost:5173/login`

你可以使用任意手机号进行测试：
1. 输入手机号，点击"获取验证码"
2. 在开发环境下，验证码会打印在后端服务器的控制台中
3. 输入验证码后点击登录，即可成功登录系统

## 项目结构说明

- **前端**：`/Users/dong/Documents/图片和视频类知识库/视频知识库/tapnow-canvas/client`
  - 使用 React 19 + TypeScript + Vite
  - 状态管理使用 Zustand
  - UI框架使用 TailwindCSS

- **后端**：`/Users/dong/Documents/图片和视频类知识库/视频知识库/tapnow-canvas/server`
  - 使用 NestJS
  - 数据库使用 Prisma + PostgreSQL
  - 包含完整的认证、授权、WebSocket等功能

## 登录流程

1. 前端通过 `/api/auth/send-code` 发送验证码
2. 后端生成验证码并发送（开发环境下打印到控制台）
3. 前端通过 `/api/auth/login` 使用手机号和验证码登录
4. 后端返回token和用户信息
5. 前端存储token并跳转到首页