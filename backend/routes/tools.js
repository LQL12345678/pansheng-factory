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

  // ===== 查询所有工具 =====
  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM tools ORDER BY
        CASE line
          WHEN '1线' THEN 1 WHEN '2线' THEN 2 WHEN '3线' THEN 3
          WHEN '4线' THEN 4 WHEN 'VIP线' THEN 5
          WHEN '紫外' THEN 6 WHEN '紫外车间' THEN 6
          WHEN '工艺' THEN 7 WHEN '工艺组' THEN 7
          WHEN '设备' THEN 8 WHEN '设备组' THEN 8
          ELSE 99
        END,
        line, name, id
    `).all();
    res.json(rows);
  });

  // ===== 新增工具（管理员）=====
  router.post('/', requireAdmin, (req, res) => {
    const d = req.body;
    const r = db.prepare(`
      INSERT INTO tools (name, line, model, device_no, station, quantity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.name || '', d.line || '', d.model || '', d.device_no || '', d.station || '',
      parseInt(d.quantity) || 1, d.status || '正常'
    );
    // 自动生成采购记录
    const now = new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO tool_change_records (tool_id, tool_name, change_type, change_date, operator)
      VALUES (?, ?, '采购', ?, '')
    `).run(r.lastInsertRowid, d.name || '', now);
    res.json({ id: r.lastInsertRowid });
  });

  // ===== 更新工具（管理员）=====
  router.put('/:id', requireAdmin, (req, res) => {
    const d = req.body;
    db.prepare(`
      UPDATE tools SET name=?, line=?, model=?, device_no=?, station=?, quantity=?,
        status=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(
      d.name || '', d.line || '', d.model || '', d.device_no || '', d.station || '',
      parseInt(d.quantity) || 1,
      d.status || '正常',
      req.params.id
    );
    res.json({ success: true });
  });

  // ===== 删除工具（仅超级管理员）=====
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    db.prepare('DELETE FROM tool_change_records WHERE tool_id=?').run(req.params.id);
    db.prepare('DELETE FROM tools WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // ===== 报废工具（管理员）=====
  router.put('/:id/scrap', requireAdmin, (req, res) => {
    const { scrap_date, scrap_reason, scrap_person } = req.body;
    if (!scrap_date || !scrap_reason || !scrap_person) {
      return res.status(400).json({ error: '报废日期、原因、报废人均为必填' });
    }
    const tool = db.prepare('SELECT * FROM tools WHERE id=?').get(req.params.id);
    if (!tool) return res.status(404).json({ error: '工具不存在' });
    if (tool.status === '报废') return res.status(400).json({ error: '工具已报废，请勿重复操作' });
    db.prepare("UPDATE tools SET status='报废', updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
    db.prepare(`
      INSERT INTO tool_change_records (tool_id, tool_name, change_type, change_date, operator, reason)
      VALUES (?, ?, '报废', ?, ?, ?)
    `).run(req.params.id, tool.name, scrap_date, scrap_person, scrap_reason);
    res.json({ success: true });
  });

  // ===== 采购/报废变更记录查询 =====
  router.get('/change-records', (req, res) => {
    const { type, keyword } = req.query;
    let sql = 'SELECT * FROM tool_change_records WHERE 1=1';
    const params = [];
    if (type && type !== '全部') {
      sql += ' AND change_type = ?';
      params.push(type);
    }
    if (keyword) {
      sql += ' AND (tool_name LIKE ? OR operator LIKE ? OR reason LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    sql += ' ORDER BY change_date DESC, id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  // ===== 获取单台工具详情 =====
  router.get('/:id([0-9]+)', (req, res) => {
    const tool = db.prepare('SELECT * FROM tools WHERE id=?').get(req.params.id);
    if (!tool) return res.status(404).json({ error: '工具不存在' });
    res.json(tool);
  });

  // ===== Excel批量导入（管理员）=====
  router.post('/import', requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    try {
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      let imported = 0, skipped = 0;
      const errors = [];

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) { if (row) skipped++; continue; }
        try {
          const r = db.prepare(`
            INSERT INTO tools (name, line, model, device_no, station, quantity, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            String(row[1]||''), String(row[0]||''), String(row[2]||''),
            String(row[3]||''), String(row[4]||''), parseInt(row[5]) || 1,
            String(row[6]||'正常')
          );
          const now = new Date().toISOString().slice(0, 10);
          db.prepare(`
            INSERT INTO tool_change_records (tool_id, tool_name, change_type, change_date, operator)
            VALUES (?, ?, '采购', ?, '')
          `).run(r.lastInsertRowid, String(row[1]||''), now);
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
