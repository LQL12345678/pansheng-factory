// 前端启动脚本 - 使用 node:exec 方式
const { exec } = require('child_process');
const path = require('path');

const frontendPath = path.join(__dirname, '..', 'frontend');

console.log('[PM2] Starting Vite dev server at:', frontendPath);

// 使用 exec 启动 vite，确保正确继承环境
const vite = exec('npx.cmd vite --host --port 5173', {
  cwd: frontendPath,
  env: { ...process.env, FORCE_COLOR: '1' }
});

vite.stdout.pipe(process.stdout);
vite.stderr.pipe(process.stderr);

vite.on('error', (err) => {
  console.error('[PM2] Failed to start:', err.message);
  process.exit(1);
});

vite.on('close', (code) => {
  console.log(`[PM2] Process exited with code ${code}`);
  process.exit(code || 0);
});

// 保持进程运行
process.stdin.resume();

process.on('SIGINT', () => {
  console.log('[PM2] Shutting down...');
  vite.kill('SIGINT');
  process.exit(0);
});
