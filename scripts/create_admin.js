// create-admin.js
const { db, hashPassword } = require('../src/database');
const { v4: uuidv4 } = require('uuid');

// 从命令行获取参数
const [,, username, password] = process.argv;

if (!username || !password) {
  console.log('❌ 错误：缺少参数');
  console.log('💡 正确用法：node create-admin.js <用户名> <密码>');
  process.exit(1);
}

if (password.length < 6) {
  console.log('❌ 错误：密码长度至少需要 6 位');
  process.exit(1);
}

try {
  // 检查用户名是否已存在
  const exist = db.prepare('SELECT COUNT(*) as count FROM admins WHERE username = ?').get(username.trim());
  if (exist.count > 0) {
    console.log(`❌ 错误：用户名 "${username.trim()}" 已存在，请更换其他用户名！`);
    process.exit(1);
  }

  // 插入新管理员
  const newId = uuidv4();
  const passwordHash = hashPassword(password.trim());
  
  db.prepare('INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)')
    .run(newId, username.trim(), passwordHash);

  console.log(`🎉 成功添加管理员账号：${username.trim()}`);
} catch (err) {
  console.error('❌ 执行失败：', err.message);
}