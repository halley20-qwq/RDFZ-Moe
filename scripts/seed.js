const { v4: uuidv4 } = require('uuid');
const db = require('../src/database');

console.log('正在插入演示数据...');

// 清空原数据
db.exec('DELETE FROM vote_logs; DELETE FROM match_candidates; DELETE FROM matches; DELETE FROM characters;');

// 插入角色
const char1 = uuidv4();
const char2 = uuidv4();
const char3 = uuidv4();
const char4 = uuidv4();

const insertChar = db.prepare('INSERT INTO characters (id, name, avatar_url) VALUES (?, ?, ?)');
insertChar.run(char1, '凉宫春日', 'https://img.remit.ee/i/rYHUq96tRQBK');
insertChar.run(char2, '温水和彦', 'https://img.remit.ee/i/fAqnmOU4E7e3');
insertChar.run(char3, '八奈见杏菜', 'https://img.remit.ee/i/fAqnmOU4E7e3');
insertChar.run(char4, '烧盐柠檬', 'https://img.remit.ee/i/rYHUq96tRQBK');

// 插入进行中的小组赛
const match1 = uuidv4();
db.prepare("INSERT INTO matches (id, title, match_type, status) VALUES (?, ?, 'group', 1)").run(match1, '小组赛 A 组首轮预选');

const insertCandidate = db.prepare('INSERT INTO match_candidates (id, match_id, character_id, votes) VALUES (?, ?, ?, ?)');
insertCandidate.run(uuidv4(), match1, char1, 42);
insertCandidate.run(uuidv4(), match1, char2, 18);
insertCandidate.run(uuidv4(), match1, char3, 35);
insertCandidate.run(uuidv4(), match1, char4, 29);

console.log('测试数据初始化完毕！');