// PM2启动脚本 for Windows
const { spawn } = require('child_process');

console.log('Starting services...');

// 启动后端
const backend = spawn('node', ['server.js'], {
  cwd: 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/backend',
  stdio: 'inherit',
  detached: false
});

backend.on('error', (err) => {
  console.error('Backend error:', err);
});

// 等待2秒后启动前端
setTimeout(() => {
  const frontend = spawn('npx', ['vite', '--host'], {
    cwd: 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/frontend',
    stdio: 'inherit',
    detached: false
  });

  frontend.on('error', (err) => {
    console.error('Frontend error:', err);
  });
}, 2000);

console.log('Services starting in background...');
