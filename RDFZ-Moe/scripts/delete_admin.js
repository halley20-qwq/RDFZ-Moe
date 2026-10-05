// delete-admin.js
const { db } = require('../src/database');

// 从命令行获取参数
const [,, username] = process.argv;

if (!username) {
  console.log('❌ 错误：缺少参数');
  console.log('💡 正确用法：node delete-admin.js <要删除的用户名>');
  process.exit(1);
}

const trimmedUsername = username.trim();

try {
  // 1. 检查要删除的账号是否存在
  const admin = db.prepare('SELECT id FROM admins WHERE username = ?').get(trimmedUsername);
  if (!admin) {
    console.log(`❌ 错误：未找到名为 "${trimmedUsername}" 的管理员账号！`);
    process.exit(1);
  }

  // 2. 安全保护：检查总管理员数量（防止误删最后一个账号导致系统锁死）
  const { totalAdmins } = db.prepare('SELECT COUNT(*) as totalAdmins FROM admins').get();
  if (totalAdmins <= 1) {
    console.log('❌ 拒绝操作：当前系统中仅剩最后一个管理员账号，不能删除！');
    console.log('💡 提示：系统必须保留至少一个管理员账号。若需更换用户名，请使用账号修改功能。');
    process.exit(1);
  }

  // 3. 执行删除
  db.prepare('DELETE FROM admins WHERE id = ?').run(admin.id);

  console.log(`🗑️ 成功删除管理员账号：${trimmedUsername}`);
} catch (err) {
  console.error('❌ 执行失败：', err.message);
}