module.exports = (db, excelDateToString) => {
  const express = require('express');
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

  // 生成计划编号
  function genMP() {
    const d = new Date();
    const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const prefix = 'MP-' + ds + '-';
    const last = db.prepare(
      'SELECT plan_no FROM maintenance_plans WHERE plan_no LIKE ? ORDER BY id DESC LIMIT 1'
    ).get(prefix + '%');
    let n = 1;
    if (last && last.plan_no) {
      n = parseInt(last.plan_no.split('-')[2]) + 1;
    }
    return prefix + String(n).padStart(3, '0');
  }

  // 获取下一个计划编号
  router.get('/next-no', (req, res) => {
    res.json({ next_no: genMP() });
  });

  // 查询保养计划（含更换零部件）
  router.get('/', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT m.*,
          GROUP_CONCAT(mp.part_id) as part_ids,
          GROUP_CONCAT(mp.part_name) as part_names,
          GROUP_CONCAT(mp.quantity) as part_quantities
        FROM maintenance_plans m
        LEFT JOIN maintenance_parts mp ON mp.maintenance_plan_id = m.id
        GROUP BY m.id
        ORDER BY m.plan_date DESC
      `).all();

      // 解析 parts 数组
      const result = rows.map(r => {
        const item = { ...r };
        if (r.part_ids) {
          const ids = r.part_ids.split(',');
          const names = r.part_names.split(',');
          const qtys = r.part_quantities.split(',');
          item.parts = ids.map((id, i) => ({
            part_id: Number(id),
            part_name: names[i] || '',
            quantity: Number(qtys[i]) || 1
          }));
        } else {
          item.parts = [];
        }
        delete item.part_ids;
        delete item.part_names;
        delete item.part_quantities;
        return item;
      });

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 新增计划（管理员）
  router.post('/', requireAdmin, (req, res) => {
    try {
      const d = req.body;
      const planNo = d.plan_no || genMP();
      const r = db.prepare(`
        INSERT INTO maintenance_plans
          (plan_no, maintenance_type, task_desc, plan_date,
           responsible_person, wechat_id, required_parts, estimated_duration,
           actual_date, status, executor, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planNo,
        d.maintenance_type || '',
        d.task_desc || '',
        d.plan_date || '',
        d.responsible_person || '',
        d.wechat_id || '',
        d.required_parts || '',
        d.estimated_duration ? Number(d.estimated_duration) : null,
        d.actual_date || null,
        d.status || '待执行',
        d.executor || '',
        d.remarks || ''
      );

      // 保存更换零部件 + 扣减库存 + 写领用记录
      const planId = Number(r.lastInsertRowid);
      const parts = d.parts && Array.isArray(d.parts) ? d.parts : [];
      if (parts.length > 0) {
        db.exec('BEGIN');
        try {
          for (const item of parts) {
            const partId = Number(item.part_id);
            const qty = Number(item.quantity) || 1;

            const part = db.prepare('SELECT * FROM parts WHERE id=?').get(partId);
            if (!part) {
              db.exec('ROLLBACK');
              return res.status(400).json({ error: `备件不存在（ID: ${partId}）` });
            }
            if (part.stock < qty) {
              db.exec('ROLLBACK');
              return res.status(400).json({ error: `备件「${part.name}」库存不足！当前库存：${part.stock}，需要：${qty}` });
            }

            db.prepare(`
              INSERT INTO maintenance_parts (maintenance_plan_id, part_id, part_name, quantity)
              VALUES (?, ?, ?, ?)
            `).run(planId, partId, part.name, qty);

            db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(qty, partId);

            db.prepare(`
              INSERT INTO inventory_logs
                (log_no, log_date, part_id, operation_type, quantity, handler, remarks, related_work_order)
              VALUES (?, date('now','localtime'), ?, '领用', ?, ?, ?, ?)
            `).run(
              'USE-' + Date.now() + '-' + partId,
              partId,
              qty,
              d.executor || d.responsible_person || '',
              '保养领用: ' + planNo,
              planNo
            );
          }
          db.exec('COMMIT');
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch (_) {}
          return res.status(500).json({ error: e.message });
        }
      }

      res.json({ id: planId, plan_no: planNo });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 更新计划（管理员）
  router.put('/:id', requireAdmin, (req, res) => {
    try {
      const d = req.body;
      const planId = Number(req.params.id);

      db.prepare(`
        UPDATE maintenance_plans SET
          plan_no=?, maintenance_type=?, task_desc=?,
          plan_date=?, responsible_person=?, wechat_id=?,
          required_parts=?, estimated_duration=?,
          actual_date=?, status=?, executor=?, remarks=?
        WHERE id=?
      `).run(
        d.plan_no,
        d.maintenance_type,
        d.task_desc,
        d.plan_date,
        d.responsible_person,
        d.wechat_id || '',
        d.required_parts || '',
        d.estimated_duration ? Number(d.estimated_duration) : null,
        d.actual_date || null,
        d.status || '待执行',
        d.executor || '',
        d.remarks || '',
        planId
      );

      // 处理更换零部件
      const parts = d.parts && Array.isArray(d.parts) ? d.parts : [];
      // 先获取旧的 parts 记录，用于回滚库存
      const oldParts = db.prepare(
        'SELECT * FROM maintenance_parts WHERE maintenance_plan_id=?'
      ).all(planId);

      db.exec('BEGIN');
      try {
        // 删除旧记录并恢复库存
        for (const old of oldParts) {
          db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(
            Number(old.quantity), Number(old.part_id)
          );
        }
        db.prepare('DELETE FROM maintenance_parts WHERE maintenance_plan_id=?').run(planId);

        // 插入新记录并扣减库存
        for (const item of parts) {
          const partId = Number(item.part_id);
          const qty = Number(item.quantity) || 1;

          const part = db.prepare('SELECT * FROM parts WHERE id=?').get(partId);
          if (!part) {
            db.exec('ROLLBACK');
            return res.status(400).json({ error: `备件不存在（ID: ${partId}）` });
          }
          if (part.stock < qty) {
            db.exec('ROLLBACK');
            return res.status(400).json({ error: `备件「${part.name}」库存不足！当前库存：${part.stock}，需要：${qty}` });
          }

          db.prepare(`
            INSERT INTO maintenance_parts (maintenance_plan_id, part_id, part_name, quantity)
            VALUES (?, ?, ?, ?)
          `).run(planId, partId, part.name, qty);

          db.prepare('UPDATE parts SET stock = stock - ? WHERE id=?').run(qty, partId);
        }

        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        return res.status(500).json({ error: e.message });
      }

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 删除计划（仅超级管理员）
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    try {
      const planId = Number(req.params.id);
      // 恢复库存
      const oldParts = db.prepare(
        'SELECT * FROM maintenance_parts WHERE maintenance_plan_id=?'
      ).all(planId);
      db.exec('BEGIN');
      try {
        for (const old of oldParts) {
          db.prepare('UPDATE parts SET stock = stock + ? WHERE id=?').run(
            Number(old.quantity), Number(old.part_id)
          );
        }
        db.prepare('DELETE FROM maintenance_parts WHERE maintenance_plan_id=?').run(planId);
        db.prepare('DELETE FROM maintenance_plans WHERE id=?').run(planId);
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        return res.status(500).json({ error: e.message });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 企业微信通知（预留接口）=====
  router.post('/:id/notify', (req, res) => {
    const plan = db.prepare(`
      SELECT m.* FROM maintenance_plans m WHERE m.id=?
    `).get(req.params.id);
    if (!plan) return res.status(404).json({ error: '计划不存在' });

    db.prepare(`
      INSERT INTO wechat_notification_logs
        (notification_type, target_user, title, content, related_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      plan.responsible_person,
      '【保养提醒】' + plan.maintenance_type,
      `位置：${plan.maintenance_type}\n` +
      `任务：${plan.task_desc}\n` +
      `计划日期：${plan.plan_date}\n` +
      `负责人：${plan.responsible_person}`,
      plan.id
    );

    res.json({ success: true, message: '通知已记录，待企业微信后台发送' });
  });

  // 低库存预警通知接口
  router.post('/notify-low-stock', (req, res) => {
    const lowStock = db.prepare(`
      SELECT * FROM parts WHERE stock < safety_stock
    `).all();
    let notified = 0;
    for (const p of lowStock) {
      db.prepare(`
        INSERT OR IGNORE INTO wechat_notification_logs
          (notification_type, target_user, title, content, related_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        '低库存预警',
        '采购员',
        '【库存预警】' + p.name,
        `备件：${p.name}（${p.spec}）\n` +
        `当前库存：${p.stock}${p.unit}（低于安全库存${p.safety_stock}）\n` +
        `存放位置：${p.storage_location}`,
        p.id
      );
      notified++;
    }
    res.json({ success: true, notified });
  });

  return router;
};
