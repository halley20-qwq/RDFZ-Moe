// reset-database.js
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const { db, hashPassword } = require('../src/database');

// 判断命令行参数，如果传入 --force 则跳过确认提示
const isForce = process.argv.includes('--force');

// 创建交互界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 执行数据库重置的主函数
function performReset() {
  try {
    console.log('\n🔄 正在重置/格式化数据库...');

    // 使用数据库事务保证清理操作的原子性
    const resetTx = db.transaction(() => {
      // 1. 清空所有业务表数据
      db.prepare('DELETE FROM vote_logs').run();
      db.prepare('DELETE FROM match_candidates').run();
      db.prepare('DELETE FROM matches').run();
      db.prepare('DELETE FROM characters').run();
      db.prepare('DELETE FROM admins').run();

      // 2. 重新生成默认初始管理员账号 (admin / admin123)
      const defaultAdminId = uuidv4();
      const defaultHash = hashPassword('admin123');
      db.prepare('INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)')
        .run(defaultAdminId, 'admin', defaultHash);
    });

    // 执行事务
    resetTx();

    // 3. 执行 VACUUM 释放 SQLite 文件占用的空间，压缩 db 文件
    db.exec('VACUUM;');

    console.log('✅ 数据库格式化完成！');
    console.log('💡 已自动重新初始化默认管理员账号：');
    console.log('   • 初始用户名: admin');
    console.log('   • 初始密  码: admin123\n');
  } catch (err) {
    console.error('❌ 重置数据库失败：', err.message);
  } finally {
    rl.close();
  }
}

// 如果使用了 --force 参数，直接执行重置
if (isForce) {
  performReset();
} else {
  // 交互式二次确认提示
  console.log('⚠️  【高危警告】您即将在数据库中执行格式化操作！');
  console.log('该操作将彻底清空以下数据：');
  console.log('  1. 角色库中的所有角色 (characters)');
  console.log('  2. 所有历史与进行中的赛程 (matches & match_candidates)');
  console.log('  3. 所有用户的投票历史记录 (vote_logs)');
  console.log('  4. 所有管理员账号 (admins)\n');

  rl.question('如果您确认要清空数据库，请输入大写 "YES" 并回车: ', (answer) => {
    if (answer.trim() === 'YES') {
      performReset();
    } else {
      console.log('❌ 操作已取消，数据库未被修改。');
      rl.close();
    }
  });
}