const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function(db) {
  const router = express.Router();

  // ===== 角色常量 =====
  const ROLES = {
    SUPER_ADMIN: 'super_admin',   // 超级管理员：所有权限 + 用户管理
    ADMIN: 'admin',              // 设备管理员：业务权限
    USER: 'user',                // 生产干部：查看 + 新建报修 + 领用
    OPERATOR: 'operator',        // 设备报修员：仅首页+设备排班，只能报修和领用
  };

  // ===== 权限等级 =====
  const ROLE_LEVELS = {
    'super_admin': 3,  // 最高权限
    'admin': 2,       // 中级权限
    'user': 1,        // 基础权限
    'operator': 1,    // 设备报修员（与生产干部同级，但前端限制可见版块）
  };

  // ===== 中间件：检查登录状态 =====
  const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录或会话已过期' });
    }
    next();
  };

  // ===== 中间件：检查超级管理员权限 =====
  const requireSuperAdmin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录或会话已过期' });
    }
    if (req.session.role !== ROLES.SUPER_ADMIN) {
      return res.status(403).json({ error: '无权限访问：需要超级管理员权限' });
    }
    next();
  };

  // ===== 中间件：检查设备管理员及以上权限 =====
  const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录或会话已过期' });
    }
    const userLevel = ROLE_LEVELS[req.session.role] || 0;
    if (userLevel < ROLE_LEVELS[ROLES.ADMIN]) {
      return res.status(403).json({ error: '无权限访问：需要设备管理员及以上权限' });
    }
    next();
  };

  // ===== 中间件：检查工单处理权限 =====
  const requireRepairStaff = (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: '未登录或会话已过期' });
    }
    const userLevel = ROLE_LEVELS[req.session.role] || 0;
    if (userLevel < ROLE_LEVELS.ADMIN) {
      return res.status(403).json({ error: '无权限处理工单：需要设备管理员及以上权限' });
    }
    next();
  };

  // ===== 导出权限中间件给其他路由使用 =====
  router.requireAuth = requireAuth;
  router.requireSuperAdmin = requireSuperAdmin;
  router.requireAdmin = requireAdmin;
  router.requireRepairStaff = requireRepairStaff;
  router.ROLES = ROLES;

  // ===== 登录 =====
  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: '账号已被禁用，请联系管理员' });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 保存会话
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    // 更新最后活跃时间
    db.prepare("UPDATE users SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(user.id);

    // 角色名称映射
    const roleNames = {
      'super_admin': '超级管理员',
      'admin': '设备管理员',
      'user': '生产干部',
      'operator': '设备报修员'
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        roleName: roleNames[user.role] || user.role,
      }
    });
  });

  // ===== 登出 =====
  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: '登出失败' });
      }
      res.json({ success: true });
    });
  });

  // ===== 获取当前用户信息 =====
  router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, username, role, status, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const roleNames = {
      'super_admin': '超级管理员',
      'admin': '设备管理员',
      'user': '生产干部',
      'operator': '设备报修员'
    };

    res.json({
      ...user,
      roleName: roleNames[user.role] || user.role
    });
  });

  // ===== 检查会话是否有效 =====
  router.get('/check', (req, res) => {
    if (req.session && req.session.userId) {
      const user = db.prepare('SELECT id, username, role FROM users WHERE id = ? AND status = ?').get(req.session.userId, 'active');
      if (user) {
        const roleNames = {
          'super_admin': '超级管理员',
          'admin': '设备管理员',
          'user': '生产干部',
          'operator': '设备报修员'
        };
        
        return res.json({
          authenticated: true,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            roleName: roleNames[user.role] || user.role,
          }
        });
      }
    }
    res.json({ authenticated: false });
  });

  // ===== 心跳检测与会话续期 =====
  router.get('/ping', (req, res) => {
    if (req.session && req.session.userId) {
      // 续期会话：更新 session 的访问时间
      req.session.touch();
      return res.json({
        alive: true,
        userId: req.session.userId,
        username: req.session.username,
        role: req.session.role
      });
    }
    res.json({ alive: false });
  });

  // ===== 用户简单列表（所有登录用户可用，用于下拉选择指定人）=====
  router.get('/list', requireAuth, (req, res) => {
    const users = db.prepare('SELECT id, username FROM users WHERE status = ? ORDER BY id ASC').all('active');
    res.json(users);
  });

  // ===== 用户列表（仅超级管理员）=====
  router.get('/', requireSuperAdmin, (req, res) => {
    const users = db.prepare('SELECT id, username, role, status, created_at, updated_at FROM users ORDER BY id ASC').all();
    
    const roleNames = {
      'super_admin': '超级管理员',
      'admin': '设备管理员',
      'user': '生产干部',
      'operator': '设备报修员'
    };
    
    const result = users.map(u => ({
      ...u,
      roleName: roleNames[u.role] || u.role
    }));
    
    res.json(result);
  });

  // ===== 新增用户（仅超级管理员）=====
  router.post('/', requireSuperAdmin, (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 验证角色（允许 admin、user、operator，不允许通过 API 创建 super_admin）
    const validRoles = ['admin', 'user', 'operator'];
    const userRole = validRoles.includes(role) ? role : 'user';

    // 密码长度验证
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    // 加密密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
      const result = db.prepare('INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)').run(username, hashedPassword, userRole, 'active');
      
      const roleNames = {
        'super_admin': '超级管理员',
        'admin': '设备管理员',
        'user': '生产干部',
        'operator': '设备报修员'
      };

      res.json({
        success: true,
        id: result.lastInsertRowid,
        message: `用户创建成功（${roleNames[userRole]}）`
      });
    } catch (err) {
      res.status(500).json({ error: '创建用户失败' });
    }
  });

  // ===== 修改自己的密码（所有人可用，必须放在 /:id 之前避免路由冲突）=====
  router.put('/change-password', requireAuth, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const userId = req.session.userId;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码都不能为空' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    try {
      db.prepare("UPDATE users SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(hashedPassword, userId);
      res.json({ success: true, message: '密码修改成功' });
    } catch (err) {
      res.status(500).json({ error: '修改密码失败' });
    }
  });

  // ===== 修改用户（仅超级管理员）=====
  router.put('/:id', requireSuperAdmin, (req, res) => {
    const { id } = req.params;
    const { role, status, password } = req.body;

    // 不能修改自己
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: '不能修改自己的账号' });
    }

    // 目标用户不能是超级管理员（除非是最后一个）
    const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
    if (targetUser && targetUser.role === 'super_admin') {
      const superAdminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND status = 'active'").get().count;
      if (superAdminCount <= 1) {
        return res.status(400).json({ error: '不能修改最后一个超级管理员的账号' });
      }
    }

    const updates = [];
    const params = [];

    // 验证角色（允许 admin、user、operator）
    if (role && ['admin', 'user', 'operator'].includes(role)) {
      updates.push('role = ?');
      params.push(role);
    }

    if (status && ['active', 'disabled'].includes(status)) {
      updates.push('status = ?');
      params.push(status);
    }

    // 可选：修改密码（非空时才更新）
    if (password && password.trim()) {
      if (password.trim().length < 6) {
        return res.status(400).json({ error: '密码长度至少6位' });
      }
      const hashedPassword = bcrypt.hashSync(password.trim(), 10);
      updates.push('password = ?');
      params.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    params.push(id);

    try {
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      res.json({ success: true, message: '用户更新成功' });
    } catch (err) {
      res.status(500).json({ error: '更新用户失败' });
    }
  });

  // ===== 重置密码（仅超级管理员）=====
  router.post('/:id/reset-password', requireSuperAdmin, (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    // 不能重置自己
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: '不能重置自己的密码' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    try {
      db.prepare("UPDATE users SET password = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(hashedPassword, id);
      res.json({ success: true, message: '密码重置成功' });
    } catch (err) {
      res.status(500).json({ error: '重置密码失败' });
    }
  });

  // ===== 删除用户（仅超级管理员）=====
  router.delete('/:id', requireSuperAdmin, (req, res) => {
    const { id } = req.params;

    // 不能删除自己
    if (parseInt(id) === req.session.userId) {
      return res.status(400).json({ error: '不能删除自己的账号' });
    }

    // 检查是否为最后一个超级管理员
    const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
    
    if (targetUser && targetUser.role === 'super_admin') {
      const superAdminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND status = 'active'").get().count;
      if (superAdminCount <= 1) {
        return res.status(400).json({ error: '不能删除最后一个超级管理员账号' });
      }
    }

    try {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      res.json({ success: true, message: '用户删除成功' });
    } catch (err) {
      res.status(500).json({ error: '删除用户失败' });
    }
  });

  // ===== 获取权限配置 =====
  router.get('/permissions', requireAuth, (req, res) => {
    // 返回当前用户的权限配置
    const role = req.session.role;
    
    const permissions = {
      'super_admin': {
        canManageUsers: true,
        canEditDevices: true,
        canDeleteDevices: true,
        canAddDevices: true,
        canEditParts: true,
        canDeleteParts: true,
        canStockIn: true,
        canStockOut: true,
        canEditRepairs: true,
        canProcessRepairs: true,
        canCreateRepairs: true,
        canViewAll: true,
      },
      'admin': {
        canManageUsers: false,
        canEditDevices: true,
        canDeleteDevices: true,
        canAddDevices: true,
        canEditParts: true,
        canDeleteParts: true,
        canStockIn: true,
        canStockOut: true,
        canEditRepairs: true,
        canProcessRepairs: true,
        canCreateRepairs: true,
        canViewAll: true,
      },
      'user': {
        canManageUsers: false,
        canEditDevices: false,
        canDeleteDevices: false,
        canAddDevices: false,
        canEditParts: false,
        canDeleteParts: false,
        canStockIn: false,
        canStockOut: true,
        canEditRepairs: false,
        canProcessRepairs: false,
        canCreateRepairs: true,
        canViewAll: true,
      },
      'operator': {
        canManageUsers: false,
        canEditDevices: false,
        canDeleteDevices: false,
        canAddDevices: false,
        canEditParts: false,
        canDeleteParts: false,
        canStockIn: false,
        canStockOut: true,
        canEditRepairs: false,
        canProcessRepairs: false,
        canCreateRepairs: true,
        canViewAll: false,
      }
    };

    res.json(permissions[role] || permissions['user']);
  });

  return router;
};
