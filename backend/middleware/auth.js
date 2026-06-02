/**
 * 权限控制中间件
 * 基于 req.session.role 判断用户角色
 * 
 * 三级角色：
 * - super_admin: 超级管理员 - 所有权限 + 用户管理
 * - admin: 设备管理员 - 所有业务权限
 * - user: 生产干部 - 查看 + 新建报修 + 备件领用
 */

// 角色权限等级
const ROLE_LEVELS = {
  'super_admin': 3,  // 最高权限
  'admin': 2,       // 中级权限
  'user': 1          // 基础权限
};

// 检查是否已登录
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

// 检查是否为超级管理员
function requireSuperAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  if (req.session.role !== 'super_admin') {
    return res.status(403).json({ error: '无权限访问：需要超级管理员权限' });
  }
  next();
}

// 检查是否为设备管理员及以上（super_admin 或 admin）
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  const userLevel = ROLE_LEVELS[req.session.role] || 0;
  if (userLevel < ROLE_LEVELS['admin']) {
    return res.status(403).json({ error: '无权限访问：需要设备管理员及以上权限' });
  }
  next();
}

// 检查是否为工单处理人员（admin 或 super_admin）
function requireRepairStaff(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  const userLevel = ROLE_LEVELS[req.session.role] || 0;
  if (userLevel < ROLE_LEVELS['admin']) {
    return res.status(403).json({ error: '无权限处理工单：需要设备管理员及以上权限' });
  }
  next();
}

// 检查是否为备件入库人员（admin 或 super_admin）
function requireStockIn(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  const userLevel = ROLE_LEVELS[req.session.role] || 0;
  if (userLevel < ROLE_LEVELS['admin']) {
    return res.status(403).json({ error: '无权限入库：需要设备管理员及以上权限' });
  }
  next();
}

// 获取当前用户信息
function getCurrentUser(req) {
  if (!req.session || !req.session.userId) {
    return null;
  }
  return {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role
  };
}

module.exports = {
  requireAuth,
  requireSuperAdmin,
  requireAdmin,
  requireRepairStaff,
  requireStockIn,
  getCurrentUser,
  ROLE_LEVELS
};
