// 设备管理系统守护脚本
// 监控并自动重启后端和前端服务

const { spawn, exec } = require('child_process');
const path = require('path');

const BACKEND_DIR = 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/backend';
const FRONTEND_DIR = 'C:/Users/Admin/WorkBuddy/2026-05-10-task-1/frontend';

let backendProcess = null;
let frontendProcess = null;

function startBackend() {
  if (backendProcess) {
    try { backendProcess.kill(); } catch(e) {}
  }
  console.log('[Watchdog] Starting backend...');
  backendProcess = spawn('C:\\Program Files\\nodejs\\node.exe', ['server.js'], {
    cwd: BACKEND_DIR,
    detached: false,
    stdio: 'inherit'
  });
  backendProcess.on('error', (err) => {
    console.error('[Watchdog] Backend error:', err.message);
    setTimeout(startBackend, 3000);
  });
  backendProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log('[Watchdog] Backend exited, restarting...');
      setTimeout(startBackend, 1000);
    }
  });
}

function startFrontend() {
  if (frontendProcess) {
    try { frontendProcess.kill(); } catch(e) {}
  }
  console.log('[Watchdog] Starting frontend...');
  frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: FRONTEND_DIR,
    detached: false,
    stdio: 'inherit'
  });
  frontendProcess.on('error', (err) => {
    console.error('[Watchdog] Frontend error:', err.message);
    setTimeout(startFrontend, 3000);
  });
  frontendProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log('[Watchdog] Frontend exited, restarting...');
      setTimeout(startFrontend, 1000);
    }
  });
}

console.log('[Watchdog] Device Management System Guardian starting...');
startBackend();
setTimeout(startFrontend, 2000);

process.on('SIGINT', () => {
  console.log('[Watchdog] Shutting down...');
  if (backendProcess) backendProcess.kill();
  if (frontendProcess) frontendProcess.kill();
  process.exit();
});
