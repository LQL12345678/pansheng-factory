module.exports = (db, upload, excelDateToString) => {
  const express = require('express');
  const xlsx = require('xlsx');
  const path = require('path');
  const router = express.Router();

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

  // ===== 查询所有设备 =====
  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM devices ORDER BY
        CASE production_line
          WHEN '1线' THEN 1 WHEN '2线' THEN 2 WHEN '3线' THEN 3
          WHEN '4线' THEN 4 WHEN 'VIP线' THEN 5
          WHEN '紫外' THEN 6 WHEN '紫外车间' THEN 6
          WHEN '工艺' THEN 7 WHEN '工艺组' THEN 7
          WHEN '设备' THEN 8 WHEN '设备组' THEN 8
          ELSE 99
        END,
        production_line, device_no, id
    `).all();
    res.json(rows);
  });

  // ===== 新增单台设备（管理员）=====
  router.post('/', requireAdmin, (req, res) => {
    try {
      const d = req.body;
      
      // 宽松模式：所有字段均可选，自动处理空值
      const device_no = (d.device_no || '').toString().trim();
      const name = (d.name || '').toString().trim();
      const category = (d.category || '').toString().trim();
      const location = (d.location || '').toString().trim();
      const model = (d.model || '').toString().trim();
      const production_line = (d.production_line || '').toString().trim();
      const supplier = (d.supplier || '').toString().trim();
      const install_date = (d.install_date || '').toString();
      const maintenance_cycle_days = parseInt(d.maintenance_cycle_days) || 30;
      const responsible_person = (d.responsible_person || '').toString().trim();
      const status = (d.status || '正常').toString();
      const remarks = (d.remarks || '').toString().trim();
      
      // 基础必填检查（至少要有设备编号和名称）
      if (!device_no) return res.status(400).json({ error: '设备编号不能为空' });
      if (!name) return res.status(400).json({ error: '设备名称不能为空' });
      
      const r = db.prepare(`
        INSERT INTO devices (device_no, name, category, model, location,
          production_line, supplier, install_date, maintenance_cycle_days,
          responsible_person, status, remarks)
        VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?)
      `).run(
        device_no, name, category, model, location,
        production_line, supplier, install_date, maintenance_cycle_days,
        responsible_person, status, remarks
      );
      
      // 自动生成采购记录（可选，失败不阻塞主操作）
      try {
        const changeDate = d.install_date || new Date().toISOString().slice(0, 10);
        db.prepare(`
          INSERT INTO device_change_records (device_id, device_no, device_name, change_type, change_date, operator)
          VALUES (?, ?, ?, '采购', ?, '')
        `).run(r.lastInsertRowid, device_no, name, changeDate);
      } catch (e) {
        console.log('采购记录创建失败(不影响主操作):', e.message);
      }
      
      res.json({ id: r.lastInsertRowid });
    } catch (err) {
      console.error('新增设备失败:', err);
      res.status(500).json({ error: '服务器错误: ' + err.message });
    }
  });

  // ===== 更新设备（管理员）=====
  router.put('/:id', requireAdmin, (req, res) => {
    try {
      const d = req.body;
      
      // 宽松模式：所有字段均可选，自动处理空值
      const device_no = (d.device_no || '').toString().trim();
      const name = (d.name || '').toString().trim();
      const category = (d.category || '').toString().trim();
      const model = (d.model || '').toString().trim();
      const location = (d.location || '').toString().trim();
      const production_line = (d.production_line || '').toString().trim();
      const supplier = (d.supplier || '').toString().trim();
      const install_date = (d.install_date || '').toString();
      const maintenance_cycle_days = parseInt(d.maintenance_cycle_days) || 30;
      const responsible_person = (d.responsible_person || '').toString().trim();
      const status = (d.status || '正常').toString();
      const remarks = (d.remarks || '').toString().trim();
      
      // 基础必填检查
      if (!device_no) return res.status(400).json({ error: '设备编号不能为空' });
      if (!name) return res.status(400).json({ error: '设备名称不能为空' });
      
      db.prepare(`
        UPDATE devices SET device_no=?, name=?, category=?, model=?, location=?,
          production_line=?, supplier=?, install_date=?, maintenance_cycle_days=?,
          responsible_person=?, status=?, remarks=?, updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(
        device_no, name, category, model, location,
        production_line, supplier, install_date, maintenance_cycle_days,
        responsible_person, status, remarks,
        req.params.id
      );
      res.json({ success: true });
    } catch (err) {
      console.error('更新设备失败:', err);
      res.status(500).json({ error: '服务器错误: ' + err.message });
    }
  });

  // ===== 删除设备（仅超级管理员）=====
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    const id = req.params.id;
    // 1. 先解除维修记录的外键关联
    db.prepare('UPDATE repairs SET device_id=NULL WHERE device_id=?').run(id);
    // 2. 解除保养计划的外键关联
    db.prepare('UPDATE maintenance_plans SET device_id=NULL WHERE device_id=?').run(id);
    // 3. 删除设备变更记录（采购/报废记录）
    db.prepare('DELETE FROM device_change_records WHERE device_id=?').run(id);
    // 4. 最后删除设备
    db.prepare('DELETE FROM devices WHERE id=?').run(id);
    res.json({ success: true });
  });

  // ===== 报废设备（管理员）=====
  router.put('/:id/scrap', requireAdmin, (req, res) => {
    const { scrap_date, scrap_reason, scrap_person } = req.body;
    if (!scrap_date || !scrap_reason || !scrap_person) {
      return res.status(400).json({ error: '报废日期、原因、报废人均为必填' });
    }
    const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
    if (!device) return res.status(404).json({ error: '设备不存在' });
    if (device.status === '报废') return res.status(400).json({ error: '设备已报废，请勿重复操作' });
    db.prepare("UPDATE devices SET status='报废', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
    db.prepare(`
      INSERT INTO device_change_records (device_id, device_no, device_name, change_type, change_date, operator, reason)
      VALUES (?, ?, ?, '报废', ?, ?, ?)
    `).run(req.params.id, device.device_no, device.name, scrap_date, scrap_person, scrap_reason);
    res.json({ success: true });
  });

  // ===== 启用设备（恢复报废设备）（管理员）=====
  router.put('/:id/restore', requireAdmin, (req, res) => {
    const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
    if (!device) return res.status(404).json({ error: '设备不存在' });
    if (device.status !== '报废') return res.status(400).json({ error: '只有报废设备才能启用' });
    // 恢复设备状态为正常
    db.prepare("UPDATE devices SET status='正常', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
    // 删除该设备的报废记录
    db.prepare("DELETE FROM device_change_records WHERE device_id=? AND change_type='报废'").run(req.params.id);
    res.json({ success: true });
  });

  // ===== 采购/报废变更记录查询 =====
  // 注意：必须放在 /:id 之前，避免 change-records 被当作 :id 参数匹配
  router.get('/change-records', (req, res) => {
    const { type, keyword } = req.query;
    let sql = 'SELECT * FROM device_change_records WHERE 1=1';
    const params = [];
    if (type && type !== '全部') {
      sql += ' AND change_type = ?';
      params.push(type);
    }
    if (keyword) {
      sql += ' AND (device_no LIKE ? OR device_name LIKE ? OR operator LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    sql += ' ORDER BY change_date DESC, id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  // ===== 获取设备类别列表 =====
  // 注意：必须放在 /:id 之前，避免 categories 被当作 :id 参数匹配
  router.get('/categories/list', (req, res) => {
    const rows = db.prepare('SELECT name FROM device_categories ORDER BY name').all();
    res.json(rows.map(r => r.name));
  });

  // ===== 获取单台设备详情（含维修历史）=====
  router.get('/:id([0-9]+)', (req, res) => {
    const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
    if (!device) return res.status(404).json({ error: '设备不存在' });
    const repairs = db.prepare('SELECT * FROM repairs WHERE device_id=? ORDER BY id DESC').all(req.params.id);
    device.repairs = repairs;
    res.json(device);
  });

  // ===== Excel批量导入（管理员）=====
  router.post('/import', requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // 跳过说明行(第1行)、必填/可选行(第2行)、表头行(第3行)、示例行(第4行)
      // 实际数据从第5行开始（index=4）
      let imported = 0, skipped = 0;
      const errors = [];

      for (let i = 4; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0] || !row[1] || !row[2] || !row[4]) {
          if (row && row[0]) skipped++;
          continue;
        }
        try {
          const r = db.prepare(`
            INSERT OR IGNORE INTO devices
              (device_no, name, category, model, location, production_line,
               supplier, install_date, maintenance_cycle_days, responsible_person, status, remarks)
            VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?)
          `).run(
            String(row[0]), String(row[1]), String(row[2]), String(row[3]||''), String(row[4]),
            String(row[5]||''), String(row[6]||''), excelDateToString(row[7]), Number(row[8])||null,
            String(row[9]||''), String(row[10]||'正常'), String(row[11]||'')
          );
          if (r.changes > 0) {
            const changeDate = excelDateToString(row[7]) || new Date().toISOString().slice(0, 19).replace('T', ' ');
            db.prepare(`
              INSERT INTO device_change_records (device_id, device_no, device_name, change_type, change_date, operator)
              VALUES (?, ?, ?, '采购', ?, '')
            `).run(r.lastInsertRowid, String(row[0]), String(row[1]), changeDate);
          }
          imported++;
        } catch (e) {
          errors.push(`第${i+1}行：${e.message}`);
        }
      }
      res.json({ success: true, imported, skipped, errors });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
