const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db, hashPassword } = require('./database');
const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const server = http.createServer(app);
const path = require('path');

// 静态托管 public 目录
app.use(express.static(path.join(__dirname, '../public')));
app.use(cors());
app.use(express.json());

const JWT_SECRET = 'rdfz_moe_jwt_secret_key_2026';
const io = new Server(server, { cors: { origin: '*' } });

// 获取客户端真实 IP
function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
  if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
  return ip || '127.0.0.1';
}

// 🔐 管理员身份验证中间件
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ success: false, message: '未提供身份凭证，请登录' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: '登录已过期或凭证无效，请重新登录' });
  }
}

// ===================== 🔓 用户端原有 API (保留) =====================
// (之前的 /api/matches/active, /api/matches/history, /api/vote 逻辑保持不变...)

// 投票事务 (保留之前的 submitVoteTransaction)
const submitVoteTransaction = db.transaction((matchId, characterId, visitorId, clientIp) => {
  if (!visitorId) throw new Error('设备安全指纹生成失败，请刷新页面重试');
  const match = db.prepare('SELECT status, match_type FROM matches WHERE id = ?').get(matchId);
  if (!match) throw new Error('未找到该场次');
  if (match.status !== 1) throw new Error('当前场次不在投票时间内');

  const maxVotes = match.match_type === 'group' ? 4 : 1;
  const { totalVoted } = db.prepare('SELECT COUNT(*) as totalVoted FROM vote_logs WHERE match_id = ? AND voter_identity = ?').get(matchId, visitorId);
  if (totalVoted >= maxVotes) throw new Error(`当前设备在此场次的 ${maxVotes} 张票已用完`);

  if (clientIp) {
    const { ipVoted } = db.prepare('SELECT COUNT(*) as ipVoted FROM vote_logs WHERE match_id = ? AND client_ip = ?').get(matchId, clientIp);
    if (ipVoted >= maxVotes * 10) throw new Error('当前网络环境投票频繁，请切换网络或稍后再试');
  }

  const { charVoted } = db.prepare('SELECT COUNT(*) as charVoted FROM vote_logs WHERE match_id = ? AND voter_identity = ? AND character_id = ?').get(matchId, visitorId, characterId);
  if (charVoted > 0) throw new Error('同一角色限投一票，您已为她投过票');

  const logId = uuidv4();
  db.prepare('INSERT INTO vote_logs (id, match_id, character_id, voter_identity, client_ip) VALUES (?, ?, ?, ?, ?)').run(logId, matchId, characterId, visitorId, clientIp);
  db.prepare('UPDATE match_candidates SET votes = votes + 1 WHERE match_id = ? AND character_id = ?').run(matchId, characterId);

  return db.prepare('SELECT votes FROM match_candidates WHERE match_id = ? AND character_id = ?').get(matchId, characterId).votes;
});

app.get('/api/matches/active', (req, res) => {
  const { visitorId } = req.query;
  const match = db.prepare('SELECT * FROM matches WHERE status = 1 ORDER BY created_at DESC LIMIT 1').get();
  if (!match) return res.json({ match: null, candidates: [], myVotedCharacterIds: [] });

  const candidates = db.prepare(`
    SELECT mc.id, mc.match_id, mc.character_id, mc.votes, c.name as char_name, c.avatar_url as char_avatar
    FROM match_candidates mc JOIN characters c ON mc.character_id = c.id WHERE mc.match_id = ?
  `).all(match.id).map(i => ({ id: i.id, match_id: i.match_id, character_id: i.character_id, votes: i.votes, characters: { id: i.character_id, name: i.char_name, avatar_url: i.char_avatar } }));

  let myVotedCharacterIds = [];
  if (visitorId) {
    myVotedCharacterIds = db.prepare('SELECT character_id FROM vote_logs WHERE match_id = ? AND voter_identity = ?').all(match.id, visitorId).map(v => v.character_id);
  }
  res.json({ match, candidates, myVotedCharacterIds });
});

app.get('/api/matches/history', (req, res) => {
  const matches = db.prepare('SELECT * FROM matches WHERE status = 2 ORDER BY created_at DESC').all();
  res.json({ matches });
});

app.get('/api/matches/history/:matchId', (req, res) => {
  const { matchId } = req.params;
  const { visitorId } = req.query;
  const candidates = db.prepare(`
    SELECT mc.id, mc.match_id, mc.character_id, mc.votes, c.name as char_name, c.avatar_url as char_avatar
    FROM match_candidates mc JOIN characters c ON mc.character_id = c.id WHERE mc.match_id = ?
  `).all(matchId).map(i => ({ id: i.id, match_id: i.match_id, character_id: i.character_id, votes: i.votes, characters: { id: i.character_id, name: i.char_name, avatar_url: i.char_avatar } }));

  let historyMyVotedIds = [];
  if (visitorId) {
    historyMyVotedIds = db.prepare('SELECT character_id FROM vote_logs WHERE match_id = ? AND voter_identity = ?').all(matchId, visitorId).map(v => v.character_id);
  }
  res.json({ candidates, historyMyVotedIds });
});

app.post('/api/vote', (req, res) => {
  const { matchId, characterId, visitorId } = req.body;
  const clientIp = getClientIp(req);
  try {
    const newVotes = submitVoteTransaction(matchId, characterId, visitorId, clientIp);
    io.emit('vote_update', { matchId, characterId, newVotes });
    res.json({ success: true, message: '投票成功！', newVotes });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});


// ===================== 🔐 管理端专享 API =====================

// 1. 管理员登录
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, message: '请输入用户名和密码' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || admin.password_hash !== hashPassword(password)) {
    return res.json({ success: false, message: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, username: admin.username });
});

// 2. 查看所有角色
app.get('/api/admin/characters', authMiddleware, (req, res) => {
  const characters = db.prepare('SELECT * FROM characters ORDER BY created_at DESC').all();
  res.json({ success: true, characters });
});

// 3. 添加角色
app.post('/api/admin/characters', authMiddleware, (req, res) => {
  const { name, avatar_url } = req.body;
  if (!name || !avatar_url) return res.json({ success: false, message: '请提供角色姓名和头像图片 URL' });

  const id = uuidv4();
  db.prepare('INSERT INTO characters (id, name, avatar_url) VALUES (?, ?, ?)').run(id, name, avatar_url);
  res.json({ success: true, message: '角色添加成功！' });
});

// 4. 删除角色
app.delete('/api/admin/characters/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  res.json({ success: true, message: '角色已删除' });
});

// 5. 查看所有赛程 (含详细选手票数)
app.get('/api/admin/matches', authMiddleware, (req, res) => {
  const matches = db.prepare('SELECT * FROM matches ORDER BY created_at DESC').all();
  const result = matches.map(m => {
    const candidates = db.prepare(`
      SELECT mc.votes, c.id as character_id, c.name, c.avatar_url
      FROM match_candidates mc JOIN characters c ON mc.character_id = c.id
      WHERE mc.match_id = ?
    `).all(m.id);
    return { ...m, candidates };
  });
  res.json({ success: true, matches: result });
});

// 6. 添加新赛程 (指定赛制和参选角色)
app.post('/api/admin/matches', authMiddleware, (req, res) => {
  const { title, match_type, character_ids } = req.body; // match_type: 'group' | 'pk'
  if (!title || !match_type || !Array.isArray(character_ids) || character_ids.length === 0) {
    return res.json({ success: false, message: '请完整填写赛程标题、赛制并至少勾选一位角色' });
  }

  const matchId = uuidv4();

  // 使用事务批量创建场次和关联候选人
  const createMatchTx = db.transaction(() => {
    db.prepare('INSERT INTO matches (id, title, match_type, status) VALUES (?, ?, ?, 0)').run(matchId, title, match_type);
    const insertCandidate = db.prepare('INSERT INTO match_candidates (id, match_id, character_id, votes) VALUES (?, ?, ?, 0)');
    for (const charId of character_ids) {
      insertCandidate.run(uuidv4(), matchId, charId);
    }
  });

  createMatchTx();
  res.json({ success: true, message: '赛程创建成功！(默认状态为未开始)' });
});

// 7. 修改赛程状态 (0:未开始, 1:进行中, 2:已结束)
app.patch('/api/admin/matches/:id/status', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 0, 1, 2

  if (![0, 1, 2].includes(status)) return res.json({ success: false, message: '无效的状态码' });

  // 如果将某场设置为 1(进行中)，可选将其他进行中的调整为 2(已结束)，保证只有一场进行中
  const updateStatusTx = db.transaction(() => {
    if (status === 1) {
      db.prepare('UPDATE matches SET status = 2 WHERE status = 1').run();
    }
    db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, id);
  });

  updateStatusTx();
  res.json({ success: true, message: '赛程状态修改成功！' });
});

// 8. 查看投票日志 (带简单搜索/分页)
app.get('/api/admin/logs', authMiddleware, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 30;
  const offset = (page - 1) * limit;

  const logs = db.prepare(`
    SELECT vl.id, vl.match_id, vl.character_id, vl.voter_identity, vl.client_ip, vl.created_at,
           m.title as match_title, c.name as character_name
    FROM vote_logs vl
    JOIN matches m ON vl.match_id = m.id
    JOIN characters c ON vl.character_id = c.id
    ORDER BY vl.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const { total } = db.prepare('SELECT COUNT(*) as total FROM vote_logs').get();

  res.json({ success: true, logs, total, page, totalPages: Math.ceil(total / limit) });
});

// 9. 删除特定投票记录 (自动扣减票数并实时推送)
app.delete('/api/admin/votes/:logId', authMiddleware, (req, res) => {
  const { logId } = req.params;

  const deleteVoteTx = db.transaction(() => {
    const log = db.prepare('SELECT match_id, character_id FROM vote_logs WHERE id = ?').get(logId);
    if (!log) throw new Error('找不到该条投票记录');

    // 1. 删除日志
    db.prepare('DELETE FROM vote_logs WHERE id = ?').run(logId);

    // 2. 扣减对应票数
    db.prepare('UPDATE match_candidates SET votes = MAX(0, votes - 1) WHERE match_id = ? AND character_id = ?')
      .run(log.match_id, log.character_id);

    // 3. 查询扣减后的票数
    const updated = db.prepare('SELECT votes FROM match_candidates WHERE match_id = ? AND character_id = ?')
      .get(log.match_id, log.character_id);

    return {
      matchId: log.match_id,
      characterId: log.character_id,
      newVotes: updated ? updated.votes : 0
    };
  });

  try {
    const result = deleteVoteTx();

    // 广播最新的票数更新到所有客户端
    io.emit('vote_update', { matchId: result.matchId, characterId: result.characterId, newVotes: result.newVotes });

    res.json({ success: true, message: '投票记录已删除，对应票数已扣减' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===================== 📊 Excel 批量导入 API =====================

/**
 * 1. 批量导入角色
 * Excel 字段要求表头为：【角色名称】、【头像链接】（或 name, avatar_url）
 */
app.post('/api/admin/characters/batch-import', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: '请选择要上传的 Excel 文件' });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let addedCount = 0;
    let skippedCount = 0;

    const importTx = db.transaction(() => {
      const insertStmt = db.prepare('INSERT INTO characters (id, name, avatar_url) VALUES (?, ?, ?)');
      const checkStmt = db.prepare('SELECT COUNT(*) as count FROM characters WHERE name = ?');

      for (const row of rows) {
        // 兼容中文/英文表头
        const name = (row['角色名称'] || row['name'] || '').toString().trim();
        const avatar_url = (row['头像链接'] || row['avatar_url'] || '').toString().trim();

        if (!name || !avatar_url) {
          skippedCount++;
          continue;
        }

        // 重名校验：如果角色已存在，则跳过
        if (checkStmt.get(name).count > 0) {
          skippedCount++;
          continue;
        }

        insertStmt.run(uuidv4(), name, avatar_url);
        addedCount++;
      }
    });

    importTx();

    res.json({
      success: true,
      message: `成功导入 ${addedCount} 个角色！` + (skippedCount > 0 ? `（自动跳过空行或同名角色 ${skippedCount} 条）` : '')
    });
  } catch (err) {
    res.json({ success: false, message: 'Excel 文件解析失败：' + err.message });
  }
});

/**
 * 2. 批量导入赛程
 * Excel 字段要求表头为：【赛程标题】、【赛制】、【参赛角色】
 * - 赛制填写：小组赛 (或 group) / PK赛 (或 pk)
 * - 参赛角色填写：角色名称，多个角色用英文逗号、中文逗号或分号隔开 (如 "凉宫春日, 八奈见杏菜")
 */
// 兼容处理 Excel 日期与文本时间的解析 Helper 函数
function parseExcelDate(val) {
  if (!val) return null;
  // 如果 Excel 单元格被 SheetJS 自动解析为了 JS Date 对象
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString();
  
  const str = val.toString().trim();
  if (!str) return null;

  // 尝试解析字符串（如 "2026-10-04 10:00"）
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * 升级版：批量导入赛程 (支持开始时间/结束时间)
 */
app.post('/api/admin/matches/batch-import', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: '请选择要上传的 Excel 文件' });

  try {
    // cellDates: true 自动将 Excel 时间单元格转换为 JS Date 对象
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let addedCount = 0;
    const errorMessages = [];

    const importTx = db.transaction(() => {
      // 🌟 SQL 增加了 start_at 和 end_at 字段
      const insertMatchStmt = db.prepare(`
        INSERT INTO matches (id, title, match_type, status, start_at, end_at) 
        VALUES (?, ?, ?, 0, ?, ?)
      `);
      const insertCandidateStmt = db.prepare('INSERT INTO match_candidates (id, match_id, character_id, votes) VALUES (?, ?, ?, 0)');
      const getCharStmt = db.prepare('SELECT id FROM characters WHERE name = ?');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const lineNum = i + 2;

        const title = (row['赛程标题'] || row['title'] || '').toString().trim();
        let matchType = (row['赛制'] || row['match_type'] || '').toString().trim().toLowerCase();
        const charNamesStr = (row['参赛角色'] || row['character_names'] || '').toString().trim();

        // 🌟 新增：解析【开始时间】与【结束时间】
        const startAtRaw = row['开始时间'] || row['start_at'];
        const endAtRaw = row['结束时间'] || row['end_at'];
        const startAt = parseExcelDate(startAtRaw);
        const endAt = parseExcelDate(endAtRaw);

        if (['小组赛', 'group'].includes(matchType)) matchType = 'group';
        else if (['pk', '1v1', '淘汰赛', 'pk赛'].includes(matchType)) matchType = 'pk';

        if (!title || !['group', 'pk'].includes(matchType) || !charNamesStr) {
          errorMessages.push(`第 ${lineNum} 行：数据不完整或赛制填写不正确`);
          continue;
        }

        const charNames = charNamesStr.split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
        const charIds = [];

        for (const charName of charNames) {
          const charRecord = getCharStmt.get(charName);
          if (charRecord) {
            charIds.push(charRecord.id);
          } else {
            errorMessages.push(`第 ${lineNum} 行：角色“${charName}”在数据库中未找到，已跳过此角色`);
          }
        }

        const uniqueCharIds = [...new Set(charIds)];

        if (uniqueCharIds.length === 0) {
          errorMessages.push(`第 ${lineNum} 行：找不到任何匹配的参赛角色，无法创建赛程`);
          continue;
        }

        const matchId = uuidv4();
        // 🌟 写入 startAt 和 endAt
        insertMatchStmt.run(matchId, title, matchType, startAt, endAt);

        for (const charId of uniqueCharIds) {
          insertCandidateStmt.run(uuidv4(), matchId, charId);
        }

        addedCount++;
      }
    });

    importTx();

    let msg = `成功导入 ${addedCount} 场赛程！`;
    if (errorMessages.length > 0) {
      msg += `\n\n部分警告/异常：\n` + errorMessages.join('\n');
    }

    res.json({ success: true, message: msg });
  } catch (err) {
    res.json({ success: false, message: 'Excel 文件解析失败：' + err.message });
  }
});
// ===================== ⚙️ 修改管理员账号 / 密码 API =====================

app.patch('/api/admin/profile', authMiddleware, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const adminId = req.admin.id;

  if (!currentPassword) {
    return res.json({ success: false, message: '请输入当前原密码进行身份验证' });
  }

  // 1. 验证原密码是否正确
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(adminId);
  if (!admin || admin.password_hash !== hashPassword(currentPassword)) {
    return res.json({ success: false, message: '原密码错误，身份验证失败' });
  }

  let updatedUsername = admin.username;
  let updatedPasswordHash = admin.password_hash;

  // 2. 校验并处理新用户名
  if (newUsername && newUsername.trim() !== '' && newUsername.trim() !== admin.username) {
    const trimmedName = newUsername.trim();
    // 检查是否有其他人使用该用户名
    const exist = db.prepare('SELECT COUNT(*) as count FROM admins WHERE username = ? AND id != ?').get(trimmedName, adminId);
    if (exist.count > 0) {
      return res.json({ success: false, message: '该用户名已被占用，请换一个' });
    }
    updatedUsername = trimmedName;
  }

  // 3. 校验并处理新密码
  if (newPassword && newPassword.trim() !== '') {
    if (newPassword.trim().length < 6) {
      return res.json({ success: false, message: '新密码长度至少需要 6 位' });
    }
    updatedPasswordHash = hashPassword(newPassword.trim());
  }

  // 如果两者均未修改，直接返回
  if (updatedUsername === admin.username && updatedPasswordHash === admin.password_hash) {
    return res.json({ success: false, message: '未检测到任何修改内容' });
  }

  // 4. 更新数据库
  db.prepare('UPDATE admins SET username = ?, password_hash = ? WHERE id = ?')
    .run(updatedUsername, updatedPasswordHash, adminId);

  // 5. 重新签发全新的 JWT Token
  const newToken = jwt.sign({ id: adminId, username: updatedUsername }, JWT_SECRET, { expiresIn: '24h' });

  res.json({
    success: true,
    message: '管理员账号信息更新成功！',
    token: newToken,
    username: updatedUsername
  });
});

// ===================== ⏰ 定时赛程状态扫描器 =====================

function checkScheduledMatches() {
  const nowIso = new Date().toISOString();

  // 1. 扫描需要自动开始的赛程 (状态为未开始(0) 且 start_at <= 当前时间)
  const matchesToStart = db.prepare(`
    SELECT id, title FROM matches 
    WHERE status = 0 AND start_at IS NOT NULL AND start_at <= ?
    ORDER BY start_at ASC
  `).all(nowIso);

  for (const match of matchesToStart) {
    const startTx = db.transaction(() => {
      // 自动归档其他“进行中”的赛程，确保同时只有一场在进行
      db.prepare('UPDATE matches SET status = 2 WHERE status = 1').run();
      // 将本场设定为进行中
      db.prepare('UPDATE matches SET status = 1 WHERE id = ?').run(match.id);
    });

    startTx();
    console.log(`⏰ [定时任务] 赛程 "${match.title}" (ID: ${match.id}) 到达开始时间，已自动设为【进行中】`);

    // WebSocket 广播：通知前台重新拉取当前赛程
    io.emit('match_status_changed', { matchId: match.id, status: 1 });
  }

  // 2. 扫描需要自动结束归档的赛程 (状态为进行中(1) 且 end_at <= 当前时间)
  const matchesToEnd = db.prepare(`
    SELECT id, title FROM matches 
    WHERE status = 1 AND end_at IS NOT NULL AND end_at <= ?
  `).all(nowIso);

  for (const match of matchesToEnd) {
    db.prepare('UPDATE matches SET status = 2 WHERE id = ?').run(match.id);
    console.log(`⏰ [定时任务] 赛程 "${match.title}" (ID: ${match.id}) 到达结束时间，已自动设为【已归档】`);

    // WebSocket 广播通知
    io.emit('match_status_changed', { matchId: match.id, status: 2 });
  }
}

// 启动定时轮询，每 10 秒自动检测一次
setInterval(checkScheduledMatches, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RDFZ-Moe 后端服务已启动，端口: ${PORT}`);
});