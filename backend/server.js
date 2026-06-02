const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { db, init } = require('./db');

// ===== 全局错误处理：防止未捕获异常导致进程崩溃 =====
// ECONNRESET / ECONNABORTED 是 TCP 连接层面的正常断开（浏览器刷新、Vite 热更新等）
// 不需要为此退出进程，记录日志即可
const NETWORK_ERRORS = new Set(['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE']);

process.on('uncaughtException', (err) => {
  if (err.code && NETWORK_ERRORS.has(err.code)) {
    console.error('[NET] 连接断开（正常行为）:', err.message);
    return; // 网络级断开不退出进程
  }
  console.error('[FATAL] 未捕获异常:', err.message);
  console.error(err.stack);
  if (err.code === 'EADDRINUSE') {
    console.error('[FATAL] 端口被占用，5秒后退出...');
    setTimeout(() => process.exit(1), 5000);
  } else {
    // 真正的致命错误才退出
    console.error('[FATAL] 非网络类异常，退出进程');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason?.code && NETWORK_ERRORS.has(reason.code)) {
    console.error('[NET] Promise 连接断开（正常行为）:', reason.message);
    return;
  }
  console.error('[FATAL] 未处理的 Promise 拒绝:', reason);
  // 不退出进程，但记录详细日志以便排查
  if (reason && reason.stack) console.error(reason.stack);
});

// 优雅关闭：收到 SIGTERM/SIGINT 时先关闭服务器再退出
let server = null;
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] 收到 SIGTERM，正在关闭服务器...');
  if (server) server.close(() => process.exit(0));
  else process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[SHUTDOWN] 收到 SIGINT，正在关闭服务器...');
  if (server) server.close(() => process.exit(0));
  else process.exit(0);
});

const app = express();
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Session 配置：使用文件存储持久化 session
// 修复：增加重试次数、添加过期清理、加强错误处理
const sessionStore = new FileStore({
  path: path.join(__dirname, 'sessions'),
  retries: 5,         // 从 2 增加到 5，应对 Windows 文件锁
  ttl: 24 * 60 * 60,  // 24小时（秒）
  reapInterval: 3600, // 每小时清理一次过期 session（防止文件堆积）
  fileExtension: '.json',
  // 错误处理：防止 session 文件操作失败导致请求崩溃
  logFn: (msg) => {
    // 只记录非 ENOENT 的错误（文件不存在是正常情况）
    if (!msg.includes('ENOENT')) {
      console.warn('[session-store]', msg);
    }
  },
});

app.use(session({
  store: sessionStore,
  secret: 'equipment-management-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  rolling: true,      // 每次请求刷新过期时间
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24小时（毫秒）
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  },
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 初始化数据库（包含用户表初始化）
init();

// 上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ===== 通用工具：Excel日期序列号转日期字符串 =====
function excelDateToString(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  // Excel序列号转JS日期
  const d = new Date(Math.round((val - 25569) * 86400 * 1000));
  return d.toISOString().split('T')[0];
}

// ===== 用户路由（登录、登出、用户管理）=====
const userRouter = require('./routes/users')(db);
app.use('/api/users', userRouter);

// ===== 设备路由 =====
const deviceRouter = require('./routes/devices')(db, upload, excelDateToString);
app.use('/api/devices', deviceRouter);

// ===== 维修工单路由 =====
const repairRouter = require('./routes/repairs')(db, excelDateToString);
app.use('/api/repairs', repairRouter);

// ===== 零部件路由 =====
const partRouter = require('./routes/parts')(db, upload, excelDateToString);
app.use('/api/parts', partRouter);

// ===== 工具台账路由 =====
const toolRouter = require('./routes/tools')(db, upload, excelDateToString);
app.use('/api/tools', toolRouter);

// ===== 保养计划路由 =====
const maintenanceRouter = require('./routes/maintenance')(db, excelDateToString);
app.use('/api/maintenance', maintenanceRouter);

// ===== 通知配置路由 =====
const notificationRouter = require('./routes/notifications')(db);
app.use('/api/notifications', notificationRouter);

// ===== 现场改善/通用型事项申请与处理 =====
const improvementRouter = require('./routes/improvements')(db);
app.use('/api/improvements', improvementRouter);

// ===== 值班巡查 =====
const inspectionRouter = require('./routes/inspections');
app.use('/api/inspections', inspectionRouter);

// ===== 设备排班 =====
const scheduleRouter = require('./routes/schedule')(db);
app.use('/api/schedule', scheduleRouter);

// ===== 统计看板 =====
app.get('/api/stats/overview', (req, res) => {
  const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices').get().count;
  const repairCount = db.prepare("SELECT COUNT(*) as count FROM repairs WHERE status != '已完成'").get().count;
  const partCount = db.prepare('SELECT COUNT(*) as count FROM parts').get().count;
  const lowStockCount = db.prepare('SELECT COUNT(*) as count FROM parts WHERE stock < safety_stock').get().count;
  res.json({ deviceCount, repairCount, partCount, lowStockCount });
});

// 故障频率统计
app.get('/api/stats/fault-frequency', (req, res) => {
  const rows = db.prepare(`
    SELECT d.name as deviceName, d.device_no as deviceNo,
           COUNT(r.id) as faultCount,
           ROUND(AVG(r.duration_minutes), 1) as avgDuration
    FROM repairs r
    JOIN devices d ON d.id = r.device_id
    WHERE r.created_at >= datetime('now', '-90 day')
    GROUP BY r.device_id
    ORDER BY faultCount DESC
    LIMIT 20
  `).all();
  res.json(rows);
});

// 故障类型分布
app.get('/api/stats/fault-types', (req, res) => {
  const rows = db.prepare(`
    SELECT fault_type as name, COUNT(*) as value
    FROM repairs
    WHERE fault_type IS NOT NULL AND created_at >= datetime('now', '-90 day')
    GROUP BY fault_type
    ORDER BY value DESC
  `).all();
  res.json(rows);
});

// 低库存列表
app.get('/api/stats/low-stock', (req, res) => {
  const rows = db.prepare(`
    SELECT part_no, name, spec, stock, safety_stock, storage_location
    FROM parts WHERE stock < safety_stock
    ORDER BY stock ASC
  `).all();
  res.json(rows);
});

// 停线时长按月统计
app.get('/api/stats/stop-duration-by-month', (req, res) => {
  const { year, line } = req.query;
  let where = 'WHERE stop_duration_minutes IS NOT NULL AND stop_duration_minutes > 0';
  const params = [];

  if (year && year !== '全部') {
    where += " AND strftime('%Y', report_date) = ?";
    params.push(String(year));
  } else {
    where += " AND report_date >= date('now', '-12 month')";
  }
  if (line && line !== '全部') {
    where += ' AND line = ?';
    params.push(String(line));
  }

  const rows = db.prepare(`
    SELECT 
      strftime('%Y-%m', report_date) as month,
      SUM(stop_duration_minutes) as totalMinutes,
      ROUND(AVG(stop_duration_minutes), 1) as avgMinutes,
      COUNT(*) as orderCount
    FROM repairs
    ${where}
    GROUP BY strftime('%Y-%m', report_date)
    ORDER BY month ASC
  `).all(...params);
  res.json(rows);
});

// 线体故障率按月统计（用于折线图）
app.get('/api/stats/fault-rate-by-month', (req, res) => {
  const { year, line } = req.query;
  let where = 'WHERE 1=1';
  const params = [];

  if (year && year !== '全部') {
    where += " AND strftime('%Y', r.report_date) = ?";
    params.push(String(year));
  } else {
    where += " AND r.report_date >= date('now', '-12 month')";
  }
  if (line && line !== '全部') {
    where += ' AND r.line = ?';
    params.push(String(line));
  }

  const rows = db.prepare(`
    SELECT 
      strftime('%Y-%m', r.report_date) as month,
      r.line,
      COUNT(*) as faultCount,
      ROUND(AVG(r.duration_minutes), 1) as avgDuration
    FROM repairs r
    ${where}
    AND r.line IS NOT NULL AND r.line != ''
    GROUP BY strftime('%Y-%m', r.report_date), r.line
    ORDER BY month ASC, faultCount DESC
  `).all(...params);
  res.json(rows);
});

// ===== 辅助函数 =====
function formatDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDateMD(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${m}月${day}日`;
}

// ===== ISO 周辅助函数 =====
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1=周一...7=周日
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 最近的周四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getMonday(d) {
  const date = new Date(d.getTime());
  date.setHours(12, 0, 0, 0);
  const day = date.getDay(); // 0=周日，1=周一...
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const result = new Date(date.setDate(diff));
  result.setHours(0, 0, 0, 0);
  return result;
}

  // ===== 周度设备运行统计（含排班系统运行天数）=====
  // GET /api/stats/weekly?year=2026&month=5
  // 返回与该月重叠的所有 ISO 周（周一~周日），running_days 从 production_schedule 自动统计
  app.get('/api/stats/weekly', (req, res) => {
  // 强制 WAL checkpoint，确保读取到最新写入的工单数据
  try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch (_) {}

  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: '缺少 year 或 month 参数' });

  const y = parseInt(String(year));
  const m = parseInt(String(month));

  // 计算与该月重叠的所有 ISO 周（周一~周日）
  const weeks = [];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);

  let currentMonday = getMonday(firstDay);

  while (currentMonday <= lastDay) {
    const weekStart = new Date(currentMonday);
    const weekEnd = new Date(currentMonday);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // 只保留与该月有重叠的周
    if (weekEnd >= firstDay) {
      const isoWeek = getISOWeek(weekStart);
      const startMonth = weekStart.getMonth() + 1;
      const endMonth = weekEnd.getMonth() + 1;

      let monthLabel;
      if (startMonth === endMonth) {
        monthLabel = `${startMonth}月`;
      } else if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
        // 跨年周（12月->1月），按参考逻辑显示为次年1月
        monthLabel = `1月`;
      } else {
        monthLabel = `${startMonth}月/${endMonth}月`;
      }

      weeks.push({
        week: isoWeek,
        week_label: `第${isoWeek}周`,
        start_date: formatDate(weekStart),
        end_date: formatDate(weekEnd),
        full_label: `第${isoWeek}周（${formatDateMD(weekStart)}~${formatDateMD(weekEnd)}）`,
        month_label: monthLabel,
      });
    }

    currentMonday.setDate(currentMonday.getDate() + 7);
  }

  // 从数据库读取已保存的手动数据
  const saved = db.prepare(`
    SELECT week, week_label, running_hours, repeat_fault_count, updated_at
    FROM weekly_stats WHERE year = ? AND month = ?
  `).all(y, m);
  const savedMap = {};
  for (const s of saved) savedMap[s.week] = s;

  // 设备总数（从 devices 表）
  const deviceTotal = db.prepare('SELECT COUNT(*) as total FROM devices').get().total;

  // ===== 从排班系统统计每周运行天数 =====
  // 对每一条线（A/B/C/D）统计该周 status=1（运行中）的天数，求和得到 running_days
  const runningDaysByWeek = {};
  // 一次性查询所有排班数据（范围覆盖所有周的起止日期）
  const allStartDate = weeks[0]?.start_date;
  const allEndDate = weeks[weeks.length - 1]?.end_date;
  if (allStartDate && allEndDate) {
    const scheduleRows = db.prepare(`
      SELECT schedule_date, line_code, status
      FROM production_schedule
      WHERE schedule_date >= ? AND schedule_date <= ?
      ORDER BY schedule_date
    `).all(allStartDate, allEndDate);

    // 构建 date+line 索引
    const scheduleMap = {};
    for (const row of scheduleRows) {
      const key = `${row.schedule_date}|${row.line_code}`;
      scheduleMap[key] = row.status;
    }

    // 对每个周、每条线统计运行天数
    for (const w of weeks) {
      let totalRunningDays = 0;
      const ws = new Date(w.start_date);
      const we = new Date(w.end_date);
      const lineCodes = ['A', 'B', 'C', 'D'];
      
      for (const lc of lineCodes) {
        let lineRunningDays = 0;
        let d = new Date(ws);
        while (d <= we) {
          const dateStr = formatDate(d);
          const key = `${dateStr}|${lc}`;
          // 如果有排班记录则取实际状态，无记录默认 status=1（运行中）
          const status = scheduleMap[key] !== undefined ? scheduleMap[key] : 1;
          if (status === 1) lineRunningDays++;
          d.setDate(d.getDate() + 1);
        }
        totalRunningDays += lineRunningDays;
      }
      runningDaysByWeek[w.week] = totalRunningDays;
    }
  }

  // 从工单表自动统计该月所有日期范围内的故障次数和停机时长
  const startStr = `${y}-${String(m).padStart(2, '0')}-01`;
  const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

  // 按工单report_date统计
  const repairStats = db.prepare(`
    SELECT
      report_date,
      COUNT(*) as fault_count,
      SUM(COALESCE(stop_duration_minutes, 0)) as total_stop_minutes
    FROM repairs
    WHERE work_order_type = '设备维修'
      AND report_date >= ?
      AND report_date <= ?
    GROUP BY report_date
  `).all(startStr, endStr);

  // 将每日数据聚合到周
  const repairByWeek = {};
  for (const w of weeks) {
    repairByWeek[w.week] = { fault_count: 0, total_stop_minutes: 0 };
  }
  for (const row of repairStats) {
    const d = new Date(row.report_date);
    for (const w of weeks) {
      const ws = new Date(w.start_date);
      const we = new Date(w.end_date);
      if (d >= ws && d <= we) {
        repairByWeek[w.week].fault_count += row.fault_count;
        repairByWeek[w.week].total_stop_minutes += row.total_stop_minutes;
        break;
      }
    }
  }

  // 合并数据
  const result = weeks.map(w => ({
    ...w,
    year: y,
    month: m,
    device_total: deviceTotal,
    running_hours: savedMap[w.week]?.running_hours ?? null,
    running_days: runningDaysByWeek[w.week] ?? null,
    repeat_fault_count: savedMap[w.week]?.repeat_fault_count ?? null,
    fault_count: repairByWeek[w.week]?.fault_count ?? 0,
    stop_minutes: repairByWeek[w.week]?.total_stop_minutes ?? 0,
    updated_at: savedMap[w.week]?.updated_at ?? null,
  }));

  res.json(result);
});

// POST /api/stats/weekly — 保存/更新手动填写数据
app.post('/api/stats/weekly', (req, res) => {
  const { year, month, week, running_hours, repeat_fault_count } = req.body;
  if (!year || !month || !week) return res.status(400).json({ error: '缺少必要参数' });

  // 只更新请求体中实际携带的字段，未传的字段保留原值（避免 undefined -> null 覆盖已有数据）
  const bodyHasRH = Object.prototype.hasOwnProperty.call(req.body, 'running_hours');
  const bodyHasRFC = Object.prototype.hasOwnProperty.call(req.body, 'repeat_fault_count');

  if (bodyHasRH || bodyHasRFC) {
    // 先获取当前值（如果行已存在）
    const existing = db.prepare('SELECT running_hours, repeat_fault_count FROM weekly_stats WHERE year = ? AND month = ? AND week = ?').get(year, month, week);
    const curRH = existing?.running_hours ?? null;
    const curRFC = existing?.repeat_fault_count ?? null;

    const newRH = bodyHasRH ? (running_hours ?? null) : curRH;
    const newRFC = bodyHasRFC ? (repeat_fault_count ?? null) : curRFC;

    db.prepare(`
      INSERT INTO weekly_stats (year, month, week, week_label, running_hours, repeat_fault_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(year, month, week) DO UPDATE SET
        running_hours = excluded.running_hours,
        repeat_fault_count = excluded.repeat_fault_count,
        updated_at = datetime('now', 'localtime')
    `).run(year, month, week, `第${week}周`, newRH, newRFC);
  }

  res.json({ success: true });
});

// ===== 数据版本检查（用于智能刷新）=====
app.get('/api/data-version', (req, res) => {
  const devicesVersion = db.prepare("SELECT MAX(updated_at) as version FROM devices").get()?.version || '';
  const repairsVersion = db.prepare("SELECT MAX(updated_at) as version FROM repairs").get()?.version || '';
  const partsVersion = db.prepare("SELECT MAX(updated_at) as version FROM parts").get()?.version || '';
  res.json({
    devices: devicesVersion,
    repairs: repairsVersion,
    parts: partsVersion,
    timestamp: Date.now()
  });
});

// ===== Express 全局错误处理中间件（必须放在所有路由之后）=====
// 捕获路由处理中的未处理异常，防止整个进程崩溃
app.use((err, req, res, _next) => {
  console.error('[ERROR] 请求处理异常:', err.message);
  console.error('  请求路径:', req.method, req.originalUrl);
  if (err.stack) console.error(err.stack);

  // 区分不同类型的错误
  if (err.code === 'SQLITE_ERROR' || err.code === 'SQLITE_BUSY') {
    return res.status(500).json({ error: '数据库操作失败，请稍后重试' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求数据格式错误' });
  }

  res.status(500).json({ error: '服务器内部错误，请稍后重试' });
});

// ===== 404 处理（放在错误中间件之前）=====
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

const PORT = 3001;
server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 设备管理系统后端启动成功：http://localhost:${PORT}`);
  console.log(`📱 局域网访问：http://<你的IP>:${PORT}`);
});

// 捕获 TCP 连接层异常（ECONNRESET等），防止上抛到 uncaughtException
server.on('connection', (socket) => {
  socket.on('error', (err) => {
    if (err.code && NETWORK_ERRORS.has(err.code)) {
      // 浏览器刷新/断开导致的 ECONNRESET，忽略
      return;
    }
    console.error('[SOCKET] 连接错误:', err.code, err.message);
  });
});

// 捕获 HTTP 客户端请求错误（请求未解析完成时连接断开）
server.on('clientError', (err, socket) => {
  if (err.code && NETWORK_ERRORS.has(err.code)) {
    // 浏览器刷新导致的，直接销毁 socket 即可
    socket.destroy();
    return;
  }
  console.error('[CLIENT] 客户端错误:', err.code, err.message);
  socket.destroy();
});
