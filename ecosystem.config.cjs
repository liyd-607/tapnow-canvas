/**
 * TapNow Canvas - PM2 进程守护配置
 *
 * 启动方式:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save         # 保存进程列表,机器重启后可 pm2 resurrect
 *   pm2 startup      # 设置开机自启 (需要 sudo)
 *
 * 常用命令:
 *   pm2 status                    # 查看状态
 *   pm2 logs                       # 实时日志
 *   pm2 logs tapnow-server        # 单个服务日志
 *   pm2 restart all               # 重启所有
 *   pm2 reload all                # 0 秒重载(后端)
 *   pm2 stop all                  # 停止所有
 *   pm2 delete all                # 删除所有
 *
 * 设计要点:
 *   - 用 start:dev 而非 start:prod,保留开发体验(热重载)
 *   - autorestart + exp_backoff_restart_delay:崩了自动拉起,前几次快速重试
 *   - max_memory_restart:内存超阈值自动重启,防内存泄漏累积
 *   - max_restarts:防止无限重启循环(配置错误时停止尝试)
 *   - kill_timeout + listen_timeout:给 nest 编译留时间,否则 PM2 会提前 kill
 */

const path = require('path');

const ROOT = path.resolve(__dirname);
const SERVER_DIR = path.join(ROOT, 'server');
const CLIENT_DIR = path.join(ROOT, 'client');
const LOG_DIR = path.join(ROOT, '.pm2-logs');

module.exports = {
  apps: [
    {
      name: 'tapnow-server',
      cwd: SERVER_DIR,
      script: 'npm',
      args: 'run start:dev',
      // 慢启动: nest --watch 要先 tsc 编译,可能要 10-30s
      listen_timeout: 60000,
      kill_timeout: 5000,
      wait_ready: false,
      // 自动重启策略
      autorestart: true,
      restart_delay: 3000,
      exp_backoff_restart_delay: 0,
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '1G',
      // 环境变量:确保 NODE_ENV 一致
      env: {
        NODE_ENV: 'development',
      },
      // 日志
      out_file: '/tmp/tapnow-server.log',
      error_file: '/tmp/tapnow-server-error.log',
      merge_logs: true,
      time: true,
      // 合并 npm/nest 输出,便于日志连续
      pm_exec_mode: 'fork',
    },
    {
      name: 'tapnow-client',
      cwd: CLIENT_DIR,
      script: 'npm',
      args: 'run dev',
      listen_timeout: 30000,
      kill_timeout: 3000,
      autorestart: true,
      restart_delay: 2000,
      exp_backoff_restart_delay: 0,
      max_restarts: 10,
      min_uptime: '30s',
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'development',
      },
      out_file: '/tmp/tapnow-client.log',
      error_file: '/tmp/tapnow-client-error.log',
      merge_logs: true,
      time: true,
      pm_exec_mode: 'fork',
    },
  ],
};