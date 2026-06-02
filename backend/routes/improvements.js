// 现场改善/通用型事项申请与处理 - 路由
// 状态机:
//   0=待反馈 → 1=行动中 → 2=待确认 → 3=已完成
//   4=退回(回退到0) → 5=已挂起(可恢复回0)
// 申请人可在未完结状态下: 编辑(状态回0)、结束(直接→3)、挂起(→5)
// 已挂起可恢复(→0，需重新指派)
// 超级管理员可查看全部数据并不限状态删除
module.exports = (db) => {
  const express = require('express');
  const router = express.Router();

  // ===== 权限中间件 =====
  function requireAuth(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    next();
  }

  function requireSuperAdmin(req, res, next) {
    if (!req.session.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    if (req.session.role !== 'super_admin') {
      return res.status(403).json({ error: '仅超级管理员可执行此操作' });
    }
    next();
  }

  // ===== 编号生成: IMP-YYYYMMDD-NNN =====
  function generateRequestNo() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `IMP-${y}${m}${d}-`;

    // 找今天最大序号
    const last = db.prepare(`
      SELECT request_no FROM improvement_requests
      WHERE request_no LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(`${prefix}%`);

    let seq = 1;
    if (last) {
      seq = parseInt(last.request_no.slice(-3), 10) + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  // ===== 1. 查询列表 =====
  router.get('/', requireAuth, (req, res) => {
    try {
      const userId = req.session.userId;
      const role = req.session.role;
      const { status, tab } = req.query;
      const conditions = [];
      const params = [];

      if (tab === 'all') {
        // 全部数据：仅超级管理员可见
        if (role !== 'super_admin') {
          return res.status(403).json({ error: '无权限查看全部数据' });
        }
      } else if (tab === 'my') {
        // 我的申请：申请人视角
        conditions.push('applicant_id = ?');
        params.push(userId);
      } else if (tab === 'todo') {
        // 我的待办：指定人视角
        conditions.push('assigned_to_id = ?');
        params.push(userId);
        // 待办只显示进行中的：待反馈(0)、行动中(1)、退回(4)
        conditions.push('status IN (0, 1, 4)');
      } else {
        // 默认：管理员查看全部；生产干部仅看相关的
        if (role !== 'super_admin' && role !== 'admin') {
          conditions.push('(applicant_id = ? OR assigned_to_id = ?)');
          params.push(userId, userId);
        }
      }

      if (status !== undefined && status !== '') {
        conditions.push('status = ?');
        params.push(Number(status));
      }

      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const rows = db.prepare(`
        SELECT id, request_no, title, requirement_desc, expected_result, deadline,
               applicant_id, applicant_name, assigned_to_id, assigned_to_name,
               status, created_at, updated_at
        FROM improvement_requests
        ${where}
        ORDER BY id DESC
      `).all(...params);

      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 2. 查询详情 + 反馈记录 =====
  router.get('/detail/:id', requireAuth, (req, res) => {
    try {
      const request = db.prepare(`
        SELECT * FROM improvement_requests WHERE id = ?
      `).get(req.params.id);

      if (!request) {
        return res.status(404).json({ error: '申请不存在' });
      }

      const feedbacks = db.prepare(`
        SELECT * FROM action_feedback WHERE request_id = ? ORDER BY id ASC
      `).all(req.params.id);

      res.json({ ...request, feedbacks });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 3. 新建申请 =====
  router.post('/', requireAuth, (req, res) => {
    try {
      const { title, requirement_desc, expected_result, deadline, assigned_to_id } = req.body;

      if (!requirement_desc || !requirement_desc.trim()) {
        return res.status(400).json({ error: '需求说明不能为空' });
      }

      if (!title || !title.trim()) {
        return res.status(400).json({ error: '申请标题不能为空' });
      }

      const requestNo = generateRequestNo();
      let assignedToName = '';

      if (assigned_to_id) {
        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(assigned_to_id);
        if (user) {
          assignedToName = user.username;
        }
      }

      const result = db.prepare(`
        INSERT INTO improvement_requests (request_no, title, requirement_desc, expected_result, deadline,
          applicant_id, applicant_name, assigned_to_id, assigned_to_name, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        requestNo,
        title.trim(),
        requirement_desc.trim(),
        expected_result || '',
        deadline || '',
        req.session.userId,
        req.session.username,
        assigned_to_id || null,
        assignedToName || ''
      );

      res.json({
        id: result.lastInsertRowid,
        request_no: requestNo,
        message: '申请创建成功'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 4. 编辑申请（申请人本人，未完结状态可编辑，编辑后状态回到0待反馈）=====
  router.put('/:id', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.applicant_id !== req.session.userId) {
        return res.status(403).json({ error: '仅申请人本人可编辑' });
      }
      // 已完结(3)不可编辑
      if (request.status === 3) {
        return res.status(400).json({ error: '已完结的申请不可编辑' });
      }

      const { title, requirement_desc, expected_result, deadline, assigned_to_id } = req.body;
      let assignedToName = request.assigned_to_name;

      if (assigned_to_id !== undefined && assigned_to_id !== request.assigned_to_id) {
        if (assigned_to_id) {
          const user = db.prepare('SELECT username FROM users WHERE id = ?').get(assigned_to_id);
          assignedToName = user ? user.username : '';
        } else {
          assignedToName = '';
        }
      }

      // 编辑后状态回到0（待反馈），需要重新指派
      db.prepare(`
        UPDATE improvement_requests SET
          title = ?, requirement_desc = ?, expected_result = ?, deadline = ?,
          assigned_to_id = ?, assigned_to_name = ?,
          status = 0,
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        title || request.title,
        requirement_desc || request.requirement_desc,
        expected_result !== undefined ? expected_result : request.expected_result,
        deadline !== undefined ? deadline : request.deadline,
        assigned_to_id !== undefined ? (assigned_to_id || null) : request.assigned_to_id,
        assignedToName,
        req.params.id
      );

      res.json({ message: '更新成功，需要重新提交给指定人反馈' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 5. 制定方案（0待反馈 或 4退回 → 1行动中）=仅指定人=====
  router.post('/:id/assign', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.assigned_to_id !== req.session.userId) {
        return res.status(403).json({ error: '仅指定人可制定方案' });
      }
      if (request.status !== 0 && request.status !== 4) {
        return res.status(400).json({ error: '当前状态不可制定方案，仅待反馈或退回状态可操作' });
      }

      const { action_plan, action_records, planned_completion } = req.body;
      if (!action_plan || !action_plan.trim()) {
        return res.status(400).json({ error: '行动方案不能为空' });
      }

      db.exec('BEGIN');
      try {
        // 更新状态为 1（行动中）
        db.prepare(`
          UPDATE improvement_requests SET status = 1, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(req.params.id);

        // 写入反馈记录
        db.prepare(`
          INSERT INTO action_feedback (request_id, action_plan, action_records, planned_completion,
            feedback_user_id, feedback_user_name, feedback_time)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(
          req.params.id,
          action_plan.trim(),
          action_records || '',
          planned_completion || '',
          req.session.userId,
          req.session.username
        );

        db.exec('COMMIT');
        res.json({ message: '方案制定成功' });
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 6. 提交反馈（1行动中 → 2待确认）=仅指定人=====
  router.post('/:id/feedback', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.assigned_to_id !== req.session.userId) {
        return res.status(403).json({ error: '仅指定人可提交反馈' });
      }
      if (request.status !== 1) {
        return res.status(400).json({ error: '当前状态不可提交反馈，仅行动中状态可操作' });
      }

      const { action_plan, action_records, planned_completion } = req.body;
      if (!action_plan || !action_plan.trim()) {
        return res.status(400).json({ error: '行动方案不能为空' });
      }

      db.exec('BEGIN');
      try {
        // 更新状态为 2（待确认）
        db.prepare(`
          UPDATE improvement_requests SET status = 2, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(req.params.id);

        // 写入反馈记录
        db.prepare(`
          INSERT INTO action_feedback (request_id, action_plan, action_records, planned_completion,
            feedback_user_id, feedback_user_name, feedback_time)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(
          req.params.id,
          action_plan.trim(),
          action_records || '',
          planned_completion || '',
          req.session.userId,
          req.session.username
        );

        db.exec('COMMIT');
        res.json({ message: '反馈提交成功' });
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 7. 确认完成 或 退回（2待确认 → 3已完成 / 4退回）=仅申请人=====
  router.post('/:id/confirm', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.applicant_id !== req.session.userId) {
        return res.status(403).json({ error: '仅申请人可确认完成或退回' });
      }
      if (request.status !== 2) {
        return res.status(400).json({ error: '当前状态不可确认，仅待确认状态可操作' });
      }

      const { action, acceptance_opinion, rejection_reason } = req.body;

      if (action === 'complete') {
        db.exec('BEGIN');
        try {
          // 更新状态为 3（已完成），记录确认时间
          db.prepare(`
            UPDATE improvement_requests SET status = 3, updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(req.params.id);

          // 更新最新的反馈记录的验收意见和确认时间
          const lastFeedback = db.prepare(`
            SELECT id FROM action_feedback WHERE request_id = ? ORDER BY id DESC LIMIT 1
          `).get(req.params.id);

          if (lastFeedback) {
            db.prepare(`
              UPDATE action_feedback SET acceptance_opinion = ?, completion_confirmed_at = datetime('now', 'localtime')
              WHERE id = ?
            `).run(acceptance_opinion || '', lastFeedback.id);
          }

          db.exec('COMMIT');
          res.json({ message: '已完成确认' });
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      } else if (action === 'reject') {
        if (!rejection_reason || !rejection_reason.trim()) {
          return res.status(400).json({ error: '退回时请填写退回原因' });
        }

        db.exec('BEGIN');
        try {
          // 更新状态为 4（退回）
          db.prepare(`
            UPDATE improvement_requests SET status = 4, updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(req.params.id);

          // 更新最新的反馈记录写入退回原因
          const lastFeedback = db.prepare(`
            SELECT id FROM action_feedback WHERE request_id = ? ORDER BY id DESC LIMIT 1
          `).get(req.params.id);

          if (lastFeedback) {
            db.prepare(`
              UPDATE action_feedback SET rejection_reason = ? WHERE id = ?
            `).run(rejection_reason.trim(), lastFeedback.id);
          }

          db.exec('COMMIT');
          res.json({ message: '已退回，退回原因已记录' });
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      } else {
        res.status(400).json({ error: '参数错误：action 应为 complete 或 reject' });
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 8. 申请人直接结束（未完结状态 → 3已完成）=====
  router.post('/:id/complete-direct', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.applicant_id !== req.session.userId) {
        return res.status(403).json({ error: '仅申请人可结束申请' });
      }
      if (request.status === 3) {
        return res.status(400).json({ error: '申请已经完成' });
      }

      // 写入一条自动反馈记录标记结束
      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE improvement_requests SET status = 3, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(req.params.id);

        db.prepare(`
          INSERT INTO action_feedback (request_id, action_plan, action_records,
            feedback_user_id, feedback_user_name, feedback_time, acceptance_opinion)
          VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
        `).run(
          req.params.id,
          '申请人直接结束',
          '',
          req.session.userId,
          req.session.username,
          '申请人直接结束'
        );

        db.exec('COMMIT');
        res.json({ message: '申请已结束' });
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 9. 申请人挂起（未完结状态 → 5已挂起）=====
  router.post('/:id/suspend', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.applicant_id !== req.session.userId) {
        return res.status(403).json({ error: '仅申请人可挂起申请' });
      }
      if (request.status === 3 || request.status === 5) {
        return res.status(400).json({ error: '当前状态不可挂起' });
      }

      db.prepare(`
        UPDATE improvement_requests SET status = 5, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(req.params.id);

      res.json({ message: '申请已挂起' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 10. 申请人恢复（5已挂起 → 0待反馈）=====
  router.post('/:id/resume', requireAuth, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });
      if (request.applicant_id !== req.session.userId) {
        return res.status(403).json({ error: '仅申请人可恢复申请' });
      }
      if (request.status !== 5) {
        return res.status(400).json({ error: '仅已挂起的申请可恢复' });
      }

      // 恢复后回到待反馈，可以选择重新编辑或让原指定人继续处理
      db.prepare(`
        UPDATE improvement_requests SET status = 0, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(req.params.id);

      res.json({ message: '申请已恢复，需要重新提交给指定人确认' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== 11. 删除申请（不限状态，仅超级管理员）=====
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    try {
      const request = db.prepare('SELECT * FROM improvement_requests WHERE id = ?').get(req.params.id);
      if (!request) return res.status(404).json({ error: '申请不存在' });

      // 同时删除关联的反馈记录
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM action_feedback WHERE request_id = ?').run(req.params.id);
        db.prepare('DELETE FROM improvement_requests WHERE id = ?').run(req.params.id);
        db.exec('COMMIT');
        res.json({ message: '删除成功' });
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
