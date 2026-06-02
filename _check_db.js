const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join('C:\\Users\\Admin\\WorkBuddy\\2026-05-10-task-1\\backend\\db', 'equipment.db'));

try {
  db.exec('PRAGMA integrity_check;');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('✅ Integrity check passed');
  console.log('Tables (' + tables.length + '):', tables.map(r => r.name).join(', '));

  const counts = {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    devices: db.prepare('SELECT COUNT(*) as c FROM devices').get().c,
    repairs: db.prepare('SELECT COUNT(*) as c FROM repairs').get().c,
    parts: db.prepare('SELECT COUNT(*) as c FROM parts').get().c,
    tools: db.prepare('SELECT COUNT(*) as c FROM tools').get().c,
  };
  console.log('Record counts:', JSON.stringify(counts));
} catch(e) {
  console.error('❌ Error:', e);
}

db.close();
console.log('File size:', require('fs').statSync('C:\\Users\\Admin\\WorkBuddy\\2026-05-10-task-1\\backend\\db\\equipment.db').size, 'bytes');
