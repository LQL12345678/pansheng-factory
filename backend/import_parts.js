/**
 * 零部件库存导入脚本
 * 从 C:/Users/Admin/Desktop/零部件库存.xlsx 导入数据到 parts 表
 * 按物品类别字母/拼音顺序排布，part_no 格式: PART-类别缩写-序号
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const xlsx = require('xlsx');

const db = new DatabaseSync(path.join(__dirname, 'db/equipment.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// 读取Excel
const wb = xlsx.readFile('C:/Users/Admin/Desktop/零部件库存.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

// 第0行是标题行，第1行是列头，数据从第2行开始
// 列顺序: 0=序号, 1=物品类别, 2=物品名称, 3=品牌, 4=型号(spec), 5=单位, 6=单价, 7=库存数量, 8=安全库存, 9=存放地, 10=状态
const dataRows = [];
for (let i = 2; i < raw.length; i++) {
  const row = raw[i];
  if (!row[2] || String(row[2]).trim() === '') continue; // 跳过空行
  dataRows.push({
    seq: parseInt(row[0]) || i - 1,
    category: String(row[1] || '').trim(),
    name: String(row[2] || '').trim(),
    brand: String(row[3] || '').trim(),
    spec: String(row[4] || '').trim(),
    unit: String(row[5] || '个').trim(),
    unit_price: parseFloat(row[6]) || null,
    stock: parseInt(row[7]) || 0,
    safety_stock: parseInt(row[8]) || 0,
    storage_location: String(row[9] || '设备间货架').trim(),
    remarks: String(row[10] || '').trim(),
  });
}

// 按物品类别排序（先按类别，再按原序号）
dataRows.sort((a, b) => {
  if (a.category < b.category) return -1;
  if (a.category > b.category) return 1;
  return a.seq - b.seq;
});

// 生成part_no: PART-四位序号
const insert = db.prepare(`
  INSERT INTO parts (part_no, name, spec, brand, applicable_devices,
    storage_location, stock, safety_stock, unit, unit_price,
    supplier, purchase_cycle_days, remarks, category)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertLog = db.prepare(`
  INSERT INTO inventory_logs (log_no, log_date, part_id, operation_type,
    quantity, handler, remarks)
  VALUES (?, date('now','localtime'), ?, '入库', ?, '系统初始化', ?)
`);

let imported = 0;
db.exec('BEGIN');
try {
  dataRows.forEach((row, idx) => {
    const partNo = `PART-${String(idx + 1).padStart(4, '0')}`;
    try {
      const result = insert.run(
        partNo,
        row.name,
        row.spec || '-',
        row.brand || '',
        '',
        row.storage_location,
        row.stock,
        row.safety_stock,
        row.unit,
        row.unit_price,
        '',
        null,
        row.remarks || '',
        row.category
      );
      if (row.stock > 0) {
        insertLog.run(
          'INIT-' + Date.now() + '-' + idx,
          result.lastInsertRowid,
          row.stock,
          '台账初始化导入'
        );
      }
      imported++;
    } catch (e) {
      console.error(`跳过第${idx + 1}条 [${row.category}/${row.name}]: ${e.message}`);
    }
  });
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

const total = db.prepare('SELECT COUNT(*) as c FROM parts').get();
console.log(`✅ 导入完成！成功: ${imported}/${dataRows.length} 条`);
console.log(`📦 parts 表当前总数: ${total.c}`);

// 按类别统计
const stats = db.prepare(`
  SELECT category, COUNT(*) as cnt 
  FROM parts 
  GROUP BY category 
  ORDER BY category
`).all();
console.log('\n📊 各类别统计:');
stats.forEach(s => console.log(`  ${s.category}: ${s.cnt} 条`));
