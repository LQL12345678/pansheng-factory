const { DatabaseSync } = require('node:sqlite');

const db1 = new DatabaseSync('./devices.db');
console.log('=== 旧数据库设备 ===');
db1.prepare('SELECT * FROM devices').all().forEach(d => {
  console.log(d.id + ': ' + d.name + ' (' + (d.line || '') + '/' + (d.area || '') + ')');
});
db1.close();

const db2 = new DatabaseSync('./backend/db/equipment.db');
console.log('\n=== 新数据库前20个设备 ===');
db2.prepare('SELECT id, name, location, production_line FROM devices LIMIT 20').all().forEach(d => {
  console.log(d.id + ': ' + d.name + ' (' + (d.production_line || '') + '/' + (d.location || '') + ')');
});
db2.close();
