module.exports = {
  apps: [
    {
      name: 'device-backend',
      script: 'server.js',
      interpreter: 'C:/Program Files/nodejs/node.exe',  // 必须用系统 Node.js v24（node:sqlite 需要）
      cwd: 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/backend',
      instances: 1,
      exec_mode: 'fork',        // 强制 fork 模式，防止 cluster 模式导致端口冲突
      autorestart: true,
      max_restarts: 10,         // 限制 1 分钟内最多重启 10 次，防止死循环
      restart_delay: 3000,      // 重启前等待 3 秒，确保端口完全释放
      min_uptime: '10s',        // 运行至少 10 秒才算正常启动
      watch: false,
      max_memory_restart: '500M',
      kill_timeout: 5000,       // 给进程 5 秒时间优雅关闭
      env: {
        NODE_ENV: 'development'
      },
      error_file: 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/logs/backend-error.log',
      out_file: 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    // 前端不再通过 PM2 管理（Vite dev server 由 start-simple.bat 启动）
    // 如需 PM2 管理前端构建产物，请使用 vite preview 或 nginx
  ]
};
