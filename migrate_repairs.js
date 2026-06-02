#!/usr/bin/env node
/**
 * 维修记录迁移脚本
 * 从 devices.db 迁移维修记录到 backend/db/equipment.db
 * 通过设备名+线体匹配设备ID
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const OLD_DB = path.join(__dirname, 'devices.db');
const NEW_DB = path.join(__dirname, 'backend/db/equipment.db');

console.log('='.repeat(60));
console.log('维修记录迁移工具');
console.log('='.repeat(60));

// 连接数据库
const oldDb = new DatabaseSync(OLD_DB);
const newDb = new DatabaseSync(NEW_DB);

console.log('\n1. 加载新数据库的设备映射...');
const deviceMap = {};

// 构建新数据库的设备映射: "设备名_线体" -> device_id
const devices = newDb.prepare('SELECT id, name, location, production_line FROM devices').all();
devices.forEach(dev => {
  const key1 = `${dev.name}_${dev.production_line || ''}`;
  const key2 = `${dev.name}_${dev.location || ''}`;
  deviceMap[key1] = dev.id;
  deviceMap[key2] = dev.id;
  deviceMap[dev.name] = dev.id;
});

console.log(`  ✓ 加载 ${devices.length} 个设备`);

console.log('\n2. 读取旧数据库的维修记录...');
const repairs = oldDb.prepare('SELECT * FROM repairs').all();
console.log(`  ✓ 读取 ${repairs.length} 条维修记录`);

console.log('\n3. 开始迁移...');
let successCount = 0;
let errorCount = 0;
let unmatchedCount = 0;

const insertStmt = newDb.prepare(`
  INSERT INTO repairs (
    device_id, work_order_no, report_date, report_time,
    line, reporter, area, fault_desc, fault_type, fault_cause,
    solution, parts_used, repairman, accept_time, finish_time,
    duration_minutes, stop_duration_minutes, status, remarks
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const repair of repairs) {
  try {
    // 尝试匹配设备
    let deviceId = null;
    const devName = repair.device_name || '';
    const line = repair.line || '';
    const area = repair.area || '';
    
    // 匹配键
    const key1 = `${devName}_${line}`;
    const key2 = `${devName}_${area}`;
    
    if (deviceMap[key1]) {
      deviceId = deviceMap[key1];
    } else if (deviceMap[key2]) {
      deviceId = deviceMap[key2];
    } else if (deviceMap[devName]) {
      deviceId = deviceMap[devName];
    }
    
    if (!deviceId) {
      console.log(`  ⚠ 无法匹配设备: ${devName} (${line}/${area})`);
      unmatchedCount++;
      continue;
    }
    
    // 插入维修记录
    insertStmt.run(
      deviceId,
      repair.work_order_no || null,
      repair.report_date || null,
      repair.report_time || null,
      repair.line || null,
      repair.reporter || null,
      repair.area || null,
      repair.fault_desc || null,
      repair.fault_type || null,
      repair.fault_cause || null,
      repair.solution || null,
      repair.parts_used || null,
      repair.repairman || null,
      repair.accept_time || null,
      repair.finish_time || null,
      repair.duration_minutes || null,
      repair.stop_duration_minutes || null,
      repair.status || '待处理',
      repair.remarks || null
    );
    
    successCount++;
    
  } catch (err) {
    console.log(`  ✗ 插入失败: ${err.message}`);
    errorCount++;
  }
}

console.log('\n' + '='.repeat(60));
console.log('迁移完成！');
console.log('='.repeat(60));
console.log(`  ✓ 成功: ${successCount} 条`);
console.log(`  ⚠ 未匹配: ${unmatchedCount} 条`);
console.log(`  ✗ 失败: ${errorCount} 条`);

// 验证
const count = newDb.prepare('SELECT COUNT(*) as count FROM repairs').get().count;
console.log(`\n新数据库中维修记录数: ${count}`);

oldDb.close();
newDb.close();
