# 攀升工厂设备管理系统 - 恢复指南

## 📦 备份文件说明

### 备份内容
- `backend/` - 后端代码（Node.js + Express）
- `frontend/` - 前端代码（React + TypeScript + Vite）
- `database/equipment.sql` - 完整数据库SQL文件
- `uploads/` - 上传文件（QR码等）
- `config/env.example` - 环境配置示例

### 不包含（需重新安装）
- `node_modules/` - Node.js依赖包（太大，通过npm install重新安装）
- `dist/` - 前端构建文件（通过npm run build重新生成）

---

## 🚀 快速恢复步骤（新电脑）

### 第一步：准备环境

#### 1.1 安装 Node.js
- 版本要求：Node.js 18.x 或更高版本
- 下载地址：https://nodejs.org/
- 验证安装：`node -v` 和 `npm -v`

#### 1.2 安装 Python（可选，用于数据导入脚本）
- 版本要求：Python 3.8 或更高版本
- 下载地址：https://www.python.org/
- 验证安装：`python --version`

### 第二步：复制项目文件

1. 解压备份压缩包到目标目录，例如：
   ```
   D:\WorkBuddy\2026-05-10-task-1\
   ```

2. 目录结构应如下：
   ```
   2026-05-10-task-1\
   ├── backend\
   ├── frontend\
   ├── database\
   │   └── equipment.sql
   ├── uploads\
   ├── config\
   ├── backup.bat
   └── RESTORE_GUIDE.md
   ```

### 第三步：安装后端依赖

```bash
cd backend
npm install
```

### 第四步：安装前端依赖

```bash
cd frontend
npm install
```

### 第五步：恢复数据库

#### 方案A：使用备份的SQL文件恢复
```bash
cd backend
mkdir db
node -e "
const DatabaseSync = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 创建新数据库
const db = new DatabaseSync(path.join(__dirname, 'db/equipment.db'));
db.exec('PRAGMA foreign_keys = OFF');

// 读取SQL文件
const sql = fs.readFileSync('../database/equipment.sql', 'utf8');
db.exec(sql);

console.log('数据库恢复成功！');
"
```

#### 方案B：直接复制数据库文件
如果备份中有完整的 `devices.db` 文件：
```bash
cd backend
mkdir db
copy ..\database\devices.db db\equipment.db
```

### 第六步：启动服务

#### 启动后端
```bash
cd backend
node server.js
```

后端启动后会：
- 自动初始化数据库表结构
- 监听端口 3001
- 输出 `✅ 数据库初始化完成`

#### 启动前端（新窗口）
```bash
cd frontend
npm run dev
```

前端启动后会：
- 自动打开浏览器 http://localhost:5173
- 代理后端API请求到 http://localhost:3001

### 第七步：验证系统

打开浏览器访问 http://localhost:5173，检查：
- [ ] 首页正常显示
- [ ] 设备台账有数据
- [ ] 维修记录有数据
- [ ] 新增/编辑/删除功能正常

---

## ⚙️ 环境配置

### 端口配置
| 服务 | 默认端口 | 配置文件 |
|------|---------|---------|
| 后端API | 3001 | backend/server.js |
| 前端 | 5173 | frontend/vite.config.ts |

### 数据库
- 类型：SQLite
- 文件位置：backend/db/equipment.db
- 依赖：better-sqlite3

### 环境变量
如需修改，创建 `.env` 文件：
```env
NODE_ENV=production
PORT=3001
```

---

## 🔧 常见问题

### Q1: npm install 失败
```
npm ERR! node-gyp rebuild failed
```
解决方案：安装 Python 和 Visual Studio Build Tools

### Q2: better-sqlite3 安装失败
```bash
npm install --build-from-source better-sqlite3
```

### Q3: 端口被占用
```bash
# 查找占用端口的进程
netstat -ano | findstr ":3001"

# 结束进程
taskkill /PID <进程ID> /F
```

### Q4: 前端API请求失败
检查：
1. 后端是否正常运行（端口3001）
2. vite.config.ts 代理配置是否正确
3. 浏览器控制台是否有CORS错误

### Q5: 数据库提示 "请先登录"
这是正常的，因为认证中间件已禁用。系统可以无登录访问。

---

## 📝 恢复检查清单

```
□ Node.js 已安装 (node -v)
□ Python 已安装 (python --version) [可选]
□ 项目文件已复制到目标目录
□ backend npm install 完成
□ frontend npm install 完成
□ 数据库已恢复
□ 后端服务已启动 (localhost:3001)
□ 前端服务已启动 (localhost:5173)
□ 系统功能验证通过
```

---

## 💾 定期备份建议

1. **每日备份**：使用 `backup.bat` 脚本
2. **备份位置**：建议放在云盘（OneDrive/钉钉云盘）同步
3. **保留周期**：保留最近7个每日备份 + 每周备份

---

## 📞 技术支持

如有问题，请提供：
1. 错误信息截图
2. 执行的操作步骤
3. 环境信息（操作系统、Node版本）
