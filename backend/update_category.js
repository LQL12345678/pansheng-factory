const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'db/equipment.db'));

// 先查看所有设备类别
console.log('当前设备类别：');
const categories = db.prepare('SELECT DISTINCT category FROM devices ORDER BY category').all();
categories.forEach(c => console.log(' -', c.category));

// 查看有多少条"冲压机"记录
const count = db.prepare('SELECT COUNT(*) as count FROM devices WHERE category = ?').get('冲压机');
console.log(`\n类别为"冲压机"的设备数量：${count.count}`);

if (count.count > 0) {
  // 更新设备表
  const result = db.prepare("UPDATE devices SET category = ? WHERE category = ?").run('其他', '冲压机');
  console.log(`✅ 已将 ${result.changes} 条记录的类别从"冲压机"改为"其他"`);
} else {
  console.log('⚠️ 没有找到类别为"冲压机"的设备');
}

// 更新设备类别表（如果存在）
try {
  const catResult = db.prepare('UPDATE device_categories SET name = ? WHERE name = ?').run('其他', '冲压机');
  if (catResult.changes > 0) {
    console.log(`✅ 已更新设备类别表中的"冲压机"为"其他"`);
  }
} catch (e) {
  console.log('（设备类别表不存在或无需更新）');
}

// 验证结果
console.log('\n更新后的设备类别：');
const newCategories = db.prepare('SELECT DISTINCT category FROM devices ORDER BY category').all();
newCategories.forEach(c => console.log(' -', c.category));

db.close();
