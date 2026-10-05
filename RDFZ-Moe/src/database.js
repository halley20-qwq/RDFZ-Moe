const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// 确保 data/ 目录存在
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 数据库连接指向 data/data.db
const db = new Database(path.join(dataDir, 'data.db'));

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// 初始化基础表与管理员表
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK(match_type IN ('group', 'pk')),
    status INTEGER DEFAULT 1, -- 0:未开始, 1:进行中, 2:已结束归档
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS match_candidates (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    votes INTEGER DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    UNIQUE(match_id, character_id)
  );

  CREATE TABLE IF NOT EXISTS vote_logs (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    voter_identity TEXT NOT NULL,
    client_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
  );

  -- 管理员账号表
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const columns = db.prepare("PRAGMA table_info(matches)").all().map(c => c.name);

if (!columns.includes('start_at')) {
  db.exec("ALTER TABLE matches ADD COLUMN start_at DATETIME;");
}
if (!columns.includes('end_at')) {
  db.exec("ALTER TABLE matches ADD COLUMN end_at DATETIME;");
}

// 密码哈希辅助函数 (使用 sha256 + salt)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'rdfz_moe_salt_2026').digest('hex');
}

// 如果没有管理员，初始化默认账号 admin / admin123
const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
if (adminCount === 0) {
  const defaultAdminId = crypto.randomUUID();
  const defaultHash = hashPassword('admin123');
  db.prepare('INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)').run(defaultAdminId, 'admin', defaultHash);
  console.log('💡 首次初始化：已创建默认管理员账号: admin，默认密码: admin123');
}

module.exports = { db, hashPassword };