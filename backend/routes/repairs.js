module.exports = (db, excelDateToString) => {
  const express = require('express');
  const router = express.Router();

  // 延迟加载 wechat 服务（避免循环依赖）
  let wechatService = null;
  const getWechatService = () => {
    if (!wechatService) {
      wechatService = require('../services/wechat');
    }
    return wechatService;
  };

  // ===== 权限中间件：检查登录 =====
  const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    next();
  };

  // ===== 权限中间件：检查管理员 =====
  const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    const role = req.session.role;
    if (role !== 'super_admin' && role !== 'admin') {
      return res.status(403).json({ error: '无权限操作' });
    }
    next();
  };

  // ===== 权限中间件：检查超级管理员 =====
  const requireSuperAdmin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    if (req.session.role !== 'super_admin') {
      return res.status(403).json({ error: '无权限操作：仅超级管理员可执行此操作' });
    }
    next();
  };

  // 生成工单编号
  function genWO() {
    const d = new Date();
    const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const prefix = 'WO-' + ds + '-';
    const last = db.prepare(
      'SELECT work_order_no FROM repairs WHERE work_order_no LIKE ? ORDER BY id DESC LIMIT 1'
    ).get(prefix + '%');
    let n = 1;
    if (last && last.work_order_no) {
      const parts = last.work_order_no.split('-');
      n = parseInt(parts[parts.length - 1]) + 1;
    }
    return prefix + String(n).padStart(3, '0');
  }

  // 获取下一个工单号
  router.get('/next-no', (req, res) => {
    res.json({ next_no: genWO() });
  });

  // 查询所有工单（支持筛选）
  router.get('/', (req, res) => {
    const { status, search, work_order_type, line } = req.query;
    let sql = `
      SELECT r.*, d.device_no, d.name as device_name, d.location as device_location
      FROM repairs r
      LEFT JOIN devices d ON d.id = r.device_id
      WHERE 1=1
      AND COALESCE(r.work_order_type, '设备维修') != '工具领用'
    `;
    const params = [];
    if (status && status !== '全部') {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (work_order_type && work_order_type !== '全部') {
      sql += ` AND COALESCE(r.work_order_type, '设备维修') = ?`;
      params.push(work_order_type);
    }
    if (line && line !== '全部' && line !== 'null') {
      const lineVal = String(line).replace(/线$/, '');
      sql += ` AND r.line LIKE ?`;
      params.push(`${lineVal}%`);
    }
    if (search && search.trim()) {
      const k = `%${search.trim()}%`;
      sql += ` AND (r.work_order_no LIKE ? OR r.line LIKE ? OR r.area LIKE ? OR r.fault_desc LIKE ? OR r.reporter LIKE ? OR r.repairman LIKE ?)`;
      params.push(k, k, k, k, k, k);
    }
    if (req.query.area && req.query.area !== '全部') {
      sql += ` AND r.area = ?`;
      params.push(req.query.area);
    }
    sql += ` ORDER BY r.report_date DESC, r.id DESC`;
    try {
      const rows = db.prepare(sql).all(...params);
      // 为每个工单加载更换零件（含备件编号）
      for (const row of rows) {
        row.parts = db.prepare(
          'SELECT rp.*, p.part_no FROM repair_parts rp LEFT JOIN parts p ON p.id = rp.part_id WHERE rp.repair_id=?'
        ).all(row.id);
      }
      res.json(rows);
    } catch (e) {
      console.error('GET /repairs error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 新增工单（生产干部可以新建报修）
  router.post('/', (req, res) => {
    const d = req.body;
    try {
      const woNo = d.work_order_no || genWO();
      const duration = d.duration_minutes || null;
      const stopDuration = d.stop_duration_minutes || null;
      const deviceId = d.device_id ? Number(d.device_id) : null;
      const r = db.prepare(`
        INSERT INTO repairs (work_order_no, report_date, report_time, device_id,
          line, reporter, area, fault_desc, fault_type, fault_cause, solution, parts_used,
          repairman, accept_time, finish_time, duration_minutes, stop_duration_minutes, status, remarks, work_order_type, fault_images)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        woNo, d.report_date || null, d.report_time || null, deviceId,
        d.line || null, d.reporter || null, d.area || null,
        d.fault_desc || null, d.fault_type || null, d.fault_cause || null, d.solution || null, d.parts_used || null,
        d.repairman || null, d.accept_time || null, d.finish_time || null, duration, stopDuration, d.status || '待处理', d.remarks || null,
        d.work_order_type || '设备维修', d.fault_images || null
      );
      // 更新设备状态（仅当有设备ID时）
      if (deviceId) {
        db.prepare("UPDATE devices SET status='维修中' WHERE id=?").run(deviceId);
      }

      // 发送微信通知（异步，不阻塞响应）
      const repairId = r.lastInsertRowid;
      setImmediate(async () => {
        try {
          const wechat = getWechatService();
          const repair = db.prepare('SELECT * FROM repairs WHERE id=?').get(repairId);
          if (repair) {
            await wechat.notifyRepair(repair, 'immediate');
          }
        } catch (err) {
          console.error('发送微信通知失败:', err.message);
        }
      });

      res.json({ id: r.lastInsertRowid, work_order_no: woNo });
    } catch (e) {
      console.error('POST /repairs error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 更新工单（管理员）
  router.put('/:id', requireAdmin, (req, res) => {
    const d = req.body;
    try {
      db.prepare(`
        UPDATE repairs SET report_date=?, report_time=?, device_id=?,
          line=?, reporter=?, area=?,
          fault_desc=?, fault_type=?, fault_cause=?, solution=?, parts_used=?,
          repairman=?, accept_time=?, finish_time=?, duration_minutes=?,
          stop_duration_minutes=?, status=?, remarks=?, work_order_type=?, fault_images=?
        WHERE id=?
      `).run(
        d.report_date, d.report_time, d.device_id,
        d.line || null, d.reporter || null, d.area || null,
        d.fault_desc, d.fault_type, d.fault_cause, d.solution, d.parts_used,
        d.repairman || null, d.accept_time || null, d.finish_time || null, d.duration_minutes,
        d.stop_duration_minutes || null, d.status, d.remarks, d.work_order_type || '设备维修',
        d.fault_images !== undefined ? d.fault_images : null, req.params.id
      );
      // 工单完成，恢复设备状态
      if (d.status === '已完成') {
        db.prepare("UPDATE devices SET status='正常' WHERE id=?").run(d.device_id);
      }
      res.json({ success: true });
    } catch (e) {
      console.error('PUT /repairs/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 删除工单（仅超级管理员）
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    try {
      db.prepare('DELETE FROM repairs WHERE id=?').run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error('DELETE /repairs/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Excel批量导入（管理员）
  router.post('/import', (req, res) => {
    res.json({ message: '请使用前端批量新增功能，或直接通过API逐条提交' });
  });

  // 标记处理中（管理员）
  router.post('/:id/start', requireAdmin, (req, res) => {
    try {
      // 使用数据库本地时间
      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;
      db.prepare(`UPDATE repairs SET status='处理中', accept_time=? WHERE id=?`)
        .run(now, req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error('POST /repairs/:id/start error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 完成工单（管理员）
  router.post('/:id/complete', requireAdmin, (req, res) => {
    const d = req.body;
    const repairId = Number(req.params.id);
    try {
      // 使用数据库本地时间
      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;
      const duration = d.duration_minutes ? Number(d.duration_minutes) : null;
      const stopDuration = d.stop_duration_minutes ? Number(d.stop_duration_minutes) : null;
      const parts = d.parts && Array.isArray(d.parts) ? d.parts : [];

      // 开始事务
      db.exec('BEGIN');

      // 1. 更新工单
      db.prepare(`
        UPDATE repairs SET
          status='已完成',
          finish_time=?,
          solution=?,
          fault_cause=?,
          parts_used=?,
          repairman=?,
          duration_minutes=?,
          stop_duration_minutes=?
        WHERE id=?
      `).run(
        now,
        d.solution || null,
        d.fault_cause || null,
        d.parts_used || null,
        d.repairman || null,
        duration,
        stopDuration,
        repairId
      );

      // 2. 删除旧的更换零件记录（支持重新完成）
      db.prepare('DELETE FROM repair_parts WHERE repair_id=?').run(repairId);

      // 3. 保存更换零件 + 扣减库存 + 写领用记录
      for (const item of parts) {
        const partId = Number(item.part_id);
        const qty = Number(item.quantity) || 1;

        // 检查库存是否充足
        const part = db.prepare('SELECT * FROM parts WHERE id=?').get(partId);
        if (!part) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: `备件不存在（ID: ${partId}）` });
        }
        if (part.stock < qty) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: `备件「${part.name}」库存不足！当前库存：${part.stock}，需要：${qty}` });
        }

        // 保存更换零件记录
        db.prepare(`
          INSERT INTO repair_parts (repair_id, part_id, part_name, quantity)
          VALUES (?, ?, ?, ?)
        `).run(repairId, partId, part.name, qty);

        // 扣减库存
        db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(qty, partId);

        // 写领用记录
        db.prepare(`
          INSERT INTO inventory_logs
            (log_no, log_date, part_id, operation_type, quantity, handler, remarks, related_work_order)
          VALUES (?, date('now','localtime'), ?, '领用', ?, ?, ?, ?)
        `).run(
          'USE-' + Date.now() + '-' + partId,
          partId,
          qty,
          d.repairman || '',
          '工单完成领用: ' + (d.work_order_no || repairId),
          d.work_order_no || ''
        );
      }

      // 4. 恢复设备状态
      const repair = db.prepare('SELECT device_id, work_order_no FROM repairs WHERE id=?').get(repairId);
      if (repair && repair.device_id) {
        db.prepare("UPDATE devices SET status='正常' WHERE id=?").run(repair.device_id);
      }

      // 提交事务
      db.exec('COMMIT');

      // 5. 发送工单完结微信通知（异步，不阻塞响应）
      setImmediate(async () => {
        try {
          const wechat = getWechatService();
          const completedRepair = db.prepare(`
            SELECT r.*, d.name as device_name
            FROM repairs r
            LEFT JOIN devices d ON d.id = r.device_id
            WHERE r.id=?
          `).get(repairId);
          if (completedRepair) {
            await wechat.notifyRepairCompleted(completedRepair);
          }
        } catch (err) {
          console.error('发送工单完结微信通知失败:', err.message);
        }
      });

      res.json({ success: true });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('POST /repairs/:id/complete error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 统计看板 API =====
  // 维修工单统计概览（支持 work_order_type 筛选）
  router.get('/stats/overview', (req, res) => {
    try {
      const { work_order_type } = req.query;
      const today = new Date().toISOString().slice(0, 10);
      const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      // 构建类型筛选 SQL 和参数（NULL 视为设备维修）
      const typeSql = (work_order_type && work_order_type !== '全部') ? " AND COALESCE(work_order_type, '设备维修') = ?" : '';
      const typeParam = (work_order_type && work_order_type !== '全部') ? [work_order_type] : [];

      const todayNew = db.prepare(
        'SELECT COUNT(*) as count FROM repairs WHERE report_date = ?' + typeSql
      ).get(today, ...typeParam).count;

      const inProgress = db.prepare(
        "SELECT COUNT(*) as count FROM repairs WHERE status = '处理中'" + typeSql
      ).get(...typeParam).count;

      const weekCompleted = db.prepare(
        "SELECT COUNT(*) as count FROM repairs WHERE status = '已完成' AND finish_time >= ?" + typeSql
      ).get(weekStart, ...typeParam).count;

      const weekTotal = db.prepare(
        'SELECT COUNT(*) as count FROM repairs WHERE report_date >= ?' + typeSql
      ).get(weekStart, ...typeParam).count;

      const weekRate = weekTotal > 0 ? Math.round(weekCompleted / weekTotal * 100) : 0;

      // 平均修复时间（最近30天已完成工单）
      const avgMTTR = db.prepare(
        `SELECT AVG(duration_minutes) as avg FROM repairs
         WHERE status = '已完成' AND finish_time >= datetime('now', '-30 day')`
        + typeSql
      ).get(...typeParam).avg || 0;

      res.json({
        todayNew,
        inProgress,
        weekCompleted,
        weekRate,
        avgMTTR: Math.round(avgMTTR * 10) / 10
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 高频故障设备排行（最近90天）
  router.get('/stats/high-frequency', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT
          d.name as deviceName,
          d.device_no as deviceNo,
          d.location as location,
          COUNT(r.id) as faultCount,
          ROUND(AVG(r.duration_minutes), 1) as avgDuration
        FROM repairs r
        JOIN devices d ON d.id = r.device_id
        WHERE r.created_at >= datetime('now', '-90 day')
        GROUP BY r.device_id
        ORDER BY faultCount DESC
        LIMIT 10
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 月度趋势（按工单类型分组，支持年份和线体筛选）
  router.get('/stats/monthly-trend', (req, res) => {
    try {
      const { year, line } = req.query;
      let where = 'WHERE 1=1';
      const params = [];

      if (year && year !== '全部') {
        where += " AND strftime('%Y', report_date) = ?";
        params.push(String(year));
      } else {
        // 默认最近12个月
        where += " AND report_date >= date('now', '-12 month')";
      }
      if (line && line !== '全部') {
        where += ' AND line = ?';
        params.push(String(line));
      }

      const rows = db.prepare(`
        SELECT
          strftime('%Y-%m', report_date) as month,
          COALESCE(work_order_type, '设备维修') as work_order_type,
          COUNT(*) as total,
          SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) as completed,
          ROUND(AVG(duration_minutes), 1) as avgDuration
        FROM repairs
        ${where}
        GROUP BY strftime('%Y-%m', report_date), COALESCE(work_order_type, '设备维修')
        ORDER BY month ASC, work_order_type
      `).all(...params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 线体维度统计表格（支持年份筛选）
  router.get('/stats/by-line', (req, res) => {
    try {
      const { year, line } = req.query;
      let where = 'WHERE 1=1';
      const params = [];

      if (year && year !== '全部') {
        where += " AND strftime('%Y', report_date) = ?";
        params.push(String(year));
      }
      if (line && line !== '全部') {
        where += ' AND line = ?';
        params.push(String(line));
      }

      const rows = db.prepare(`
        SELECT
          COALESCE(work_order_type, '设备维修') as work_order_type,
          line,
          COUNT(*) as total,
          SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) as completed,
          ROUND(SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as completionRate
        FROM repairs
        ${where}
        GROUP BY COALESCE(work_order_type, '设备维修'), line
        ORDER BY
          CASE COALESCE(work_order_type, '设备维修')
            WHEN '设备维修' THEN 1 WHEN '工具维修' THEN 2
            ELSE 3
          END,
          CASE line
            WHEN '1线' THEN 1 WHEN '2线' THEN 2 WHEN '3线' THEN 3
            WHEN '4线' THEN 4 WHEN 'VIP线' THEN 5
            WHEN '紫外' THEN 6 WHEN '紫外车间' THEN 6
            WHEN '工艺' THEN 7 WHEN '工艺组' THEN 7
            WHEN '设备' THEN 8 WHEN '设备组' THEN 8
            ELSE 99
          END, line
      `).all(...params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 汇总统计（总工单数+完成率，支持年份和线体筛选）
  router.get('/stats/summary', (req, res) => {
    try {
      const { year, line } = req.query;
      let where = 'WHERE 1=1';
      const params = [];

      if (year && year !== '全部') {
        where += " AND strftime('%Y', report_date) = ?";
        params.push(String(year));
      }
      if (line && line !== '全部') {
        where += ' AND line = ?';
        params.push(String(line));
      }

      const rows = db.prepare(`
        SELECT
          COALESCE(work_order_type, '设备维修') as work_order_type,
          COUNT(*) as total,
          SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) as completed,
          ROUND(SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as completionRate
        FROM repairs
        ${where}
        GROUP BY COALESCE(work_order_type, '设备维修')
      `).all(...params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 区域状态统计（用于首页热区地图）=====
  // 四个区域：装配段1、装配段2、老化房、后测段
  router.get('/zone-stats', (req, res) => {
    try {
      // 区域别名映射（area 字段的多种写法）
      const areaAliases = {
        '装配段1': ['组装段1', '组装段一', '装配段1', '装配段一', '机箱提升机', '机箱上料线'],
        '装配段2': ['组装段2', '组装段二', '装配段2', '装配段二'],
        '老化房': ['老化房'],
        '后测段': ['后侧段', '后测段', '后测', '机箱下料线', '下线提升机'],
      };

      // 4线 × 4段 = 16区域
      const zones = [
        { id: '1线-装配段1', label: '1线-装配段1', line: '1线', area: '装配段1', x: 0,  y: 0,  w: 13, h: 5 },
        { id: '1线-装配段2', label: '1线-装配段2', line: '1线', area: '装配段2', x: 13, y: 0,  w: 12, h: 5 },
        { id: '1线-老化房',  label: '1线-老化房',  line: '1线', area: '老化房',  x: 25, y: 0,  w: 10, h: 5 },
        { id: '1线-后测段',  label: '1线-后测段',  line: '1线', area: '后测段',  x: 35, y: 0,  w: 11, h: 5 },
        { id: '2线-装配段1', label: '2线-装配段1', line: '2线', area: '装配段1', x: 0,  y: 5,  w: 13, h: 5 },
        { id: '2线-装配段2', label: '2线-装配段2', line: '2线', area: '装配段2', x: 13, y: 5,  w: 12, h: 5 },
        { id: '2线-老化房',  label: '2线-老化房',  line: '2线', area: '老化房',  x: 25, y: 5,  w: 10, h: 5 },
        { id: '2线-后测段',  label: '2线-后测段',  line: '2线', area: '后测段',  x: 35, y: 5,  w: 11, h: 5 },
        { id: '3线-装配段1', label: '3线-装配段1', line: '3线', area: '装配段1', x: 0,  y: 10, w: 13, h: 5 },
        { id: '3线-装配段2', label: '3线-装配段2', line: '3线', area: '装配段2', x: 13, y: 10, w: 12, h: 5 },
        { id: '3线-老化房',  label: '3线-老化房',  line: '3线', area: '老化房',  x: 25, y: 10, w: 10, h: 5 },
        { id: '3线-后测段',  label: '3线-后测段',  line: '3线', area: '后测段',  x: 35, y: 10, w: 11, h: 5 },
        { id: '4线-装配段1', label: '4线-装配段1', line: '4线', area: '装配段1', x: 0,  y: 15, w: 13, h: 5 },
        { id: '4线-装配段2', label: '4线-装配段2', line: '4线', area: '装配段2', x: 13, y: 15, w: 12, h: 5 },
        { id: '4线-老化房',  label: '4线-老化房',  line: '4线', area: '老化房',  x: 25, y: 15, w: 10, h: 5 },
        { id: '4线-后测段',  label: '4线-后测段',  line: '4线', area: '后测段',  x: 35, y: 15, w: 11, h: 5 },
      ];

      // 构建 alias 扁平化映射: line+alias → 标准 area
      const aliasToArea = {};
      for (const [area, aliases] of Object.entries(areaAliases)) {
        for (const alias of aliases) {
          aliasToArea[alias] = area;
        }
      }
      const allAliases = Object.values(areaAliases).flat();
      const areaPlaceholders = allAliases.map(() => '?').join(',');

      // 每条线的区域别名相同，按 (line, area) 组合过滤
      const lines = ['1线', '2线', '3线', '4线'];
      const conditions = lines.map(() => `(line = ? AND area IN (${areaPlaceholders}))`).join(' OR ');
      const queryParams = lines.flatMap(line => [line, ...allAliases]);

      // 单次查询：按 line + area 分组统计待处理+处理中工单数
      const stats = db.prepare(`
        SELECT line, area, status, COUNT(*) as count
        FROM repairs
        WHERE (${conditions}) AND status IN ('待处理', '处理中')
        GROUP BY line, area, status
      `).all(...queryParams);

      // 构建查询索引: line+area+status → count
      const index = {};
      for (const s of stats) {
        if (s.status !== '待处理' && s.status !== '处理中') continue;
        const stdArea = aliasToArea[s.area] || s.area;
        index[`${s.line}|${stdArea}|${s.status}`] = (index[`${s.line}|${stdArea}|${s.status}`] || 0) + s.count;
      }

      const results = zones.map(zone => {
        const pending = index[`${zone.line}|${zone.area}|待处理`] || 0;
        const repairing = index[`${zone.line}|${zone.area}|处理中`] || 0;
        const total = pending + repairing;
        let status = 'normal';
        if (total > 0) {
          status = repairing > 0 ? 'repairing' : 'alert';
        }
        return {
          id: zone.id, label: zone.label,
          x: zone.x, y: zone.y, w: zone.w, h: zone.h,
          pendingCount: total,
          repairingCount: repairing,
          status,
        };
      });

      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 导出服务函数（供定时任务调用）=====
  const repairsService = {
    /**
     * 检查并发送待处理工单通知
     */
    notifyPendingRepairs: async () => {
      try {
        const wechat = getWechatService();
        const config = wechat.getNotificationConfig();

        if (!config || !config.enabled || !config.notify_scheduled) {
          return { success: false, message: '定时通知未启用' };
        }

        // 获取待处理工单（仅设备维修类型）
        const pendingRepairs = db.prepare(`
          SELECT * FROM repairs
          WHERE status IN ('待处理', '处理中')
          AND work_order_type = '设备维修'
          ORDER BY report_date ASC, id ASC
        `).all();

        if (pendingRepairs.length === 0) {
          return { success: true, message: '暂无待处理工单' };
        }

        // 发送汇总通知
        const result = await wechat.notifyRepair(pendingRepairs, 'scheduled');

        if (result.success) {
          // 更新最后通知时间
          wechat.updateNotificationConfig({});
          db.prepare("UPDATE notification_config SET last_notified_at = datetime('now', 'localtime') WHERE id = 1").run();
        }

        return {
          success: result.success,
          message: `已发送 ${pendingRepairs.length} 条待处理工单的通知`,
          count: pendingRepairs.length
        };
      } catch (err) {
        console.error('发送待处理工单通知失败:', err);
        return { success: false, message: err.message };
      }
    }
  };

  // 将服务绑定到 router 上，供外部调用
  router.repairsService = repairsService;

  return router;
};
