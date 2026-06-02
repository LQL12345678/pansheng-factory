#!/usr/bin/env node
/**
 * 维修记录迁移脚本 v4
 * 按设备类型+线体模糊匹配
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const OLD_DB = path.join(__dirname, 'devices.db');
const NEW_DB = path.join(__dirname, 'backend/db/equipment.db');

console.log('='.repeat(60));
console.log('维修记录迁移工具 v4 (按类型+线体匹配)');
console.log('='.repeat(60));

// 连接数据库
const oldDb = new DatabaseSync(OLD_DB);
const newDb = new DatabaseSync(NEW_DB);

console.log('\n1. 加载新数据库的设备...');
const devices = newDb.prepare('SELECT id, name, location, production_line FROM devices').all();
console.log('  ✓ 加载 ' + devices.length + ' 个设备');

// 构建设备类型+线体的映射
// 提取设备类型关键词
function extractType(deviceName) {
  const types = ['提升机', '平移机', '倍速链', '皮带线', '阻挡器', '打印机', 'AGV', '空压机', '冲压机', '升降机', '老化架', '滚筒线', '打包机', '导电轨', '返板机', '扫码枪', '行程开关'];
  for (const type of types) {
    if (deviceName.includes(type)) return type;
  }
  return null;
}

// 按类型+线体索引
const typeLineMap = {};
devices.forEach(dev => {
  const type = extractType(dev.name);
  if (type && dev.production_line) {
    const key = type + '_' + dev.production_line;
    if (!typeLineMap[key]) typeLineMap[key] = [];
    typeLineMap[key].push(dev.id);
  }
});

console.log('\n2. 读取旧数据库的维修记录...');
const repairs = oldDb.prepare(`
  SELECT r.*, d.name as device_name, d.area as device_area, d.line as device_line
  FROM repairs r 
  LEFT JOIN devices d ON r.device_id = d.id
`).all();
console.log('  ✓ 读取 ' + repairs.length + ' 条维修记录');

console.log('\n3. 开始迁移...');
let successCount = 0;
let errorCount = 0;
let unmatchedCount = 0;

const insertStmt = newDb.prepare(`
  INSERT INTO repairs (
    device_id, work_order_no, report_date,
    line, reporter, area, 
    fault_desc, fault_cause, solution, 
    repairman, stop_duration_minutes, remarks
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const repair of repairs) {
  try {
    // 提取设备类型
    const devName = repair.device_name || '';
    const line = repair.device_line || repair.line || '';
    
    // 提取类型关键词
    const type = extractType(devName);
    
    if (!type) {
      console.log('  ⚠ 无法识别设备类型: ' + devName);
      unmatchedCount++;
      continue;
    }
    
    // 尝试按类型+线体匹配
    const key = type + '_' + line;
    let deviceId = null;
    
    if (typeLineMap[key] && typeLineMap[key].length > 0) {
      deviceId = typeLineMap[key][0]; // 取第一个匹配的设备
    }
    
    if (!deviceId) {
      console.log('  ⚠ 无法匹配设备: ' + devName + ' (' + line + '/' + (repair.device_area || '') + ')');
      unmatchedCount++;
      continue;
    }
    
    // 插入维修记录
    insertStmt.run(
      deviceId,
      'MIG-' + String(repair.id).padStart(3, '0'),
      repair.report_date || null,
      repair.line || null,
      repair.reporter || null,
      repair.area || null,
      repair.fault_type || '未知故障',
      repair.problem_desc || null,
      repair.solution || null,
      repair.handler || '未知',
      repair.stop_duration_minutes || null,
      '迁移自旧数据库(ID:' + repair.id + ')'
    );
    
    successCount++;
    
  } catch (err) {
    console.log('  ✗ 插入失败: ' + err.message);
    errorCount++;
  }
}

console.log('\n' + '='.repeat(60));
console.log('迁移完成！');
console.log('='.repeat(60));
console.log('  ✓ 成功: ' + successCount + ' 条');
console.log('  ⚠ 未匹配: ' + unmatchedCount + ' 条');
console.log('  ✗ 失败: ' + errorCount + ' 条');

// 验证
const count = newDb.prepare('SELECT COUNT(*) as count FROM repairs').get().count;
console.log('\n新数据库中维修记录数: ' + count);

oldDb.close();
newDb.close();
