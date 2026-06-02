# 工作记忆

## 项目概述
攀升工厂设备管理系统（WorkBuddy）- 前后端分离架构

## 技术栈
- 前端：React + TypeScript + Ant Design + Vite
- 后端：Node.js + Express + SQLite + bcrypt
- 会话：Session + Cookie（8小时有效期，30分钟无操作过期）

## 企业微信通知功能（2026-05-15 更新）
- Webhook 已配置：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=d6fb0b52-5092-443a-8bfa-68ea418e4d16`
- 通知类型：
  - 🔔 **新建工单通知**：当有新的设备维修工单时，立即发送通知
  - ✅ **工单完结通知**：当维修工单完成处理时，发送完结通知
- **已取消**：待处理工单定时提醒
- 配置文件：`backend/services/wechat.js`
- 路由：`backend/routes/notifications.js`
- 前端页面：`frontend/src/pages/NotificationSettings.tsx`
- 数据库表：`notification_config`（webhook_url, enabled, notify_immediately 等）
- 通知日志表：`wechat_notification_logs`

## 值班巡查模块（2026-06-01 新增）
- **数据库表**：`inspection_items`（点检项目）、`inspection_records`（点检记录）
- **预设分类**：对讲机(2项)、3楼电箱开关(10项)、1楼电箱(8项)、门窗(4项)
- **后端路由**：`backend/routes/inspections.js`（CRUD + 打卡 + 周视图 + 统计）
- **前端页面**：`InspectionList.tsx`（表格+周视图）、`InspectionCheckIn.tsx`（扫码打卡）
- **自动规则**：18:00后未打卡自动标记为漏检（🔴红灯）
- **状态灯**：🟢正常 🟡异常 🔴漏检 ⚪未开始
- **二维码**：每个项目唯一 qr_token → `/inspections/check-in?token=xxx`
- Webhook 已配置：`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=d6fb0b52-5092-443a-8bfa-68ea418e4d16`
- 通知类型：
  - 🔔 **新建工单通知**：当有新的设备维修工单时，立即发送通知
  - ✅ **工单完结通知**：当维修工单完成处理时，发送完结通知
- **已取消**：待处理工单定时提醒
- 配置文件：`backend/services/wechat.js`
- 路由：`backend/routes/notifications.js`
- 前端页面：`frontend/src/pages/NotificationSettings.tsx`
- 数据库表：`notification_config`（webhook_url, enabled, notify_immediately 等）
- 通知日志表：`wechat_notification_logs`

## 三级权限系统

### 角色定义
- **超级管理员 (super_admin)**：所有权限 + 用户管理
- **设备管理员 (admin)**：业务权限，无用户管理
- **普通用户 (user)**：查看 + 新建报修 + 备件领用

### 后端权限中间件
- 文件：`backend/middleware/auth.js`
- 导出：`requireAuth`、`requireSuperAdmin`、`requireAdmin`、`requireRepairStaff`、`requireStockIn`

### 权限矩阵（2026-05-14 更新）

| 功能 | 超级管理员 | 设备管理员 | 普通用户 |
|------|:----------:|:----------:|:--------:|
| 用户管理 | ✓ | ✗ | ✗ |
| 设备增删改 | ✓ | ✓ | ✗ |
| 备件入库 | ✓ | ✓ | ✗ |
| 备件领用 | ✓ | ✓ | ✓ |
| 工单处理 | ✓ | ✓ | ✗ |
| 新建报修 | ✓ | ✓ | ✓ |
| 查看数据 | ✓ | ✓ | ✓ |

### 前端权限控制
- 文件：`frontend/src/hooks/useAuth.tsx`
- Context：`AuthProvider` 包裹整个应用
- Hook：`useAuth()` 获取用户/权限，`useIsSuperAdmin()`，`useIsAdmin()`
- 菜单控制：用户管理仅超级管理员可见
- 按钮控制：根据权限动态显示/隐藏按钮

### 用户管理
- 默认账号：admin / admin123（超级管理员）
- 用户表：`users`（id, username, password, role, status, created_at, updated_at）
- 密码加密：bcrypt
- 角色字段：`super_admin` / `admin` / `user`

## 文件结构
- 后端路由：`backend/routes/{devices,tools,parts,repairs,users}.js`
- 前端页面：`frontend/src/pages/{HomePage,DeviceList,ToolList,PartList,RepairList,MaintenancePlan,StatsDashboard,UserManagement,LoginPage}.tsx`
- 权限 Hook：`frontend/src/hooks/useAuth.tsx`
- 组件：`frontend/src/components/`
- 样式：`frontend/src/{App,dark-theme,index}.css`

## 统计看板 API（server.js）
- `/api/stats/overview` - 设备总览统计
- `/api/stats/fault-frequency` - 故障频率 TOP20
- `/api/stats/fault-types` - 故障类型分布
- `/api/stats/low-stock` - 低库存预警
- `/api/stats/stop-duration-by-month` - 停线时长按月统计
- `/api/stats/fault-rate-by-month` - 线体故障率按月统计
