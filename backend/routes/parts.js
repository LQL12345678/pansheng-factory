module.exports = (db, upload, excelDateToString) => {
  const express = require('express');
  const xlsx = require('xlsx');
  const path = require('path');
  const router = express.Router();

  // 延迟加载 wechat 服务（避免循环依赖）
  let wechatService = null;
  const getWechatService = () => {
    if (!wechatService) {
      wechatService = require('../services/wechat');
    }
    return wechatService;
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

  // ===== 数据库迁移：添加审批相关字段 =====
  try {
    // 检查 approval_status 字段是否存在
    const cols = db.prepare("PRAGMA table_info(inventory_logs)").all();
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('approval_status')) {
      db.exec('ALTER TABLE inventory_logs ADD COLUMN approval_status TEXT DEFAULT "approved"');
      // 将已有的领用记录标记为已通过（兼容旧数据）
      db.prepare(`UPDATE inventory_logs SET approval_status = 'approved' WHERE operation_type = '领用'`).run();
    }
    if (!colNames.includes('approver')) {
      db.exec('ALTER TABLE inventory_logs ADD COLUMN approver TEXT');
    }
    if (!colNames.includes('approval_time')) {
      db.exec('ALTER TABLE inventory_logs ADD COLUMN approval_time TEXT');
    }
    if (!colNames.includes('rejection_reason')) {
      db.exec('ALTER TABLE inventory_logs ADD COLUMN rejection_reason TEXT');
    }
    if (!colNames.includes('created_by')) {
      db.exec('ALTER TABLE inventory_logs ADD COLUMN created_by INTEGER');
    }
    if (!colNames.includes('updated_at')) {
      db.exec('ALTER TABLE inventory_logs ADD COLUMN updated_at TEXT');
    }
  } catch (e) {
    console.warn('inventory_logs 字段迁移跳过（可能已存在）:', e.message);
  }

  // 自动生成备件编号
  function genPartNo() {
    const last = db.prepare(
      'SELECT part_no FROM parts ORDER BY id DESC LIMIT 1'
    ).get();
    let n = 1;
    if (last && last.part_no) {
      // 支持 PART-0001 或纯数字格式
      const match = last.part_no.match(/(\d+)$/);
      if (match) n = parseInt(match[1]) + 1;
    }
    return 'PART-' + String(n).padStart(4, '0');
  }

  // 获取下一个备件编号
  router.get('/next-no', (req, res) => {
    res.json({ next_no: genPartNo() });
  });

  // ===== 零部件台账 CRUD =====
  router.get('/', (req, res) => {
    const { keyword } = req.query;
    let rows;
    const orderBy = `ORDER BY category, part_no, id`;
    if (keyword && keyword.trim()) {
      const k = `%${keyword.trim()}%`;
      rows = db.prepare(`
        SELECT * FROM parts
        WHERE part_no LIKE ? OR name LIKE ? OR spec LIKE ?
           OR brand LIKE ? OR storage_location LIKE ? OR applicable_devices LIKE ?
        ${orderBy}
      `).all(k, k, k, k, k, k);
    } else {
      rows = db.prepare(`SELECT * FROM parts ${orderBy}`).all();
    }
    res.json(rows);
  });

  // 新增备件（管理员）
  router.post('/', requireAdmin, (req, res) => {
    const d = req.body;
    try {
      const partNo = d.part_no || genPartNo();
      const r = db.prepare(`
        INSERT INTO parts (part_no, name, spec, brand, applicable_devices,
          storage_location, stock, safety_stock, unit, unit_price, supplier,
          purchase_cycle_days, remarks, category)
        VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        partNo, d.name, d.spec, d.brand ?? null, d.applicable_devices ?? null,
        d.storage_location, d.stock, d.safety_stock, d.unit ?? '个',
        d.unit_price ?? null, d.supplier ?? null, d.purchase_cycle_days ?? null,
        d.remarks ?? '', d.category ?? ''
      );
      // 写初始入库记录
      db.prepare(`
        INSERT INTO inventory_logs (log_no, log_date, part_id, operation_type,
          quantity, handler, remarks)
        VALUES (?,date('now','localtime'),?, '入库',?, '系统初始化', ?)
      `).run('INIT-' + Date.now(), r.lastInsertRowid, d.stock, d.remarks ?? '');
      res.json({ id: r.lastInsertRowid, part_no: partNo });
    } catch (e) {
      console.error('POST /parts error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 编辑备件（管理员）
  router.put('/:id', requireAdmin, (req, res) => {
    const d = req.body;
    try {
      db.prepare(`
        UPDATE parts SET part_no=?, name=?, spec=?, brand=?,
          applicable_devices=?, storage_location=?, stock=?, safety_stock=?,
          unit=?, unit_price=?, supplier=?, purchase_cycle_days=?, category=?
        WHERE id=?
      `).run(
        d.part_no ?? null, d.name, d.spec, d.brand ?? null,
        d.applicable_devices ?? null, d.storage_location,
        d.stock != null ? Number(d.stock) : 0,
        d.safety_stock != null ? Number(d.safety_stock) : 0,
        d.unit ?? '个', d.unit_price ?? null, d.supplier ?? null,
        d.purchase_cycle_days ?? null, d.category ?? '',
        req.params.id
      );
      res.json({ success: true });
    } catch (e) {
      console.error('PUT /parts/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 快速修改库存（行内编辑专用）
  router.patch('/:id/stock', (req, res) => {
    const { stock } = req.body;
    try {
      db.prepare('UPDATE parts SET stock=? WHERE id=?').run(Number(stock), req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error('PATCH /parts/:id/stock error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // 删除备件（仅超级管理员）
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    try {
      // 先删关联的出入库日志（外键约束），再删备件
      db.prepare('DELETE FROM inventory_logs WHERE part_id=?').run(req.params.id);
      db.prepare('DELETE FROM parts WHERE id=?').run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error('DELETE /parts/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 领用申请（待审批模式，不直接扣库存）=====
  // 生产干部提交领用申请 → 状态为 pending
  router.post('/usage', (req, res) => {
    const d = req.body;
    const partId = Number(d.part_id);
    const qty = Number(d.quantity) || 1;
    try {
      // 查当前库存
      const part = db.prepare('SELECT * FROM parts WHERE id=?').get(partId);
      if (!part) return res.status(404).json({ error: '备件不存在' });
      if (part.stock < qty) {
        return res.status(400).json({ error: `库存不足，当前库存为 ${part.stock}` });
      }

      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;
      const logNo = 'USE-' + Date.now();

      // 1. 写领用记录（状态为待审批，不扣库存）
      const insertResult = db.prepare(`
        INSERT INTO inventory_logs
          (log_no, log_date, part_id, operation_type, quantity, handler, remarks, line, purpose,
           approval_status, created_by)
        VALUES (?, ?, ?, '领用', ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        logNo,
        now.slice(0, 10),
        partId, qty,
        d.handler ?? '',
        d.remarks ?? '',
        d.line ?? '',
        d.purpose ?? '',
        req.session?.userId ?? null
      );

      // 2. 获取完整的领用记录
      const log = db.prepare('SELECT * FROM inventory_logs WHERE id=?').get(insertResult.lastInsertRowid);

      res.json({ success: true, message: '领用申请已提交，请等待设备管理人员审批' });

      // 3. 发送企业微信通知（异步，不阻塞响应）
      setImmediate(async () => {
        try {
          const wechat = getWechatService();
          await wechat.notifyUsageRequest(log, part);
        } catch (err) {
          console.error('发送领用申请通知失败:', err.message);
        }
      });
    } catch (e) {
      console.error('POST /parts/usage error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 管理员：获取待审批的领用申请列表 =====
  router.get('/usage/pending', requireAdmin, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT l.*, p.name as part_name, p.part_no as part_no_ref,
               p.spec as part_spec, p.unit as part_unit, p.stock as current_stock
        FROM inventory_logs l
        LEFT JOIN parts p ON p.id = l.part_id
        WHERE l.operation_type = '领用' AND l.approval_status = 'pending'
        ORDER BY l.id DESC
      `).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 管理员：审批通过（扣库存+发通知）=====
  router.post('/usage/:id/approve', requireAdmin, (req, res) => {
    const logId = Number(req.params.id);
    try {
      // 查申请记录
      const log = db.prepare(`
        SELECT l.*, p.name as part_name
        FROM inventory_logs l
        LEFT JOIN parts p ON p.id = l.part_id
        WHERE l.id = ? AND l.approval_status = 'pending'
      `).get(logId);
      if (!log) return res.status(404).json({ error: '领用申请不存在或已处理' });

      const partId = log.part_id;
      const qty = log.quantity;

      // 再次检查库存
      const part = db.prepare('SELECT * FROM parts WHERE id=?').get(partId);
      if (part.stock < qty) {
        return res.status(400).json({ error: `库存不足，当前库存为 ${part.stock}` });
      }

      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;

      // 事务：扣库存 + 更新审批状态
      db.exec('BEGIN');

      // 1. 扣库存
      db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(qty, partId);

      // 2. 更新审批状态为已通过
      db.prepare(`
        UPDATE inventory_logs
        SET approval_status = 'approved', approver = ?, approval_time = ?
        WHERE id = ?
      `).run(req.session?.username ?? '管理员', now, logId);

      // 提交事务
      db.exec('COMMIT');

      // 3. 发送微信通知（异步）- 发送领用记录已审批通过的通知
      setImmediate(async () => {
        try {
          const wechat = getWechatService();
          await wechat.notifyToolWithdrawApproved(log, part);
        } catch (err) {
          console.error('发送领用审批通过通知失败:', err.message);
        }
      });

      const updated = db.prepare('SELECT stock FROM parts WHERE id=?').get(partId);
      res.json({ success: true, remaining_stock: updated.stock });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      console.error('POST /parts/usage/:id/approve error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 管理员：驳回领用申请 =====
  router.post('/usage/:id/reject', requireAdmin, (req, res) => {
    const logId = Number(req.params.id);
    const { reason } = req.body;
    try {
      const log = db.prepare(`
        SELECT * FROM inventory_logs
        WHERE id = ? AND approval_status = 'pending'
      `).get(logId);
      if (!log) return res.status(404).json({ error: '领用申请不存在或已处理' });

      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;
      db.prepare(`
        UPDATE inventory_logs
        SET approval_status = 'rejected', approver = ?, approval_time = ?,
            rejection_reason = ?
        WHERE id = ?
      `).run(req.session?.username ?? '管理员', now, reason ?? '', logId);

      res.json({ success: true, message: '已驳回该领用申请' });
    } catch (e) {
      console.error('POST /parts/usage/:id/reject error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 管理员：修改领用申请（物品名称和数量）=====
  router.put('/usage/:id', requireAdmin, (req, res) => {
    const logId = Number(req.params.id);
    const { part_id, quantity } = req.body;
    try {
      // 查申请记录
      const log = db.prepare(`
        SELECT l.*, p.name as part_name, p.stock as current_stock
        FROM inventory_logs l
        LEFT JOIN parts p ON p.id = l.part_id
        WHERE l.id = ? AND l.approval_status = 'pending'
      `).get(logId);
      if (!log) return res.status(404).json({ error: '领用申请不存在或已处理' });

      // 验证新物品和数量
      const newPartId = part_id ? Number(part_id) : log.part_id;
      const newQty = quantity ? Number(quantity) : log.quantity;

      if (newQty <= 0) {
        return res.status(400).json({ error: '数量必须大于0' });
      }

      // 检查新物品库存
      const part = db.prepare('SELECT * FROM parts WHERE id=?').get(newPartId);
      if (!part) return res.status(404).json({ error: '物品不存在' });
      if (part.stock < newQty) {
        return res.status(400).json({ error: `库存不足，当前库存为 ${part.stock}` });
      }

      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;

      // 更新领用记录
      db.prepare(`
        UPDATE inventory_logs
        SET part_id = ?, quantity = ?, updated_at = ?
        WHERE id = ?
      `).run(newPartId, newQty, now, logId);

      // 获取更新后的记录
      const updated = db.prepare(`
        SELECT l.*, p.name as part_name, p.part_no as part_no_ref,
               p.spec as part_spec, p.unit as part_unit, p.stock as current_stock
        FROM inventory_logs l
        LEFT JOIN parts p ON p.id = l.part_id
        WHERE l.id = ?
      `).get(logId);

      res.json({ success: true, message: '修改成功', data: updated });
    } catch (e) {
      console.error('PUT /parts/usage/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 超级管理员：完整编辑领用记录（不限审批状态）=====
  router.put('/usage/:id/super', requireSuperAdmin, (req, res) => {
    const logId = Number(req.params.id);
    const { part_id, quantity, handler, line, log_date, purpose, remarks } = req.body;
    try {
      const log = db.prepare(`SELECT * FROM inventory_logs WHERE id = ? AND operation_type = '领用'`).get(logId);
      if (!log) return res.status(404).json({ error: '领用记录不存在' });

      const newPartId = part_id ? Number(part_id) : log.part_id;
      const newQty = quantity ? Number(quantity) : log.quantity;
      if (newQty <= 0) return res.status(400).json({ error: '数量必须大于0' });

      const part = db.prepare('SELECT * FROM parts WHERE id=?').get(newPartId);
      if (!part) return res.status(404).json({ error: '物品不存在' });

      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;

      // 如果已审批通过且修改了物品或数量，需要调整库存差值
      if (log.approval_status === 'approved' && (newPartId !== log.part_id || newQty !== log.quantity)) {
        if (newPartId !== log.part_id) {
          // 换了物品：归还旧物品库存，扣除新物品库存
          db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(log.quantity, log.part_id);
          db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(newQty, newPartId);
        } else {
          // 同物品改数量：差值调整
          const diff = newQty - log.quantity;
          db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(diff, newPartId);
        }
      }

      db.prepare(`
        UPDATE inventory_logs
        SET part_id = ?, quantity = ?, handler = ?, line = ?, log_date = ?, purpose = ?, remarks = ?, updated_at = ?
        WHERE id = ?
      `).run(
        newPartId, newQty,
        handler !== undefined ? handler : log.handler,
        line !== undefined ? line : log.line,
        log_date !== undefined ? log_date : log.log_date,
        purpose !== undefined ? purpose : log.purpose,
        remarks !== undefined ? remarks : log.remarks,
        now, logId
      );

      const updated = db.prepare(`
        SELECT l.*, p.name as part_name, p.part_no as part_no_ref,
               p.spec as part_spec, p.unit as part_unit, p.stock as current_stock
        FROM inventory_logs l LEFT JOIN parts p ON p.id = l.part_id WHERE l.id = ?
      `).get(logId);

      res.json({ success: true, message: '修改成功', data: updated });
    } catch (e) {
      console.error('PUT /parts/usage/:id/super error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 超级管理员：删除领用记录 =====
  router.delete('/usage/:id', requireSuperAdmin, (req, res) => {
    const logId = Number(req.params.id);
    try {
      const log = db.prepare(`SELECT * FROM inventory_logs WHERE id = ? AND operation_type = '领用'`).get(logId);
      if (!log) return res.status(404).json({ error: '领用记录不存在' });

      // 若已审批通过，删除时归还库存
      if (log.approval_status === 'approved') {
        db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(log.quantity, log.part_id);
      }

      db.prepare('DELETE FROM inventory_logs WHERE id = ?').run(logId);
      res.json({ success: true, message: '删除成功' });
    } catch (e) {
      console.error('DELETE /parts/usage/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 超级管理员：删除入库记录 =====
  router.delete('/stockin/:id', requireSuperAdmin, (req, res) => {
    const logId = Number(req.params.id);
    try {
      const log = db.prepare(`SELECT * FROM inventory_logs WHERE id = ? AND operation_type = '入库'`).get(logId);
      if (!log) return res.status(404).json({ error: '入库记录不存在' });

      // 删除入库记录时回滚库存（减去入库数量）
      db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(log.quantity, log.part_id);

      db.prepare('DELETE FROM inventory_logs WHERE id = ?').run(logId);
      res.json({ success: true, message: '删除成功' });
    } catch (e) {
      console.error('DELETE /parts/stockin/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 超级管理员：编辑入库记录 =====
  router.put('/stockin/:id', requireSuperAdmin, (req, res) => {
    const logId = Number(req.params.id);
    const { part_id, quantity, handler, log_date, remarks } = req.body;
    try {
      const log = db.prepare(`SELECT * FROM inventory_logs WHERE id = ? AND operation_type = '入库'`).get(logId);
      if (!log) return res.status(404).json({ error: '入库记录不存在' });

      const newPartId = part_id ? Number(part_id) : log.part_id;
      const newQty = quantity ? Number(quantity) : log.quantity;
      if (newQty <= 0) return res.status(400).json({ error: '数量必须大于0' });

      const part = db.prepare('SELECT * FROM parts WHERE id=?').get(newPartId);
      if (!part) return res.status(404).json({ error: '物品不存在' });

      const now = db.prepare("SELECT datetime('now', 'localtime') as t").get().t;

      // 调整库存差值
      if (newPartId !== log.part_id) {
        db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(log.quantity, log.part_id);
        db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(newQty, newPartId);
      } else {
        const diff = newQty - log.quantity;
        db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(diff, newPartId);
      }

      db.prepare(`
        UPDATE inventory_logs
        SET part_id = ?, quantity = ?, handler = ?, log_date = ?, remarks = ?, updated_at = ?
        WHERE id = ?
      `).run(
        newPartId, newQty,
        handler !== undefined ? handler : log.handler,
        log_date !== undefined ? log_date : log.log_date,
        remarks !== undefined ? remarks : log.remarks,
        now, logId
      );

      const updated = db.prepare(`
        SELECT l.*, p.name as part_name, p.part_no as part_no_ref,
               p.spec as part_spec, p.unit as part_unit, p.stock as current_stock
        FROM inventory_logs l LEFT JOIN parts p ON p.id = l.part_id WHERE l.id = ?
      `).get(logId);

      res.json({ success: true, message: '修改成功', data: updated });
    } catch (e) {
      console.error('PUT /parts/stockin/:id error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 入库接口 =====
  // 备件入库（管理员）
  router.post('/stockin', requireAdmin, (req, res) => {
    const d = req.body;
    const partId = Number(d.part_id);
    const qty = Number(d.quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: '入库数量必须为正整数' });
    try {
      const part = db.prepare('SELECT * FROM parts WHERE id=?').get(partId);
      if (!part) return res.status(404).json({ error: '备件不存在' });
      db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(qty, partId);
      db.prepare(`
        INSERT INTO inventory_logs
          (log_no, log_date, part_id, operation_type, quantity, handler, remarks)
        VALUES (?, ?, ?, '入库', ?, ?, ?)
      `).run(
        'IN-' + Date.now(),
        d.log_date || new Date().toISOString().slice(0, 10),
        partId, qty,
        d.handler ?? '',
        d.remarks ?? ''
      );
      const updated = db.prepare('SELECT stock FROM parts WHERE id=?').get(partId);
      res.json({ success: true, stock: updated.stock });
    } catch (e) {
      console.error('POST /parts/stockin error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 领用记录查询 =====
  router.get('/usage', (req, res) => {
    const { keyword, start_date, end_date, approval_status } = req.query;
    let sql = `
      SELECT l.*, p.name as part_name, p.part_no as part_no_ref, p.spec as part_spec, p.unit as part_unit
      FROM inventory_logs l
      LEFT JOIN parts p ON p.id = l.part_id
      WHERE l.operation_type = '领用'
    `;
    const params = [];
    if (keyword && keyword.trim()) {
      sql += ` AND (p.name LIKE ? OR p.part_no LIKE ? OR l.handler LIKE ?)`;
      const k = `%${keyword.trim()}%`;
      params.push(k, k, k);
    }
    if (start_date) { sql += ` AND l.log_date >= ?`; params.push(start_date); }
    if (end_date) { sql += ` AND l.log_date <= ?`; params.push(end_date); }
    if (approval_status) { sql += ` AND l.approval_status = ?`; params.push(approval_status); }
    sql += ' ORDER BY l.id DESC';
    try {
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 入库记录查询 =====
  router.get('/stockin', (req, res) => {
    const { keyword, start_date, end_date } = req.query;
    let sql = `
      SELECT l.*, p.name as part_name, p.part_no as part_no_ref, p.spec as part_spec, p.unit as part_unit
      FROM inventory_logs l
      LEFT JOIN parts p ON p.id = l.part_id
      WHERE l.operation_type = '入库'
    `;
    const params = [];
    if (keyword && keyword.trim()) {
      sql += ` AND (p.name LIKE ? OR p.part_no LIKE ? OR l.handler LIKE ?)`;
      const k = `%${keyword.trim()}%`;
      params.push(k, k, k);
    }
    if (start_date) { sql += ` AND l.log_date >= ?`; params.push(start_date); }
    if (end_date) { sql += ` AND l.log_date <= ?`; params.push(end_date); }
    sql += ' ORDER BY l.id DESC';
    try {
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 出入库记录（旧接口兼容） =====
  router.get('/logs', (req, res) => {
    const rows = db.prepare(`
      SELECT l.*, p.name as part_name
      FROM inventory_logs l
      LEFT JOIN parts p ON p.id = l.part_id
      ORDER BY l.id DESC
    `).all();
    res.json(rows);
  });

  router.post('/logs', (req, res) => {
    const d = req.body;
    const plano = d.log_no || ('IO-' + Date.now());
    if (d.operation_type === '出库') {
      db.prepare('UPDATE parts SET stock = stock - ? WHERE id = ?').run(d.quantity, d.part_id);
    } else if (d.operation_type === '入库') {
      db.prepare('UPDATE parts SET stock = stock + ? WHERE id = ?').run(d.quantity, d.part_id);
    } else if (d.operation_type === '盘点调整') {
      db.prepare('UPDATE parts SET stock = ? WHERE id = ?').run(d.quantity, d.part_id);
    } else if (d.operation_type === '报废') {
      db.prepare('UPDATE parts SET stock = stock - ? WHERE id = ?').run(d.quantity, d.part_id);
    }
    db.prepare(`
      INSERT INTO inventory_logs (log_no, log_date, part_id, operation_type,
        quantity, related_work_order, handler, remarks)
      VALUES (?,?, ?, ?, ?, ?, ?, ?)
    `).run(plano, d.log_date, d.part_id, d.operation_type,
      d.quantity, d.related_work_order || '', d.handler, d.remarks || '');
    res.json({ success: true });
  });

  // ===== Excel批量导入零部件台账 =====
  // Excel批量导入（管理员）
  router.post('/import', requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      let imported = 0, skipped = 0;
      for (let i = 4; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[1] || !row[2] || !row[5] || !row[6] || !row[7]) {
          if (row && row[1]) skipped++;
          continue;
        }
        try {
          db.prepare(`
            INSERT OR IGNORE INTO parts
              (part_no, name, spec, brand, applicable_devices,
               storage_location, stock, safety_stock, unit, unit_price, supplier,
               purchase_cycle_days, remarks)
            VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            row[0] ? String(row[0]) : null, String(row[1]), String(row[2]),
            String(row[3] || ''), String(row[4] || ''), String(row[5]),
            Number(row[6]) || 0, Number(row[7]) || 0,
            String(row[8] || '个'), row[9] ? Number(row[9]) : null,
            String(row[10] || ''), row[11] ? Number(row[11]) : null,
            String(row[12] || '')
          );
          imported++;
        } catch (e) { skipped++; }
      }
      res.json({ success: true, imported, skipped });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 低库存预警列表 =====
  router.get('/low-stock', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM parts WHERE stock < safety_stock ORDER BY stock ASC
    `).all();
    res.json(rows);
  });

  return router;
};
