const xlsx = require('xlsx');
const path = require('path');
const { db } = require('./db');

const workbook = xlsx.readFile('C:/Users/Admin/Desktop/模板1_设备基础档案_已填写.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

let imported = 0, skipped = 0;
const stmt = db.prepare(`
  INSERT OR IGNORE INTO devices
    (device_no, name, category, model, location,
     production_line, supplier, install_date, maintenance_cycle_days,
     responsible_person, status, remarks)
  VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let i = 4; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[0] || !row[1] || !row[2] || !row[4]) { skipped++; continue; }
  try {
    // Excel日期序列号转换
    let installDate = row[7];
    if (typeof installDate === 'number') {
      const d = new Date(Math.round((installDate - 25569) * 86400 * 1000));
      installDate = d.toISOString().split('T')[0];
    }
    stmt.run(
      String(row[0]), String(row[1]), String(row[2]), String(row[3]||''), String(row[4]),
      String(row[5]||''), String(row[6]||''), installDate || null, Number(row[8])||null,
      String(row[9]||''), String(row[10]||'正常'), String(row[11]||'')
    );
    imported++;
  } catch(e) { console.error(`行${i+1}:`, e.message); skipped++; }
}
console.log(`✅ 导入完成：成功${imported}条，跳过${skipped}条`);
