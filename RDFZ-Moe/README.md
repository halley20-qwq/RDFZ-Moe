# RDFZ-Moe 萌战投票系统

🚀 **轻量级、无须登录、移动端优先的高性能二次元萌战投票 Web 系统**。

本项目是专为 **RDFZ 冻鳗社** 举办的二次元萌战（角色人气投票活动）设计的全栈 Web 应用。原系统已完成全面架构重构，摒弃了对第三方 BaaS (Supabase) 的依赖，升级为 **Node.js + Express + SQLite + Socket.IO** 的自主可控技术栈。系统通过 **FingerprintJS 硬件指纹 + 数据库事务级防刷** 实现免登录场景下的高可靠抗刷票能力，并提供功能完善的可视化管理后台与命令行运维工具链。

---

## ✨ 核心特性

* 📱 **移动端优先与 Glassmorphism 视觉**：响应式毛玻璃质感 UI，针对移动端与桌面端自动自适应背景裁切与布局卡片。


* ⚡ **毫秒级 Socket.IO 实时计票**：采用 Socket.IO (WebSockets) 双向通信，无需刷新即可全网实时同步票数跳动与拔河进度条。


* 🛡️ **无感硬件指纹防刷机制**：
* 前端整合 **FingerprintJS v4** 提取设备特征，免疫“清除缓存 / 无痕模式 / 隐私窗口”刷票。


* 核心库静态**本地化托管 (`fp.min.js`)**，彻底避免第三方 CDN 被 AdBlock（如 uBlock/AdGuard）误杀断流。


* 故障安全降级：若设备禁用脚本，优雅回退至本地 UUID 标识。




* 🔒 **事务级后端原子校验**：基于 SQLite 事务处理（WAL 模式），在后端保障配额校验、IP 频率限制与票数增加的原子性，彻底杜绝并发竞态条件。


* ⚔️ **双赛制形态与定时自动调度**：
* **小组赛模式 (Group)**：支持多候选人，本地多选 + 底部悬浮栏一键提交选票。


* **1v1 淘汰赛模式 (PK)**：左右强强对决，正中央显示加宽的百分比拔河实时进度条。


* **无人值守定时器**：支持配置赛程的自动上线（`start_at`）与自动归档（`end_at`），后台定时检测并全网广播更新。


* 📊 **可视化后台与 Excel 批量管理**：
* 提供独立的 **`admin.html` 控制台**，采用 JWT 鉴权与 SHA256 加盐密码保护。
* **Excel 批量导入**：支持一键导入角色库与赛程规划（含自动关联角色与定时时间）。
* **审计与一键撤票**：实时分页查看投票日志，支持撤销违规投票，系统将自动同步扣减选手票数并实时广播。




* 🛠️ **极简单机部署**：零外部数据库服务依赖，轻量存储，单台 1核 1G / 2核 2G 香港 VPS 即可轻松承载高并发。

---

## 🛠️ 技术栈

* **前端 (Frontend)**：Vue 3 (Composition API / CDN 模式) + Tailwind CSS v3 + Canvas Confetti + FingerprintJS v4


* **后端 (Backend)**：Node.js + Express.js + Socket.IO (WebSockets) + JWT (`jsonwebtoken`) + Multer + SheetJS (`xlsx`)
* **数据库 (Database)**：SQLite (`better-sqlite3`，开启 WAL 模式与 `busy_timeout` 保障写入性能)
* **部署运行 (Deployment)**：PM2 进程管理 + Nginx 反向代理 (支持 WebSocket 协议升级与 SSL/HTTPS)

---

## 📁 项目目录结构

```text
rdfz-moe/
├── public/                      # 前端静态资源 (由 Express 静态托管)
│   ├── index.html               # 投票前端主页面[cite: 2]
│   ├── admin.html               # 管理员可视化控制台
│   ├── favicon.ico              # 站点图标[cite: 2]
│   ├── favicon.png              # 移动端书签图标[cite: 2]
│   ├── background_desktop.jpg   # 桌面端背景图[cite: 1]
│   ├── background_mobile.jpg    # 移动端背景图[cite: 1]
│   └── js/
│       └── fp.min.js            # 本地托管的 FingerprintJS v4 核心库[cite: 1, 2]
│
├── src/                         # 后端核心源码
│   ├── db.js                    # SQLite 初始化、自动平滑迁移与密码 Hash
│   └── server.js                # Express REST API、Socket.IO 服务与定时切换引擎
│
├── scripts/                     # CLI 运维命令行工具脚本
│   ├── create_admin.js          # 命令行创建管理员账号
│   ├── delete_admin.js          # 命令行删除管理员账号
│   ├── reset_database.js        # 数据库格式化/清空脚本
│   └── seed.js                  # 预置演示测试数据
│
├── data/                        # 数据库存储目录 (自动生成，已加 .gitignore)
│   └── data.db                  # SQLite 数据库文件 (包含 WAL 锁文件)
│
├── .gitignore                   # Git 忽略提交规则
├── package.json                 # Node.js 项目依赖与快捷脚本
└── README.md                    # 项目运维与开发说明文档[cite: 1]

```

---

## 🚀 快速启动 (本地开发)

### 1. 环境准备

确保本地已安装 **Node.js 18+**。克隆本仓库并安装依赖：

```bash
git clone https://github.com/halley20-qwq/RDFZ-Moe.git
cd RDFZ-Moe
npm install

```

### 2. 初始化演示数据 (可选)

运行种子脚本填入测试角色与预选赛程：

```bash
npm run seed

```

### 3. 启动开发服务器

```bash
npm start

```

启动成功后，浏览器访问：

* **用户投票页**：`http://localhost:3000`
* **管理后台**：`http://localhost:3000/admin.html`（默认初始管理员账号：`admin`，密码：`admin123`）

---

## ⚙️ 生产环境部署指南

建议使用中国香港或海外 VPS（如 2核 2G / 200M 峰值带宽轻量服务器）进行部署，以规避域名 ICP 备案限制。

### 1. 安装 PM2 进程管理器

```bash
sudo npm install -g pm2

```

### 2. 启动应用并设置开机自启

```bash
# 在项目根目录下启动
pm2 start src/server.js --name "rdfz-moe"

# 保存 PM2 进程列表并配置开机自启
pm2 save
pm2 startup

```

### 3. 配置 Nginx 反向代理与 WebSocket 支持

编辑 Nginx 配置文件（如 `/etc/nginx/sites-available/rdfz-moe`）：

```nginx
server {
    listen 80;
    server_name vote.yourdomain.com; # 替换为你的域名

    # 代理前端静态资源与 API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 代理 Socket.IO / WebSocket 实时连接 (关键配置)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}

```

启用站点并重载 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/rdfz-moe /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

```

### 4. 申请 HTTPS / SSL 证书 (推荐 Certbot)

```bash
sudo certbot --nginx -d vote.yourdomain.com

```

---

## 📊 Excel 批量导入规范

在后台 `admin.html` 中支持批量上传 Excel (`.xlsx` / `.xls`) 快速添加数据：

### 1. 批量导入角色 (`characters.xlsx`)

| 角色名称 | 头像链接 |
| --- | --- |
| 凉宫春日 | [https://img.remit.ee/i/rYHUq96tRQBK](https://www.google.com/search?q=https://img.remit.ee/i/rYHUq96tRQBK) |
| 八奈见杏菜 | [https://img.remit.ee/i/fAqnmOU4E7e3](https://www.google.com/search?q=https://img.remit.ee/i/fAqnmOU4E7e3) |

### 2. 批量导入赛程 (`matches.xlsx`)

| 赛程标题 | 赛制 | 参赛角色 | 开始时间 | 结束时间 |
| --- | --- | --- | --- | --- |
| 小组赛 A 组首轮 | 小组赛 | 凉宫春日, 八奈见杏菜, 烧盐柠檬 | 2026-10-04 10:00 | 2026-10-04 22:00 |
| 1v1 淘汰赛半决赛 | PK赛 | 凉宫春日, 八奈见杏菜 | 2026-10-05 14:00 | 2026-10-05 22:00 |

*注：“参赛角色”需用逗号或分号隔开，且名字需已存在于角色库中；“开始时间/结束时间”为可选填项。*

---

## 🛠️ CLI 运维命令行工具

系统内置了快捷的 NPM 运维脚本，方便在终端进行管理：

* **添加新管理员账号**：
```bash
npm run add_admin <用户名> <密码>

```


* **删除指定管理员账号**（内置防误删最后一个账号的锁定保护）：
```bash
npm run del_admin <用户名>

```


* **格式化/重置数据库**（清空所有业务数据与账号，恢复默认 `admin` / `admin123`，并执行 `VACUUM` 压缩空间）：
```bash
npm run reset_database

```


* **一键生成测试演示数据**：
```bash
npm run seed

```



---

## 🛡️ 安全与防刷机制说明

```text
[用户发起投票请求]
       │
       ▼
[前端: 硬件指纹计算 (fp.min.js)] ──(失败降级)──► [LocalStorage UUID]
       │
       ▼
[后端 Express 事务级原子校验]
       ├── 1. 校验比赛状态 (status == 1?)
       ├── 2. 校验设备指纹总投票额度 (<= Max Votes?)
       ├── 3. 校验设备指纹同角色重复投限制 (Repeat Vote?)
       └── 4. 校验 Client IP 频率上限 (Anti-Bot Throttling)
       │
       ▼ (全通过)
[写入 vote_logs 并更新 match_candidates 得票数]
       │
       ▼
[Socket.IO 广播 vote_update 事件推送至所有客户端更新 UI]

```

1. **多重联合防护**：结合设备指纹与客户端真实 IP 联合防刷。若遇到极端无痕模式 + 频繁切换浏览器，后端的单 IP 限制阀门（如单 IP 设为额度 10 倍上限）提供底线保护。
2. **防刷撤销扣销机制**：管理员在后台可实时审查带有 IP 及设备指纹的 `vote_logs`，如发现刷票行为可一键删除该记录，数据库将在事务中**同步扣减对应选手的票数**并实时推送全网纠正。

---

## 📄 开源许可证

本项目基于 [MIT License](https://www.google.com/search?q=LICENSE) 开源许可发布。欢迎自由修改、派生与用于各大校园社团活动。