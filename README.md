# RDFZ-Moe

🚀 **轻量级、无须登录、移动端优先的高性能二次元萌战投票 Web 应用**。

本项目是为RDFZ冻鳗社举办的萌战设计的，基于 **Vue 3 + Tailwind CSS + Supabase (PostgreSQL & Realtime)** 打造，结合 **FingerprintJS 硬件指纹与后端 RPC** 防刷机制，实现了免登录场景下的高可靠抗刷票能力，并针对国内网络环境进行了深度优化。

---

## ✨ 核心特性

* 📱 **移动端优先与 Glassmorphism 视觉**：采用毛玻璃质感（Glassmorphism）与响应式布局，针对移动端与桌面端分别优化背景图裁切与卡片自适应。
* ⚡ **毫秒级 Realtime 实时计票**：借助 Supabase PostgreSQL Changes (WebSockets)，无需手动刷新即可实时同步全网投票数与排名变化。
* 🛡️ **无感硬件指纹防刷机制**：
* 前端整合 **FingerprintJS v4** 提取硬件与浏览器特征生成唯一设备 ID（`visitorId`），免疫“清除缓存 / 无痕模式 / 隐私窗口”重置刷票。
* 资源**本地化托管**，解决第三方 CDN 被广告拦截插件（如 uBlock / AdGuard）断流的问题。


* 🔒 **原子化后端校验 (Supabase RPC)**：所有投票逻辑在数据库 PL/pgSQL 存储过程内原子化执行，杜绝并发竞态条件，并联动 **IP 频率限制** 防范跨浏览器刷票。
* ⚔️ **双赛制形态支持**：
* **小组赛模式 (Group)**：支持多候选人（如 16 强），采用“本地多选勾选 + 底部固定栏一键批量提交”提交模式。
* **1v1 淘汰赛模式 (PK)**：左右双雄强对抗，居中动态显示加宽的实时百分比拔河进度条。


* 📜 **往期赛果历史归档**：支持多场次状态切换 (`status=1` 进行中 / `status=2` 已结束)，归档场次自动加冕“🏆 冠军/头名”徽章，并记忆识别“历史为你所投 ✓”。
* 🇨🇳 **中国大陆免备案访问优化**：支持托管于 Vercel 边缘节点（通过绑定 `cname-china.vercel-dns.com`）或香港 VPS（Nginx），确保大陆用户秒开访问。

---

## 🛠️ 技术栈

* **前端核心**：Vue 3 (Composition API / CDN 模式)
* **UI 框架**：Tailwind CSS v3
* **后端 / 数据库**：Supabase (PostgreSQL, Realtime Engine, PL/pgSQL RPC)
* **设备指纹**：FingerprintJS v4 (本地化脚本 `fp.min.js`)
* **特效组件**：Canvas Confetti (投票成功庆祝粒子特效)
* **部署平台**：Vercel / Nginx (Hong Kong VPS)

---

## 📁 目录结构

```text
.
├── index.html          # 前端单页面入口 (整合 Vue3、TailwindCSS 与全部 UI 逻辑)
├── favicon.ico         # 网站图标
├── bg-desktop.jpg      # 桌面端自适应背景图 (本地化)
├── bg-mobile.jpg       # 移动端自适应背景图 (本地化)
├── vercel.json         # Vercel 路由与重定向配置文件
└── js/
    └── fp.min.js       # 本地托管的 FingerprintJS v4 核心库 (避免被拦截)

```

---

## 🗄️ 数据库架构与 SQL 初始化

进入 Supabase 控制台的 **SQL Editor**，依序运行以下 SQL 脚本：

### 1. 基础数据表结构

```sql
-- 角色基础表
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 比赛场次表 (status: 0-未开始, 1-进行中, 2-已结束归档)
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('group', 'pk')),
    status INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 比赛与选手关联表 (记录当前场次实时票数)
CREATE TABLE match_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
    votes INTEGER DEFAULT 0,
    UNIQUE(match_id, character_id)
);

-- 投票防刷日志表 (记录设备指纹与 IP)
CREATE TABLE vote_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
    voter_identity TEXT NOT NULL,
    client_ip TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

```

### 2. 核心原子计票与防刷 RPC 函数 (`submit_vote`)

```sql
CREATE OR REPLACE FUNCTION submit_vote(
    p_match_id UUID, 
    p_character_id UUID, 
    p_voter_identity TEXT
)
RETURNS JSON AS $$
DECLARE
    v_status INTEGER;
    v_match_type TEXT;
    v_max_votes INTEGER;
    v_total_voted INTEGER;
    v_char_voted INTEGER;
    v_ip_voted INTEGER;
    v_client_ip TEXT;
    v_ip_limit INTEGER := 10; -- 单个 IP 允许的最大额度限制 (防止同 Wi-Fi 误杀的同时封顶批量刷票)
BEGIN
    -- 提取客户端真实 IP
    v_client_ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    IF v_client_ip IS NULL THEN
        v_client_ip := current_setting('request.headers', true)::json->>'x-real-ip';
    END IF;
    v_client_ip := split_part(v_client_ip, ',', 1);

    -- 校验设备指纹
    IF p_voter_identity IS NULL OR p_voter_identity = '' THEN
        RETURN json_build_object('success', false, 'message', '设备安全指纹生成失败，请刷新页面重试');
    END IF;

    -- 检查比赛状态
    SELECT status, match_type INTO v_status, v_match_type FROM matches WHERE id = p_match_id;
    IF v_status != 1 THEN
        RETURN json_build_object('success', false, 'message', '当前场次不在投票时间内');
    END IF;

    -- 设置赛制限额 (小组赛 4 票，PK 赛 1 票)
    v_max_votes := CASE WHEN v_match_type = 'group' THEN 4 ELSE 1 END;

    -- 检查设备指纹总投票额度
    SELECT COUNT(*) INTO v_total_voted FROM vote_logs 
    WHERE match_id = p_match_id AND voter_identity = p_voter_identity;

    IF v_total_voted >= v_max_votes THEN
        RETURN json_build_object('success', false, 'message', '当前设备在此场次的 ' || v_max_votes || ' 张票已用完');
    END IF;

    -- 检查 IP 限制
    IF v_client_ip IS NOT NULL AND v_client_ip != '' THEN
        SELECT COUNT(*) INTO v_ip_voted FROM vote_logs 
        WHERE match_id = p_match_id AND client_ip = v_client_ip;

        IF v_ip_voted >= (v_ip_limit * v_max_votes) THEN
            RETURN json_build_object('success', false, 'message', '当前网络环境投票频繁，请切换网络或稍后再试');
        END IF;
    END IF;

    -- 检查是否重复投给同一角色
    SELECT COUNT(*) INTO v_char_voted FROM vote_logs 
    WHERE match_id = p_match_id AND voter_identity = p_voter_identity AND character_id = p_character_id;

    IF v_char_voted > 0 THEN
        RETURN json_build_object('success', false, 'message', '同一角色限投一票，您已为她投过票');
    END IF;

    -- 写入日志并原子增加票数
    INSERT INTO vote_logs (match_id, character_id, voter_identity, client_ip) 
    VALUES (p_match_id, p_character_id, p_voter_identity, v_client_ip);

    UPDATE match_candidates SET votes = votes + 1 
    WHERE match_id = p_match_id AND character_id = p_character_id;

    RETURN json_build_object('success', true, 'message', '投票成功！');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

```

---

## 🚀 部署指南

### 1. 配置 Vercel 托管（推荐）

1. 将代码仓库 Push 至 **GitHub**。
2. 登录 [Vercel Dashboard](https://vercel.com/dashboard)，导入该仓库。
3. 在 **Framework Preset** 中选择 **`Other`**（无须构建命令，根目录直接托管）。
4. 在项目根目录下包含 `vercel.json` 配置文件：
```json
{
  "version": 2,
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ]
}

```



### 2. 绑定中国大陆优化自定义域名

在阿里云 / 腾讯云 / DNSPod 等平台购买域名后，按照下表添加 DNS 解析以达到最佳访问体验：

| 记录类型 | 主机记录 | 记录值 | 说明 |
| --- | --- | --- | --- |
| **CNAME** | `www` (或 `vote`) | **`cname-china.vercel-dns.com`** | Vercel 中国优化节点，低延迟防拦截 |
| **A 记录** | `@` | `76.76.21.21` | 绑定根域名主节点 |

---

## 🛡️ 防刷与安全机制说明

```text
[用户发起投票]
       │
       ▼
[前端: 硬件指纹计算 (fp.min.js)] ──(失败降级)──► [LocalStorage UUID]
       │
       ▼
[Supabase RPC 原子校验]
       ├── 1. 校验比赛状态 (status == 1?)
       ├── 2. 校验设备指纹总投票额度 (<= Max Votes?)
       ├── 3. 校验设备指纹同角色单投限制 (Repeat Vote?)
       └── 4. 校验 Client IP 频率上限 (Anti-Bot Throttling)
       │
       ▼ (全通过)
[写入 vote_logs 并更新得票数] ──► [Realtime 推送通知所有客户端更新 UI]

```

1. **跨浏览器防护**：结合 IP 与 FingerprintJS 特征联合防刷；对于严格环境（如无痕模式 + 换浏览器），后端 IP 限制阀门进行二次保底。
2. **渐进式降级 (Fallback)**：若用户设备启用了极端脚本拦截，系统将安全降级为本地 UUID 标识，保障合法用户的顺畅投票权。
3. **彻底静态化/本地化**：指纹文件静态置于 `./js/fp.min.js`，无任何跨域第三方追踪请求，阻断一切 AdBlock 拦截。

---

## 📄 开源许可证

本项目基于 [MIT License](https://www.google.com/search?q=LICENSE) 开源许可发布。欢迎自由修改与二次派生。
