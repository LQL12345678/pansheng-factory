module.exports = (db) => {
  const express = require('express');
  const router = express.Router();

  // ===== 权限中间件 =====
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

  const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '请先登录' });
    }
    next();
  };

  // ===== 辅助函数 =====
  function getMonday(d) {
    const date = new Date(d.getTime());
    date.setHours(12, 0, 0, 0);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const result = new Date(date.setDate(diff));
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function formatDate(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ISO 8601 周号计算：从 weekStart（周一）算出全年第几周
  function getISOWeekNumber(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    const dayNum = (date.getDay() + 6) % 7; // 0=Mon..6=Sun
    date.setDate(date.getDate() - dayNum + 3);
    const jan4 = new Date(date.getFullYear(), 0, 4);
    const diff = (date.getTime() - jan4.getTime()) / 86400000;
    return 1 + Math.ceil(diff / 7);
  }

  const LINE_CODES = ['A', 'B', 'C', 'D'];
  const STAFF_NAMES = ['李庆良', '王艾博', '王艾德'];
  const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  // ===== GET /api/schedule?year=2026&month=5 — 按月获取排班数据 =====
  // 返回按周分组的排班数据，每个日期包含4条线体的状态和人员
  router.get('/', (req, res) => {
    try {
      const { year, month } = req.query;
      if (!year || !month) return res.status(400).json({ error: '缺少 year 或 month 参数' });

      const y = parseInt(year);
      const m = parseInt(month);

      // 生成该月所有日期
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      const allDates = [];
      let d = new Date(firstDay);
      while (d <= lastDay) {
        allDates.push(formatDate(d));
        d.setDate(d.getDate() + 1);
      }

      // 查询该月所有排班记录
      const schedules = db.prepare(`
        SELECT ps.*, 
          GROUP_CONCAT(ss.staff_name) as staff_list
        FROM production_schedule ps
        LEFT JOIN schedule_staff ss ON ss.schedule_id = ps.id
        WHERE ps.schedule_date >= ? AND ps.schedule_date <= ?
        GROUP BY ps.id
        ORDER BY ps.schedule_date ASC, ps.line_code ASC
      `).all(allDates[0], allDates[allDates.length - 1]);

      // 构建索引: key = "date|line"
      const scheduleMap = {};
      for (const s of schedules) {
        const key = `${s.schedule_date}|${s.line_code}`;
        scheduleMap[key] = {
          id: s.id,
          status: s.status,
          staff: s.staff_list ? s.staff_list.split(',').filter(Boolean) : [],
        };
      }

      // 查询默认无记录的排班（用 status=1 即绿色/运行时作为默认）
      // 按周分组
      const weeks = [];
      const processedMondays = new Set();

      for (const dateStr of allDates) {
        const dateObj = new Date(dateStr);
        const monday = getMonday(dateObj);
        const mondayStr = formatDate(monday);

        if (!processedMondays.has(mondayStr)) {
          processedMondays.add(mondayStr);
          weeks.push({
            weekStart: mondayStr,
            weekEnd: formatDate(new Date(monday.getTime() + 6 * 86400000)),
            weekNumber: getISOWeekNumber(monday),
            days: [],
            stats: null,
          });
        }

        // 找到当前周
        const currentWeek = weeks.find(w => w.weekStart === mondayStr);

        // 构建该日各线体数据
        const lines = {};
        for (const lineCode of LINE_CODES) {
          const key = `${dateStr}|${lineCode}`;
          if (scheduleMap[key]) {
            lines[lineCode] = {
              status: scheduleMap[key].status,
              staff: scheduleMap[key].staff,
            };
          } else {
            // 默认：绿色（运行中），无人
            lines[lineCode] = { status: 1, staff: [] };
          }
        }

        const dayOfWeek = dateObj.getDay() === 0 ? 7 : dateObj.getDay(); // 1=周一...7=周日

        currentWeek.days.push({
          date: dateStr,
          dayOfWeek: dayOfWeek,
          dayLabel: DAY_LABELS[dayOfWeek - 1],
          lines,
        });
      }

      // 计算每周统计
      for (const week of weeks) {
        const stats = {};
        for (const lineCode of LINE_CODES) {
          let runDays = 0;
          let totalDays = week.days.length;
          for (const day of week.days) {
            if (day.lines[lineCode].status === 1) {
              runDays++;
            }
          }
          stats[lineCode] = { runDays, totalDays };
        }
        week.stats = stats;
      }

      res.json({ weeks, year: y, month: m });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== POST /api/schedule/toggle — 切换某天某线体状态 =====
  router.post('/toggle', requireAdmin, (req, res) => {
    try {
      const { date, lineCode } = req.body;
      if (!date || !lineCode) return res.status(400).json({ error: '缺少 date 或 lineCode 参数' });
      if (!LINE_CODES.includes(lineCode)) return res.status(400).json({ error: '无效的线体代码' });

      // 过往日期仅超管可修改
      const today = new Date().toISOString().slice(0, 10);
      if (date < today && req.session.role !== 'super_admin') {
        return res.status(403).json({ error: '仅超级管理员可修改过往排班' });
      }

      // 获取当前状态
      const existing = db.prepare(
        'SELECT id, status FROM production_schedule WHERE schedule_date=? AND line_code=?'
      ).get(date, lineCode);

      let newStatus;
      if (existing) {
        // 切换：1->0, 0->1
        newStatus = existing.status === 1 ? 0 : 1;
        db.prepare(`
          UPDATE production_schedule SET status=?, updated_at=datetime('now','localtime')
          WHERE id=?
        `).run(newStatus, existing.id);
      } else {
        // 新增记录（默认 status=1，切换则设为 0）
        newStatus = 0;
        const r = db.prepare(`
          INSERT INTO production_schedule (schedule_date, line_code, status)
          VALUES (?, ?, ?)
        `).run(date, lineCode, newStatus);
      }

      res.json({ success: true, date, lineCode, status: newStatus });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== PUT /api/schedule/staff — 更新某天某线体的人员分配 =====
  router.put('/staff', requireAdmin, (req, res) => {
    try {
      const { date, lineCode, staff } = req.body;
      if (!date || !lineCode) return res.status(400).json({ error: '缺少 date 或 lineCode 参数' });
      if (!LINE_CODES.includes(lineCode)) return res.status(400).json({ error: '无效的线体代码' });
      if (!Array.isArray(staff)) return res.status(400).json({ error: 'staff 必须是数组' });

      // 过往日期仅超管可修改
      const today = new Date().toISOString().slice(0, 10);
      if (date < today && req.session.role !== 'super_admin') {
        return res.status(403).json({ error: '仅超级管理员可修改过往排班' });
      }

      // 先确保有排班记录，没有则创建（默认 status=1）
      let schedule = db.prepare(
        'SELECT id FROM production_schedule WHERE schedule_date=? AND line_code=?'
      ).get(date, lineCode);

      let scheduleId;
      if (schedule) {
        scheduleId = schedule.id;
      } else {
        const r = db.prepare(`
          INSERT INTO production_schedule (schedule_date, line_code, status)
          VALUES (?, ?, ?)
        `).run(date, lineCode, 1);
        scheduleId = Number(r.lastInsertRowid);
      }

      // 删除旧人员，插入新人员
      db.prepare('DELETE FROM schedule_staff WHERE schedule_id=?').run(scheduleId);

      for (const name of staff) {
        if (STAFF_NAMES.includes(name) || name.trim()) {
          db.prepare('INSERT INTO schedule_staff (schedule_id, staff_name) VALUES (?, ?)').run(scheduleId, name.trim());
        }
      }

      res.json({ success: true, date, lineCode, staff });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ===== GET /api/schedule/staff-list — 获取可选人员列表 =====
  router.get('/staff-list', (req, res) => {
    res.json({ staff: STAFF_NAMES });
  });

  // ===== POST /api/schedule/send-snapshot — 截图发送到企业微信 =====
  router.post('/send-snapshot', requireAuth, (req, res) => {
    try {
      const { image } = req.body;
      if (!image) return res.status(400).json({ error: '缺少截图数据' });
      console.log('收到截图，大小:', Math.round(image.length / 1024), 'KB');

      const crypto = require('crypto');
      const imgBuffer = Buffer.from(image, 'base64');
      const md5 = crypto.createHash('md5').update(imgBuffer).digest('hex');

      // 从通知配置获取webhook_url
      const wechatConfig = db.prepare('SELECT webhook_url FROM notification_config WHERE id=1').get();
      if (!wechatConfig?.webhook_url) {
        return res.status(400).json({ error: '未配置企业微信Webhook地址' });
      }

      console.log('发送到企业微信...');
      const body = JSON.stringify({
        msgtype: 'image',
        image: { base64: image, md5 },
      });

      fetch(wechatConfig.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then(fetchResp => fetchResp.json()).then(result => {
        if (result.errcode !== 0) {
          console.error('企业微信返回错误:', result);
          return res.status(500).json({ error: `企业微信返回错误: ${result.errmsg}` });
        }
        console.log('企业微信发送成功');
        res.json({ success: true });
      }).catch(e => {
        console.error('企业微信发送异常:', e.message);
        res.status(500).json({ error: '网络请求失败: ' + e.message });
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
