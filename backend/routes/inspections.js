const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// 本地日期格式化（避免 toISOString 的 UTC 偏移问题）
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===== 获取所有点检项目 =====
router.get('/', requireAuth, (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM inspection_items ORDER BY sort_order').all();
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 获取单个点检项目（通过 qr_token）=====
router.get('/by-token/:token', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM inspection_items WHERE qr_token = ?').get(req.params.token);
    if (!item) return res.status(404).json({ error: '点检项目不存在' });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 新增点检项目（admin以上）=====
router.post('/', requireAdmin, (req, res) => {
  try {
    const crypto = require('crypto');
    const { category, name, box_number, responsible_person } = req.body;
    if (!category || !name) return res.status(400).json({ error: '分类和名称必填' });
    const token = crypto.randomBytes(8).toString('hex');
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM inspection_items').get().m || 0;
    db.prepare(`
      INSERT INTO inspection_items (category, name, box_number, responsible_person, qr_token, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(category, name, box_number || '', responsible_person || '', token, maxOrder + 1);
    res.json({ success: true, message: '点检项目已添加' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 更新点检项目 =====
router.put('/:id', requireAdmin, (req, res) => {
  try {
    const { category, name, box_number, responsible_person } = req.body;
    db.prepare(`
      UPDATE inspection_items SET category=?, name=?, box_number=?, responsible_person=?, updated_at=datetime('now','localtime')
      WHERE id=?
    `).run(category, name, box_number || '', responsible_person || '', req.params.id);
    res.json({ success: true, message: '点检项目已更新' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 删除点检项目 =====
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM inspection_records WHERE item_id = ?').run(req.params.id);
    db.prepare('DELETE FROM inspection_items WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '点检项目已删除' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 提交点检记录（扫码打卡）=====
router.post('/check-in', (req, res) => {
  try {
    const { qr_token, status, remark, inspector } = req.body;
    if (!qr_token || !status) return res.status(400).json({ error: '缺少必要参数' });
    if (!['正常', '异常'].includes(status)) return res.status(400).json({ error: '状态无效' });

    const item = db.prepare('SELECT * FROM inspection_items WHERE qr_token = ?').get(qr_token);
    if (!item) return res.status(404).json({ error: '点检项目不存在' });

    const today = fmtDate(new Date());
    const inspectorName = inspector || req.session?.username || '未知';

    // 同一个项目同一天可以覆盖（最后一次提交为准）
    const existing = db.prepare(
      'SELECT id FROM inspection_records WHERE item_id = ? AND inspection_date = ?'
    ).get(item.id, today);

    if (existing) {
      db.prepare(
        'UPDATE inspection_records SET status=?, remark=?, inspector=?, created_at=datetime(\'now\',\'localtime\') WHERE id=?'
      ).run(status, remark || '', inspectorName, existing.id);
    } else {
      db.prepare(
        'INSERT INTO inspection_records (item_id, inspection_date, status, remark, inspector) VALUES (?, ?, ?, ?, ?)'
      ).run(item.id, today, status, remark || '', inspectorName);
    }

    res.json({ success: true, message: '点检完成', item: item.name, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 周视图数据：返回所有点检项目 + 周一~周日的点检状态 =====
router.get('/week-view', requireAuth, (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const now = new Date();

    // 计算当周的周一日期
    const dayOfWeek = targetDate.getDay(); // 0=周日
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(targetDate);
    monday.setDate(monday.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    // 本周 7 天的日期
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      weekDates.push(fmtDate(d));
    }

    // 当前时间（用于判断漏检）
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const todayStr = fmtDate(now);

    // 今天的日期，判断是否已过18:00
    function isMissedInspection(dateStr) {
      if (dateStr > todayStr) return false; // 未来的日期不判漏检
      if (dateStr < todayStr) return true;  // 过去的日期未打卡=漏检
      // 今天：18:00后未打卡=漏检
      return currentHour >= 18;
    }

    // 获取所有点检项目
    const items = db.prepare('SELECT * FROM inspection_items ORDER BY sort_order').all();

    // 获取本周所有点检记录
    const records = db.prepare(`
      SELECT * FROM inspection_records
      WHERE inspection_date >= ? AND inspection_date <= ?
    `).all(weekDates[0], weekDates[6]);

    // 构建 item_id -> { dateStr -> record } 的映射
    const recordMap = {};
    for (const r of records) {
      if (!recordMap[r.item_id]) recordMap[r.item_id] = {};
      recordMap[r.item_id][r.inspection_date] = r;
    }

    // 组装结果
    const result = items.map(item => {
      const days = weekDates.map(dateStr => {
        const rec = recordMap[item.id]?.[dateStr];
        if (rec) {
          return {
            date: dateStr,
            status: rec.status,
            remark: rec.remark,
            inspector: rec.inspector,
            light: rec.status === '正常' ? 'green' : 'yellow',
          };
        }
        // 无记录，判断是否漏检
        if (isMissedInspection(dateStr)) {
          return { date: dateStr, status: '漏检', remark: '', inspector: '', light: 'red' };
        }
        return { date: dateStr, status: '未开始', remark: '', inspector: '', light: 'gray' };
      });
      return {
        ...item,
        days,
      };
    });

    // 按分类分组
    const groups = {};
    for (const item of result) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }

    res.json({
      week_start: weekDates[0],
      week_end: weekDates[6],
      week_dates: weekDates,
      groups,
      items: result,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 获取二维码图片URL（用于打印/导出）=====
router.get('/qr-url/:token', requireAuth, (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM inspection_items WHERE qr_token = ?').get(req.params.token);
    if (!item) return res.status(404).json({ error: '点检项目不存在' });
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const checkInUrl = `${baseUrl}/inspections/check-in?token=${item.qr_token}`;
    res.json({ item, check_in_url: checkInUrl, qr_token: item.qr_token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 今日点检统计 =====
router.get('/today-stats', requireAuth, (req, res) => {
  try {
    const today = fmtDate(new Date());
    const total = db.prepare('SELECT COUNT(*) as cnt FROM inspection_items').get().cnt;
    const checked = db.prepare(
      'SELECT COUNT(DISTINCT item_id) as cnt FROM inspection_records WHERE inspection_date = ?'
    ).get(today).cnt;
    const normal = db.prepare(
      'SELECT COUNT(*) as cnt FROM inspection_records WHERE inspection_date = ? AND status = ?'
    ).get(today, '正常').cnt;
    const abnormal = db.prepare(
      'SELECT COUNT(*) as cnt FROM inspection_records WHERE inspection_date = ? AND status = ?'
    ).get(today, '异常').cnt;
    res.json({
      date: today,
      total,
      checked,
      missed: total - checked,
      normal,
      abnormal,
      rate: total > 0 ? Math.round(checked / total * 100) : 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
