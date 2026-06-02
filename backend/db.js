const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'db/equipment.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// WAL 自动 checkpoint：每 1000 页（约 4MB）自动合并，防止 WAL 文件无限增长
db.exec('PRAGMA wal_autocheckpoint = 1000');
// 设置 busy_timeout 为 5 秒，减少 SQLITE_BUSY 错误
db.exec('PRAGMA busy_timeout = 5000');

// ===== 迁移追踪表：记录已完成迁移，避免每次启动都重复执行 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);
function isMigrationDone(name) {
  return !!db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(name);
}
function markMigrationDone(name) {
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(name);
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      model TEXT,
      location TEXT NOT NULL,
      production_line TEXT,
      supplier TEXT,
      install_date TEXT,
      maintenance_cycle_days INTEGER DEFAULT 30,
      responsible_person TEXT,
      status TEXT DEFAULT '正常',
      remarks TEXT,
      qr_url TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 迁移：修改repairs表（仅当缺少 work_order_type 列时执行）
    -- 已有新结构的数据库跳过此迁移
  `);
  try {
    const existingCols = db.prepare("PRAGMA table_info(repairs)").all();
    const hasWorkOrderType = existingCols.some(c => c.name === 'work_order_type');
    if (hasWorkOrderType) {
      console.log('  迁移跳过: repairs 表已是新结构');
    } else {
      db.exec(`
        CREATE TABLE IF NOT EXISTS repairs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          work_order_no TEXT UNIQUE,
          report_date TEXT NOT NULL,
          report_time TEXT,
          device_id INTEGER,
          line TEXT,
          reporter TEXT,
          area TEXT,
          fault_desc TEXT NOT NULL,
          fault_type TEXT,
          fault_cause TEXT,
          solution TEXT,
          parts_used TEXT,
          repairman TEXT,
          accept_time TEXT,
          finish_time TEXT,
          duration_minutes INTEGER,
          stop_duration_minutes INTEGER,
          status TEXT DEFAULT '待处理',
          remarks TEXT,
          work_order_type TEXT DEFAULT '设备维修',
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
      `);
      try {
        db.exec(`
          INSERT OR IGNORE INTO repairs_new (id, report_date, device_id, line, reporter, area, fault_desc, fault_type, solution, repairman, status, remarks, created_at)
          SELECT id, report_date, device_id, line, reporter, area,
            COALESCE(fault_desc, problem_desc),
            fault_type,
            solution,
            COALESCE(repairman, handler),
            COALESCE(status, '待处理'),
            '',
            COALESCE(created_at, datetime('now', 'localtime'))
          FROM repairs;
          DROP TABLE IF EXISTS repairs;
          ALTER TABLE repairs_new RENAME TO repairs;
        `);
        console.log('  迁移: repairs 表结构升级');
      } catch (e) {
        console.log('  迁移跳过:', e.message);
        db.exec('DROP TABLE IF EXISTS repairs_new');
      }
    }
  } catch (e) {
    console.log('  迁移检查跳过:', e.message);
    db.exec('DROP TABLE IF EXISTS repairs_new');
  }
  db.exec(`

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      part_no TEXT UNIQUE,
      name TEXT NOT NULL,
      spec TEXT NOT NULL,
      brand TEXT,
      applicable_devices TEXT,
      storage_location TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      safety_stock INTEGER NOT NULL,
      unit TEXT DEFAULT '个',
      unit_price REAL,
      supplier TEXT,
      purchase_cycle_days INTEGER,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_no TEXT UNIQUE,
      log_date TEXT NOT NULL,
      part_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      related_work_order TEXT,
      handler TEXT NOT NULL,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (part_id) REFERENCES parts(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_no TEXT UNIQUE,
      device_id INTEGER,
      maintenance_type TEXT NOT NULL,
      task_desc TEXT NOT NULL,
      plan_date TEXT NOT NULL,
      responsible_person TEXT NOT NULL,
      wechat_id TEXT,
      required_parts TEXT,
      estimated_duration INTEGER,
      actual_date TEXT,
      status TEXT DEFAULT '待执行',
      executor TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS wechat_notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_type TEXT NOT NULL,
      target_user TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      related_id INTEGER,
      status TEXT DEFAULT 'pending',
      error_msg TEXT,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    INSERT OR IGNORE INTO device_categories (name) VALUES
      ('提升机'),('平移机'),('倍速链'),('皮带线'),('阻挡器'),
      ('打印机'),('AGV'),('空压机'),('冲压机'),('升降机'),
      ('老化架'),('滚筒线'),('打包机');

    -- 周度设备运行统计（手动填写字段）
    CREATE TABLE IF NOT EXISTS weekly_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      week INTEGER NOT NULL,
      week_label TEXT NOT NULL,
      running_hours REAL DEFAULT NULL,
      repeat_fault_count INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(year, month, week)
    );

    -- 保养计划更换零部件记录
    CREATE TABLE IF NOT EXISTS maintenance_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      maintenance_plan_id INTEGER NOT NULL,
      part_id INTEGER NOT NULL,
      part_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (maintenance_plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id)
    );
  `);
  // 迁移：repairs 表 repairman 去掉 NOT NULL（已在新结构中处理，此处仅作兼容）
  try {
    const cols = db.prepare("PRAGMA table_info(repairs)").all();
    const rmCol = cols.find(c => c.name === 'repairman');
    if (rmCol && rmCol.notnull === 1) {
      db.exec(`
        CREATE TABLE repairs_no_nn (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          work_order_no TEXT UNIQUE,
          report_date TEXT NOT NULL,
          report_time TEXT,
          device_id INTEGER,
          line TEXT,
          reporter TEXT,
          area TEXT,
          fault_desc TEXT NOT NULL,
          fault_type TEXT,
          fault_cause TEXT,
          solution TEXT,
          parts_used TEXT,
          repairman TEXT,
          accept_time TEXT,
          finish_time TEXT,
          duration_minutes INTEGER,
          stop_duration_minutes INTEGER,
          status TEXT DEFAULT '待处理',
          remarks TEXT,
          work_order_type TEXT DEFAULT '设备维修',
          created_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
        INSERT INTO repairs_no_nn SELECT * FROM repairs;
        DROP TABLE repairs;
        ALTER TABLE repairs_no_nn RENAME TO repairs;
      `);
      console.log('  迁移: repairs.repairman 去掉 NOT NULL');
    }
  } catch (e) {
    console.log('  迁移跳过:', e.message);
  }
  // 迁移：为 inventory_logs 增加领用专用字段（已有列时忽略报错）
  try { db.exec('ALTER TABLE inventory_logs ADD COLUMN line TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE inventory_logs ADD COLUMN purpose TEXT'); } catch (_) {}

  // 迁移：repairs 表新增 work_order_type 字段
  try {
    db.exec('ALTER TABLE repairs ADD COLUMN work_order_type TEXT DEFAULT "设备维修"');
    console.log('  迁移: repairs 新增 work_order_type 字段');
  } catch (e) {
    // 字段已存在则忽略
  }

  // 迁移：repairs 表新增 fault_images 字段（故障描述拍照，JSON数组存base64）
  try {
    db.exec('ALTER TABLE repairs ADD COLUMN fault_images TEXT');
    console.log('  迁移: repairs 新增 fault_images 字段');
  } catch (e) {
    // 字段已存在则忽略
  }

  // 迁移：新建 repair_parts 表（工单更换零件明细）
  db.exec(`
    CREATE TABLE IF NOT EXISTS repair_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repair_id INTEGER NOT NULL,
      part_id INTEGER NOT NULL,
      part_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
      FOREIGN KEY (part_id) REFERENCES parts(id)
    )
  `);

  // ===== 设备变更记录表（采购/报废）=====
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_change_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      device_no TEXT NOT NULL,
      device_name TEXT NOT NULL,
      change_type TEXT NOT NULL,
      change_date TEXT NOT NULL,
      operator TEXT NOT NULL,
      reason TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  // 迁移：为现有设备回填采购记录（仅回填没有采购记录的设备）—— 只执行一次
  if (!isMigrationDone('device_purchase_backfill')) {
    try {
      const allDevices = db.prepare('SELECT id, device_no, name, install_date, created_at FROM devices').all();
      let backfilled = 0;
      for (const dev of allDevices) {
        const exists = db.prepare('SELECT 1 FROM device_change_records WHERE device_id=? AND change_type=?').get(dev.id, '采购');
        if (!exists) {
          const changeDate = dev.install_date || dev.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
          db.prepare(`
            INSERT INTO device_change_records (device_id, device_no, device_name, change_type, change_date, operator)
            VALUES (?, ?, ?, '采购', ?, '')
          `).run(dev.id, dev.device_no, dev.name, changeDate);
          backfilled++;
        }
      }
      markMigrationDone('device_purchase_backfill');
      if (backfilled > 0) {
        console.log(`  迁移: 回填 ${backfilled} 台设备的采购记录`);
      }
    } catch (e) {
      console.log('  采购记录回填跳过:', e.message);
    }
  }

  // ===== 工具台账 =====
  // 迁移：如果旧 tools 表包含 tool_no 列（旧结构），则删除重建
  try {
    const toolCols = db.prepare("PRAGMA table_info(tools)").all();
    if (toolCols.length > 0 && toolCols.some(c => c.name === 'tool_no')) {
      db.exec('DROP TABLE IF EXISTS tool_change_records');
      db.exec('DROP TABLE IF EXISTS tools');
      db.exec('DROP TABLE IF EXISTS tool_categories');
      console.log('  迁移: tools 表结构重建（旧字段→新字段）');
    }
  } catch (e) {
    // 表不存在则忽略
  }

  // 迁移：为已有 tools 表添加 quantity 列
  try {
    const toolCols2 = db.prepare("PRAGMA table_info(tools)").all();
    if (toolCols2.length > 0 && !toolCols2.some(c => c.name === 'quantity')) {
      db.exec("ALTER TABLE tools ADD COLUMN quantity INTEGER DEFAULT 1");
      console.log('  迁移: tools 表新增 quantity 字段');
    }
  } catch (e) {
    // 忽略
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      line TEXT DEFAULT '',
      model TEXT DEFAULT '',
      device_no TEXT DEFAULT '',
      station TEXT DEFAULT '',
      quantity INTEGER DEFAULT 1,
      status TEXT DEFAULT '正常',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tool_change_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      change_type TEXT NOT NULL,
      change_date TEXT NOT NULL,
      operator TEXT NOT NULL,
      reason TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (tool_id) REFERENCES tools(id)
    )
  `);

  // ===== 微信通知配置表 =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      webhook_url TEXT DEFAULT '',
      enabled INTEGER DEFAULT 0,
      notify_immediately INTEGER DEFAULT 1,
      notify_scheduled INTEGER DEFAULT 1,
      schedule_interval_minutes INTEGER DEFAULT 60,
      notify_admin_ids TEXT DEFAULT '[]',
      last_notified_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 初始化通知配置（只有一行）
  const configExists = db.prepare('SELECT 1 FROM notification_config WHERE id = 1').get();
  if (!configExists) {
    db.prepare('INSERT INTO notification_config (id) VALUES (1)').run();
  }

  // 迁移：为 wechat_notification_logs 添加扩展字段
  try { db.exec('ALTER TABLE wechat_notification_logs ADD COLUMN repair_id INTEGER'); } catch (_) {}
  try { db.exec('ALTER TABLE wechat_notification_logs ADD COLUMN send_type TEXT DEFAULT "immediate"'); } catch (_) {}
  try { db.exec('ALTER TABLE wechat_notification_logs ADD COLUMN send_url TEXT'); } catch (_) {}

  // ===== 现场改善/通用型事项申请表 (2026-05-20 新增) =====
  db.exec(`
    CREATE TABLE IF NOT EXISTS improvement_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_no TEXT UNIQUE,
      title TEXT NOT NULL,
      requirement_desc TEXT NOT NULL,
      expected_result TEXT,
      deadline TEXT,
      applicant_id INTEGER NOT NULL,
      applicant_name TEXT NOT NULL,
      assigned_to_id INTEGER,
      assigned_to_name TEXT,
      status INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (applicant_id) REFERENCES users(id),
      FOREIGN KEY (assigned_to_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS action_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      action_plan TEXT,
      action_records TEXT,
      planned_completion TEXT,
      feedback_user_id INTEGER,
      feedback_user_name TEXT,
      feedback_time TEXT,
      acceptance_opinion TEXT,
      rejection_reason TEXT,
      completion_confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (request_id) REFERENCES improvement_requests(id) ON DELETE CASCADE
    );
  `);

  // ===== 设备排班模块（2026-05-23 新增）=====
  db.exec(`
    CREATE TABLE IF NOT EXISTS production_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_date TEXT NOT NULL,
      line_code TEXT NOT NULL,
      status INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(schedule_date, line_code)
    );

    CREATE TABLE IF NOT EXISTS schedule_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      staff_name TEXT NOT NULL,
      FOREIGN KEY (schedule_id) REFERENCES production_schedule(id) ON DELETE CASCADE
    );
  `);

  // ===== 值班巡查模块（2026-06-01 新增）=====
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspection_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      box_number TEXT DEFAULT '',
      responsible_person TEXT DEFAULT '',
      qr_token TEXT UNIQUE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS inspection_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      inspection_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('正常', '异常')),
      remark TEXT DEFAULT '',
      inspector TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (item_id) REFERENCES inspection_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_inspection_records_date ON inspection_records(inspection_date);
    CREATE INDEX IF NOT EXISTS idx_inspection_records_item ON inspection_records(item_id, inspection_date);
  `);

  // 初始化预设点检项目（仅在表为空时插入）
  const inspectionCount = db.prepare('SELECT COUNT(*) as cnt FROM inspection_items').get().cnt;
  if (inspectionCount === 0) {
    const crypto = require('crypto');
    const defaultItems = [
      // 3楼电箱开关
      { category: '3楼电箱开关', name: 'A线体电源', box_number: 'A-01', responsible_person: '' },
      { category: '3楼电箱开关', name: 'B线体电源', box_number: 'B-01', responsible_person: '' },
      { category: '3楼电箱开关', name: 'C线体电源', box_number: 'C-01', responsible_person: '' },
      { category: '3楼电箱开关', name: 'D线体电源', box_number: 'D-01', responsible_person: '' },
      { category: '3楼电箱开关', name: 'A线提升机电源', box_number: 'A-TSJ', responsible_person: '' },
      { category: '3楼电箱开关', name: 'B线提升机电源', box_number: 'B-TSJ', responsible_person: '' },
      { category: '3楼电箱开关', name: 'C线提升机电源', box_number: 'C-TSJ', responsible_person: '' },
      { category: '3楼电箱开关', name: 'D线提升机电源', box_number: 'D-TSJ', responsible_person: '' },
      { category: '3楼电箱开关', name: '老化房进电总开', box_number: 'LHF-ZK', responsible_person: '' },
      { category: '3楼电箱开关', name: 'A/B/C/D线照明开关', box_number: 'LIGHTING', responsible_person: '' },
      // 1楼电箱
      { category: '1楼电箱', name: '包装线A电源', box_number: 'P-A', responsible_person: '' },
      { category: '1楼电箱', name: '包装线B电源', box_number: 'P-B', responsible_person: '' },
      { category: '1楼电箱', name: '包装线C电源', box_number: 'P-C', responsible_person: '' },
      { category: '1楼电箱', name: '包装线D电源', box_number: 'P-D', responsible_person: '' },
      { category: '1楼电箱', name: '货梯电源', box_number: 'HT', responsible_person: '' },
      { category: '1楼电箱', name: '空压机1号', box_number: 'KYJ-1', responsible_person: '' },
      { category: '1楼电箱', name: '空压机2号', box_number: 'KYJ-2', responsible_person: '' },
      { category: '1楼电箱', name: '1楼照明总开', box_number: '1F-L', responsible_person: '' },
      // 门窗
      { category: '门窗', name: '1楼卷闸门1', box_number: '', responsible_person: '' },
      { category: '门窗', name: '1楼卷闸门2', box_number: '', responsible_person: '' },
      { category: '门窗', name: '1楼卷闸门3', box_number: '', responsible_person: '' },
      { category: '门窗', name: '3楼楼梯口大门', box_number: '', responsible_person: '' },
    ];
    const insertStmt = db.prepare(`
      INSERT INTO inspection_items (category, name, box_number, responsible_person, qr_token, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < defaultItems.length; i++) {
      const item = defaultItems[i];
      const token = crypto.randomBytes(8).toString('hex');
      insertStmt.run(item.category, item.name, item.box_number, item.responsible_person, token, i);
    }
    console.log(`  ✅ 值班巡查: 初始化 ${defaultItems.length} 个点检项目`);
  }

  console.log('✅ 数据库初始化完成');
}

// ===== 用户表初始化和默认管理员 =====
function initUsers() {
  const bcrypt = require('bcryptjs');
  
  // 检查并迁移旧的用户表结构
  const existingCols = db.prepare("PRAGMA table_info(users)").all();
  const hasSuperAdmin = existingCols.some(c => c.name === 'super_admin');
  
  // 如果是旧表结构，转换为三级角色（仅执行一次）
  if (existingCols.length > 0 && !hasSuperAdmin && !isMigrationDone('users_two_tier_to_three_tier')) {
    // 检查现有 admin 用户并迁移为 super_admin
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user' CHECK(role IN ('super_admin', 'admin', 'user', 'operator')),
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
      `);
      
      // 迁移数据，admin 转为 super_admin
      db.exec(`
        INSERT INTO users_new (id, username, password, role, status, created_at, updated_at)
        SELECT id, username, password, 
          CASE WHEN role = 'admin' THEN 'super_admin' ELSE 'user' END,
          status, created_at, updated_at
        FROM users;
        DROP TABLE IF EXISTS users;
        ALTER TABLE users_new RENAME TO users;
      `);
      markMigrationDone('users_two_tier_to_three_tier');
      console.log('  迁移: users 表升级为三级角色系统');
    } catch (e) {
      console.log('  迁移跳过:', e.message);
      db.exec('DROP TABLE IF EXISTS users_new');
    }
  }

  // 迁移：CHECK 约束添加 operator 角色（修复修改用户角色保存失效的 Bug）
  if (!isMigrationDone('users_add_operator_role')) {
    try {
      db.exec('PRAGMA foreign_keys = OFF');
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user' CHECK(role IN ('super_admin', 'admin', 'user', 'operator')),
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        );
      `);
      db.exec(`
        INSERT INTO users_new (id, username, password, role, status, created_at, updated_at)
        SELECT id, username, password, role, status, created_at, updated_at
        FROM users;
        DROP TABLE IF EXISTS users;
        ALTER TABLE users_new RENAME TO users;
      `);
      db.exec('PRAGMA foreign_keys = ON');
      markMigrationDone('users_add_operator_role');
      console.log('  迁移: users 表 CHECK 约束添加 operator 角色');
    } catch (e) {
      console.log('  迁移跳过 (users_add_operator_role):', e.message);
      db.exec('DROP TABLE IF EXISTS users_new');
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
  
  // 确保新表存在
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK(role IN ('super_admin', 'admin', 'user', 'operator')),
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 创建默认超级管理员
  const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role, status) VALUES (?, ?, ?, ?)').run('admin', hashedPassword, 'super_admin', 'active');
    console.log('  ✅ 默认超级管理员账号创建: admin / admin123 (超级管理员)');
  } else {
    // 确保现有 admin 账号是 super_admin 角色
    db.prepare("UPDATE users SET role = 'super_admin' WHERE username = 'admin'").run();
    console.log('  升级: admin 账号已设置为超级管理员');
  }

  // ===== 永久性设备管理员保护 =====
  // 每次初始化时确保李庆良和王艾博是设备管理员（防止被误降级）
  const permanentAdmins = ['李庆良', '王艾博'];
  for (const adminName of permanentAdmins) {
    const user = db.prepare('SELECT id, role FROM users WHERE username = ?').get(adminName);
    if (user && user.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(adminName);
      console.log(`  🔒 保护: ${adminName} 已设置为设备管理员`);
    }
  }
}

// 在 init 末尾调用
initUsers();

// ===== WAL Checkpoint：手动合并 WAL 文件到主数据库 =====
function checkpointWAL() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (e) {
    // checkpoint 失败不影响业务
  }
}

// 每 30 分钟自动执行一次 WAL checkpoint，防止 WAL 文件过大
setInterval(checkpointWAL, 30 * 60 * 1000);
// 启动后 2 分钟执行首次 checkpoint
setTimeout(checkpointWAL, 2 * 60 * 1000);

module.exports = { db, init, initUsers, checkpointWAL };
