const express = require('express');
const { getNotificationConfig, updateNotificationConfig, sendTestNotification, getNotificationLogs } = require('../services/wechat');

module.exports = function(db) {
  const router = express.Router();

  // ===== 权限中间件 =====
  const requireSuperAdmin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录' });
    }
    if (req.session.role !== 'super_admin') {
      return res.status(403).json({ error: '无权限：需要超级管理员' });
    }
    next();
  };

  // ===== 获取通知配置 =====
  router.get('/config', requireSuperAdmin, (req, res) => {
    try {
      const config = getNotificationConfig();

      // 获取设备管理员列表
      const admins = db.prepare(`
        SELECT id, username, role,
          CASE role WHEN 'super_admin' THEN '超级管理员' WHEN 'admin' THEN '设备管理员' ELSE '生产干部' END as roleName
        FROM users
        WHERE role IN ('super_admin', 'admin') AND status = 'active'
        ORDER BY id
      `).all();

      res.json({
        config: {
          enabled: !!config.enabled,
          webhook_url: config.webhook_url || '',
          notify_immediately: !!config.notify_immediately,
          notify_completed: true, // 工单完结通知默认开启
          notify_admin_ids: config.notify_admin_ids || []
        },
        admins
      });
    } catch (err) {
      console.error('获取通知配置失败:', err);
      res.status(500).json({ error: '获取配置失败' });
    }
  });

  // ===== 更新通知配置 =====
  router.put('/config', requireSuperAdmin, (req, res) => {
    try {
      const { webhook_url, enabled, notify_immediately, notify_completed, notify_admin_ids } = req.body;

      // 验证 Webhook URL 格式
      if (webhook_url && !webhook_url.startsWith('https://qyapi.weixin.qq.com/')) {
        return res.status(400).json({ error: 'Webhook URL 格式不正确，应以 https://qyapi.weixin.qq.com/ 开头' });
      }

      // 更新配置（保留 notify_immediately 和 notify_scheduled 字段用于兼容）
      const config = updateNotificationConfig({
        webhook_url,
        enabled,
        notify_immediately: notify_immediately !== false, // 默认开启
        notify_admin_ids
      });

      res.json({ success: true, config });
    } catch (err) {
      console.error('更新通知配置失败:', err);
      res.status(500).json({ error: '更新配置失败' });
    }
  });

  // ===== 测试发送通知 =====
  router.post('/test', requireSuperAdmin, async (req, res) => {
    try {
      const result = await sendTestNotification();
      res.json(result);
    } catch (err) {
      console.error('发送测试通知失败:', err);
      res.status(500).json({ error: '发送测试通知失败' });
    }
  });

  // ===== 获取通知日志 =====
  router.get('/logs', requireSuperAdmin, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const logs = getNotificationLogs(limit);
      res.json({ logs });
    } catch (err) {
      console.error('获取通知日志失败:', err);
      res.status(500).json({ error: '获取日志失败' });
    }
  });

  return router;
};
