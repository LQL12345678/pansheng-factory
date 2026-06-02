#!/usr/bin/env node
/**
 * 维修记录迁移脚本 v3
 * 从 devices.db 迁移维修记录到 backend/db/equipment.db
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const OLD_DB = path.join(__dirname, 'devices.db');
const NEW_DB = path.join(__dirname, 'backend/db/equipment.db');

console.log('='.repeat(60));
console.log('维修记录迁移工具 v3');
console.log('='.repeat(60));

// 连接数据库
const oldDb = new DatabaseSync(OLD_DB);
const newDb = new DatabaseSync(NEW_DB);

console.log('\n1. 加载新数据库的设备映射...');
const deviceMap = {};

// 构建新数据库的设备映射
const devices = newDb.prepare('SELECT id, device_no, name, location, production_line FROM devices').all();
devices.forEach(dev => {
  const nameKey = `${dev.name}`;
  const lineKey = `${dev.name}_${dev.production_line || ''}`;
  const locationKey = `${dev.name}_${dev.location || ''}`;
  
  if (!deviceMap[nameKey]) deviceMap[nameKey] = dev.id;
  if (!deviceMap[lineKey]) deviceMap[lineKey] = dev.id;
  if (!deviceMap[locationKey]) deviceMap[locationKey] = dev.id;
});

console.log(`  ✓ 加载 ${devices.length} 个设备`);

console.log('\n2. 读取旧数据库的设备信息和维修记录...');
const repairs = oldDb.prepare(`
  SELECT r.*, d.name as device_name, d.area as device_area, d.line as device_line, d.type as device_type
  FROM repairs r 
  LEFT JOIN devices d ON r.device_id = d.id
`).all();
console.log(`  ✓ 读取 ${repairs.length} 条维修记录`);

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
    // 尝试匹配设备
    let deviceId = null;
    const devName = repair.device_name || '';
    const line = repair.device_line || repair.line || '';
    const area = repair.device_area || repair.area || '';
    
    // 匹配键
    const key1 = `${devName}_${line}`;
    const key2 = `${devName}_${area}`;
    const key3 = `${devName}`;
    
    if (deviceMap[key1]) {
      deviceId = deviceMap[key1];
    } else if (deviceMap[key2]) {
      deviceId = deviceMap[key2];
    } else if (deviceMap[key3]) {
      deviceId = deviceMap[key3];
    }
    
    if (!deviceId) {
      console.log(`  ⚠ 无法匹配设备: ${devName} (${line}/${area})`);
      unmatchedCount++;
      continue;
    }
    
    // 插入维修记录
    // 字段映射:
    // old.fault_type -> new.fault_desc (故障现象)
    // old.problem_desc -> new.fault_cause (故障原因)
    // old.solution -> new.solution (处理方法)
    // old.handler -> new.repairman (处理人)
    
    insertStmt.run(
      deviceId,
      `MIG-${String(repair.id).padStart(3, '0')}`, // work_order_no
      repair.report_date || null,
      repair.line || null,
      repair.reporter || null,
      repair.area || null,
      repair.fault_type || '未知故障', // fault_desc (NOT NULL)
      repair.problem_desc || null, // fault_cause
      repair.solution || null, // solution
      repair.handler || '未知', // repairman (NOT NULL)
      repair.stop_duration_minutes || null,
      `迁移自旧数据库(ID:${repair.id})`
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
