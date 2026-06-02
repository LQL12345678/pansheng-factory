const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'db/equipment.db'));

// 检查并添加新字段
const columnsToAdd = [
  { name: 'line', type: 'TEXT', default: null },
  { name: 'reporter', type: 'TEXT', default: null },
  { name: 'area', type: 'TEXT', default: null },
  { name: 'stop_duration_minutes', type: 'INTEGER', default: null }
];

// 获取当前表的列
const columns = db.prepare("PRAGMA table_info(repairs)").all();
const existingColumnNames = columns.map(c => c.name);

for (const col of columnsToAdd) {
  if (!existingColumnNames.includes(col.name)) {
    try {
      db.exec(`ALTER TABLE repairs ADD COLUMN ${col.name} ${col.type}`);
      console.log(`✅ 已添加字段：${col.name}`);
    } catch (e) {
      console.log(`⚠️ 字段 ${col.name} 可能已存在`);
    }
  } else {
    console.log(`ℹ️ 字段 ${col.name} 已存在，跳过`);
  }
}

// 验证结果
console.log('\n当前 repairs 表结构：');
const newColumns = db.prepare("PRAGMA table_info(repairs)").all();
newColumns.forEach(c => {
  console.log(`  - ${c.name} (${c.type})`);
});

db.close();
console.log('\n✅ 数据库迁移完成！');
