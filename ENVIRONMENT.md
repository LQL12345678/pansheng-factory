# 攀升工厂设备管理系统 - 环境说明

## 🖥️ 系统要求

### 最低配置
- CPU: Intel i3 / AMD Ryzen 3 或更高
- 内存: 4GB RAM
- 硬盘: 10GB 可用空间
- 操作系统: Windows 10/11 或 macOS 10.14+

### 推荐配置
- CPU: Intel i5 / AMD Ryzen 5 或更高
- 内存: 8GB RAM
- 硬盘: 20GB SSD

---

## 🔧 运行环境

### 1. Node.js

| 项目 | 版本要求 | 验证命令 |
|------|---------|---------|
| Node.js | **18.x 或更高** | `node -v` |
| npm | 随Node自带 | `npm -v` |

**安装方式：**
```bash
# Windows
# 下载地址: https://nodejs.org/
# 选择 LTS 版本

# 使用 nvm (推荐)
winget install CoreyButler.NVMforWindows
nvm install 20
nvm use 20
```

### 2. Python (可选)

| 项目 | 版本要求 | 用途 |
|------|---------|------|
| Python | 3.8+ | 数据导入脚本 |

```bash
# Windows
winget install Python.Python.3.11

# 验证
python --version
```

### 3. 数据库

| 项目 | 信息 |
|------|------|
| 数据库类型 | SQLite 3 |
| 依赖包 | better-sqlite3 |
| 数据库文件 | backend/db/equipment.db |

---

## 📦 依赖清单

### 后端 (backend)

```json
{
  "express": "^4.18.2",
  "better-sqlite3": "^9.4.0",
  "xlsx": "^0.18.5",
  "multer": "^1.4.5-lts.1",
  "express-session": "^1.17.3",
  "cors": "^2.8.5",
  "bcryptjs": "^2.4.3"
}
```

**安装命令：**
```bash
cd backend
npm install
```

### 前端 (frontend)

```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.20.0",
  "antd": "^5.12.0",
  "xlsx": "^0.18.5",
  "axios": "^1.6.0",
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0",
  "typescript": "^5.3.0"
}
```

**安装命令：**
```bash
cd frontend
npm install
```

---

## 🔌 端口配置

| 服务 | 端口 | 说明 |
|------|------|------|
| 后端API | 3001 | Express服务器 |
| 前端 | 5173 | Vite开发服务器 |
| 上传目录 | /uploads | 静态文件服务 |

### 修改端口

**后端端口** - `backend/server.js`:
```javascript
const PORT = process.env.PORT || 3001; // 修改这里
```

**前端代理** - `frontend/vite.config.ts`:
```typescript
server: {
  port: 5173,  // 修改这里
  proxy: {
    '/api': {
      target: 'http://localhost:3001',  // 指向后端地址
    }
  }
}
```

---

## 📁 目录结构

```
equipment_system/
├── backend/                 # 后端服务
│   ├── server.js           # 主入口
│   ├── db.js               # 数据库初始化
│   ├── middleware/          # 中间件
│   │   └── auth.js         # 认证中间件（已禁用）
│   ├── routes/             # 路由
│   │   ├── devices.js     # 设备管理
│   │   ├── repairs.js     # 维修工单
│   │   ├── parts.js       # 零部件
│   │   ├── tools.js       # 工具台账
│   │   └── maintenance.js # 保养计划
│   ├── uploads/           # 上传文件
│   └── db/                # 数据库文件
│       └── equipment.db   # SQLite数据库
│
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # 公共组件
│   │   ├── services/      # API服务
│   │   ├── hooks/         # 自定义Hook
│   │   └── App.tsx        # 应用入口
│   └── vite.config.ts    # Vite配置
│
├── database/              # 数据库备份
│   └── equipment.sql     # SQL导出文件
│
└── start.bat             # 启动脚本
```

---

## 🚀 启动命令

### 开发模式

**终端1 - 后端：**
```bash
cd backend
node server.js
```

**终端2 - 前端：**
```bash
cd frontend
npm run dev
```

### 生产模式

```bash
# 构建前端
cd frontend
npm run build

# 启动后端
cd backend
node server.js
```

---

## 🔒 安全说明

### 当前状态
- **认证已禁用**：系统可以直接访问，无需登录
- **管理员权限已开放**：所有功能可用

### 如需启用认证
1. 修改 `backend/middleware/auth.js`，取消注释认证检查
2. 修改前端API配置 `frontend/src/services/api.ts`，添加401拦截器
3. 添加登录页面

---

## 📊 数据规模

| 表名 | 记录数 | 说明 |
|------|--------|------|
| devices | ~180 | 设备台账 |
| repairs | ~50+ | 维修工单 |
| parts | - | 零部件 |
| tools | - | 工具台账 |
| maintenance_plans | - | 保养计划 |

---

## 🔄 更新日志

### 2026-05-14
- 禁用登录认证，实现无登录访问
- 修复设备删除功能的外键约束问题
- 删除用户管理系统

### 历史版本
（请在Git提交记录中查看）
