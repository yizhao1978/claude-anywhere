# Claude Anywhere

![Claude Anywhere](https://img.shields.io/badge/Claude-Anywhere-blue?style=for-the-badge)

**不是聊天机器人。是你口袋里的 AI 员工。**
**Not a chatbot. Your AI engineer, in your pocket.**

在咖啡厅、在地铁上、在床上——读文件、写代码、跑脚本、分析数据，Claude Code 的全部能力，随时随地。
In a café, on the subway, in bed — read files, write code, run scripts, analyze data. Every power of Claude Code, now in your phone.

> Claude App = 聊天机器人，只能对话
> Claude Code = 终端里的 AI 工程师，但你必须坐在电脑前
> OpenClaw = 强大的 AI Agent 框架
> **Claude Anywhere = Claude Code + OpenClaw，装进你的口袋**

---

## 🔄 随时接续，永不中断 / Resume Anywhere, Never Lose Progress

Claude Anywhere 最强大的功能之一：你可以在任何设备、任何平台上接续之前的对话。

One of Claude Anywhere's most powerful features: resume any conversation, on any device, any platform.

在地铁上开始调试代码，到办公室打开电脑继续——`/sessions` 列出所有会话，`/resume` 一键接续。你的工作进度，永远不会丢失。

Start debugging on the subway, continue at your desk — `/sessions` to list all sessions, `/resume` to pick up where you left off. Your work, always saved.

---

## 免费版 vs Pro 版 / Free vs Pro

| 功能 / Feature | 免费 Free | Pro |
|---|---|---|
| 每日消息数 / Messages/day | 5 条 | 无限 Unlimited |
| 试用期 / Trial period | 7 天 | — |
| 多轮对话 / Multi-turn chat | ✗ | ✓ |
| 图片分析 / Image analysis | ✗ | ✓ |
| 文件分析 / File analysis | ✗ | ✓ |
| 企业微信 / WeChat Work | 有限 Limited | 完整 Full |
| 广告 / Ads | ✓ | ✗ |
| 会话历史 / Session history | ✗ | ✓ |

**升级 Pro → [claudeanywhere.gumroad.com/l/claude-anywhere](https://claudeanywhere.gumroad.com/l/claude-anywhere)（$5.99/月）**

---

## 前置要求 / Prerequisites

在开始之前，请确认以下每一项都已准备好。
Before starting, make sure all of the following are ready.

### 1. Node.js 18 或更高版本 / Node.js 18+

**检查是否已安装 / Check if installed：**
```bash
node --version
```

**预期输出 / Expected output：**
```
v20.11.0
```
看到 `v18.x.x` 或更高版本即可。显示 `command not found` 说明未安装。

**如未安装 / If not installed：**
```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS（需要先安装 Homebrew / requires Homebrew）
brew install node

# 验证安装 / Verify
node --version
npm --version
```

**常见报错 / Common errors：**
- `Permission denied`：在命令前加 `sudo`
- `curl: command not found`：先运行 `sudo apt install curl`

---

### 2. Claude Code CLI

**检查是否已安装 / Check if installed：**
```bash
claude --version
```

**预期输出 / Expected output：**
```
1.x.x
```

**如未安装 / If not installed：**
```bash
npm install -g @anthropic-ai/claude-code
```

**预期输出 / Expected output：**
```
added 1 package in 3s
```

安装后需要完成一次登录（After install, complete login once）：
```bash
claude
# 按提示登录 Anthropic 账号 / Follow prompts to log in to Anthropic account
# 登录后按 Ctrl+C 退出即可 / Press Ctrl+C to exit after login
```

**常见报错 / Common errors：**
- `EACCES: permission denied`：运行 `sudo npm install -g @anthropic-ai/claude-code`
- 登录后 `claude --version` 仍报错：重新开一个终端窗口再试

---

### 3. Telegram Bot Token（Telegram 用户必填 / Required for Telegram）

**详细创建步骤 / Step-by-step guide：**

**第 1 步**：打开 Telegram 应用，在顶部搜索框输入 `@BotFather`，点击进入（头像是机器人图标，带蓝色认证标）

**第 2 步**：点击"开始"或直接发送：
```
/newbot
```
BotFather 会回复："Alright, a new bot. How are we going to call it?"

**第 3 步**：发送你想要的机器人显示名称（随便取，中英文都行），例如：
```
My Claude Bot
```
BotFather 会回复："Good. Now let's choose a username for your bot."

**第 4 步**：发送机器人的用户名（**必须以 `bot` 结尾**，只能含字母、数字、下划线），例如：
```
my_claude_bot
```
或：
```
myclaudebot_bot
```

**第 5 步**：BotFather 会返回成功消息，其中包含 Token，格式如下：
```
Done! Congratulations on your new bot. You will find it at t.me/my_claude_bot.
...
Use this token to access the HTTP API:
7123456789:AAHdefGHIjklMNOpqrsTUVwxyz-ABCdef
```

**第 6 步**：复制那一长串 Token（从数字开头到末尾），稍后填入 `.env` 文件的 `TELEGRAM_BOT_TOKEN=` 后面。

**在哪里找 / Where to find：**
- BotFather 对话里，`Use this token to access the HTTP API:` 这行下面就是 Token
- 如果忘记了，发送 `/mybots` → 点击你的 Bot → `API Token`

**常见报错 / Common errors：**
- `Username is already taken`：换一个用户名重试
- Bot 创建成功但发消息没反应：确保先给 Bot 发一条消息，不是发给 BotFather

---

### 4. 企业微信 AI Bot（可选 / Optional for WeChat Work）

**第 1 步**：管理员用电脑浏览器访问企业微信管理后台：
```
https://work.weixin.qq.com
```
用企业管理员账号登录。

**第 2 步**：进入 **应用管理** → **AI 助手** → **创建机器人**

如果找不到"AI 助手"菜单，说明你的企业版本不支持，需要联系企业微信客服开通。

**第 3 步**：填写机器人名称和头像，点击创建。

**第 4 步**：创建完成后，在机器人详情页找到：
- **Bot ID**（形如 `xxxxx`）
- **Secret**（点击"查看"获取）

将这两个值填入 `.env` 文件的 `WECOM_BOT_ID=` 和 `WECOM_SECRET=` 后面。

---

### 5. QQ Bot（可选 / Optional for QQ）

**第 1 步**：打开 QQ 开放平台：
```
https://q.qq.com/qqbot/openclaw/index.html
```

**第 2 步**：用手机 QQ 扫码登录。

**第 3 步**：点击"创建机器人"，填写基本信息，提交审核。

**第 4 步**：审核通过后，在机器人管理页找到：
- **AppID**（数字）
- **AppSecret**（字母数字混合）

将这两个值填入 `.env` 文件的 `QQ_APP_ID=` 和 `QQ_APP_SECRET=` 后面。

**注意 / Note**：QQ Bot 需要审核，通常需要 1-3 个工作日。

---

## 安装 / Installation

### 第 1 步：下载代码 / Step 1: Clone the repository

```bash
git clone https://github.com/yizhao1978/claude-anywhere.git
cd claude-anywhere
```

**预期输出 / Expected output：**
```
Cloning into 'claude-anywhere'...
remote: Enumerating objects: 150, done.
...
```

**看到这些文件说明成功 / These files confirm success：**
```bash
ls
# 应看到 / Should see:
# bridge-telegram.mjs  bridge-wecom.mjs  core.mjs  package.json  .env.example  ...
```

**常见报错 / Common errors：**
- `git: command not found`：运行 `sudo apt install git`（Linux）或 `brew install git`（macOS）
- `Permission denied (publickey)`：换用 HTTPS 方式克隆，命令已经是 HTTPS 无需修改

---

### 第 2 步：安装依赖 / Step 2: Install dependencies

```bash
npm install
```

**预期输出 / Expected output：**
```
added 87 packages in 5s
```
数量不一定完全一致，看到 `added XX packages` 即为成功。

**常见报错 / Common errors：**
- `npm: command not found`：Node.js 未正确安装，回到前置要求第 1 步
- `EACCES: permission denied`：不要用 `sudo npm install`，改用 `npm install`（不加 sudo）
- 出现大量 `npm warn`：警告不影响使用，忽略即可；只有 `npm error` 才需要处理

---

### 第 3 步：创建配置文件 / Step 3: Create config file

```bash
cp .env.example .env
```

无输出即为成功。验证文件已创建：
```bash
ls -la .env
# 应显示 / Should show:
# -rw-r--r-- 1 user user 512 Mar 23 10:00 .env
```

---

### 第 4 步：编辑配置文件 / Step 4: Edit config file

```bash
# Linux / macOS（推荐 nano，操作简单）
nano .env

# 或者用 vim（熟悉的话）
vim .env
```

填入你的配置（至少填 `TELEGRAM_BOT_TOKEN`）：

```ini
# ✅ 必填：Telegram Bot Token（从 @BotFather 获取）
# ✅ Required: Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxYourTokenHere

# ⬜ 可选：Pro 授权码（升级 Pro 后填入，免费版留空）
# ⬜ Optional: Pro license key (fill after upgrading, leave empty for free tier)
LICENSE_KEY=

# ⬜ 可选：授权服务器（保持默认即可）
# ⬜ Optional: License server URL (keep default)
LICENSE_SERVER_URL=https://license.claudeanywhere.com

# ⬜ 可选：claude 命令路径（通常自动检测，无需填写）
# ⬜ Optional: Path to claude binary (usually auto-detected)
CLAUDE_PATH=

# ⬜ 可选：Claude 工作目录（不填则使用当前目录）
# ⬜ Optional: Working directory for Claude (default: current dir)
CLAUDE_CWD=

# ⬜ 可选：企业微信配置（不用企业微信可留空）
# ⬜ Optional: WeChat Work config (leave empty if not using WeCom)
WECOM_BOT_ID=
WECOM_SECRET=

# ⬜ 可选：QQ Bot 配置
# ⬜ Optional: QQ Bot config
QQ_APP_ID=
QQ_APP_SECRET=
```

**nano 操作说明 / nano key shortcuts：**
- 保存 / Save：`Ctrl+O`，然后按 `Enter` 确认
- 退出 / Exit：`Ctrl+X`
- 搜索 / Search：`Ctrl+W`

**常见报错 / Common errors：**
- Token 填入后仍报错 `401 Unauthorized`：检查 Token 是否有多余空格，`=` 后面紧跟 Token 不加空格
- `.env` 文件找不到：确认你在 `claude-anywhere` 目录内，运行 `pwd` 确认当前路径

---

### 第 5 步：测试启动 / Step 5: Test run

```bash
npm run telegram
```

**预期输出（成功）/ Expected output (success)：**
```
✓ Claude found: /usr/local/bin/claude
✓ Telegram bot started
Bot is running. Send a message to your bot on Telegram.
```

**然后 / Then：**
1. 打开 Telegram，搜索你创建的 Bot（`@your_bot_name`）
2. 点击"开始"或发送 `/start`
3. 发送任意消息，应在几秒内收到回复

测试完成后按 `Ctrl+C` 停止。关闭终端后 Bot 会停止运行，建议使用下面的后台运行方式。

**常见报错 / Common errors：**
- `Error: TELEGRAM_BOT_TOKEN is not set`：检查 `.env` 文件是否正确保存
- `409 Conflict`：同一 Token 有多个实例在运行，运行 `pkill -f bridge-telegram` 后重启
- `claude: command not found`：在 `.env` 里设置 `CLAUDE_PATH=/usr/local/bin/claude`（用 `which claude` 查找路径）

---

## 后台运行 / Background Running

### 方式一：tmux（推荐新手 / Recommended for beginners）

```bash
# 安装 tmux / Install tmux
sudo apt install tmux          # Ubuntu/Debian
brew install tmux              # macOS

# 创建后台会话 / Create background session
tmux new -s claude-anywhere

# 在 tmux 里启动 / Start inside tmux
npm run telegram

# 脱离 tmux（Bot 继续在后台运行）/ Detach (bot keeps running)
# 先按 Ctrl+B，松开，再按 D
```

重新进入查看日志 / Reattach to view logs：
```bash
tmux attach -t claude-anywhere
```

---

### 方式二：systemd（推荐生产环境 / Recommended for production）

```bash
# 1. 复制服务文件 / Copy service file
sudo cp systemd/claude-anywhere.service /etc/systemd/system/

# 2. 编辑服务文件，修改路径和用户名
sudo nano /etc/systemd/system/claude-anywhere.service
# 修改以下字段 / Modify these fields:
#   User=YOUR_USERNAME
#   WorkingDirectory=/path/to/claude-anywhere
#   EnvironmentFile=/path/to/claude-anywhere/.env
```

**服务文件示例 / Service file example：**
```ini
[Unit]
Description=Claude Anywhere Telegram Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/claude-anywhere
EnvironmentFile=/home/ubuntu/claude-anywhere/.env
ExecStart=/usr/bin/node bridge-telegram.mjs
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 3. 重载并启动 / Reload and start
sudo systemctl daemon-reload
sudo systemctl enable claude-anywhere
sudo systemctl start claude-anywhere

# 4. 查看状态 / Check status
sudo systemctl status claude-anywhere
```

**预期输出（成功）/ Expected output (success)：**
```
● claude-anywhere.service - Claude Anywhere Telegram Bot
     Loaded: loaded (/etc/systemd/system/claude-anywhere.service; enabled)
     Active: active (running) since Mon 2026-03-23 10:00:00 UTC; 5s ago
```
看到 `active (running)` 即为成功。

```bash
# 5. 查看实时日志 / View live logs
journalctl -u claude-anywhere -f

# 6. 重启服务 / Restart service
sudo systemctl restart claude-anywhere

# 7. 停止服务 / Stop service
sudo systemctl stop claude-anywhere
```

**企业微信服务 / WeChat Work service：**
```bash
sudo cp systemd/claude-anywhere-wecom.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable claude-anywhere-wecom
sudo systemctl start claude-anywhere-wecom
```

---

### 方式三：一键启动所有平台 / All-in-one start

在 `.env` 里配好所有平台的 Token，然后：
```bash
npm start
```
会自动检测已配置的平台并全部启动。

---

## 使用方法 / Usage

启动成功后，打开 Telegram 找到你创建的 Bot，直接发消息即可。
After starting, open Telegram, find your bot, and start chatting.

### 发送消息 / Send Messages

直接输入任何问题发送，Claude 会自动回复。
Just type any question and send — Claude will reply.

示例（Examples）：
- `帮我写一个 Python 脚本读取 CSV 文件`
- `解释一下什么是 Docker`
- `Write a function to sort a list in JavaScript`

### 命令列表 / Commands

| 命令 / Command | 说明 / Description |
|---|---|
| `/new` | 开始新对话，清除上下文 / Start fresh conversation |
| `/sessions` | 查看所有历史会话 / List all sessions |
| `/resume <id>` | 接续指定会话 / Resume a specific session |
| `/status` | 查看当前账号状态和今日用量 / Show tier & daily usage |
| `/activate <key>` | 激活 Pro 授权码 / Activate Pro license key |
| `/help` | 显示帮助和功能列表 / Show help & feature list |

---

## 🔄 会话管理详解 / Session Management

Claude Anywhere 支持跨设备、跨平台的会话接续，是区别于普通聊天机器人的核心功能。

Claude Anywhere supports cross-device, cross-platform session resumption — a core feature that sets it apart from ordinary chatbots.

### 查看所有会话 / List all sessions

```
/sessions
```

**示例返回 / Example response：**
```
📋 你的会话列表 / Your sessions:

1. abc12345 | 2026-03-22 21:00
   👤 帮我调试这个 Python bug
   🤖 我看了代码，问题出在第42行...

2. def67890 | 2026-03-21 14:30
   👤 帮我分析这份 Excel 数据
   🤖 数据显示销售额在3月份有明显下降...
```

### 接续会话 / Resume a session

```
/resume abc12345
```

Claude 会立即恢复该会话的完整上下文，就像你从未离开。
Claude immediately restores the full context of that session, as if you never left.

### 使用场景 / Use cases

- **跨设备**：在电脑上用 Claude Code 开始调试 → 出门后用手机 Telegram 继续
  **Cross-device**: Start debugging with Claude Code on desktop → continue on phone via Telegram

- **跨平台**：早上在企业微信布置任务 → 下午在 QQ 上检查进度
  **Cross-platform**: Assign tasks on WeCom in the morning → check progress on QQ in the afternoon

- **多项目**：同时进行多个项目 → `/sessions` 切换不同工作上下文
  **Multi-project**: Work on multiple projects simultaneously → use `/sessions` to switch contexts

---

## 免费版限制 / Free Tier Limits

免费版有以下使用限制，升级 Pro 可解锁全部功能：
The free tier has these limits. Upgrade to Pro to unlock everything:

- **每天最多 5 条消息** / Max 5 messages per day
- **7 天试用期**，到期后需升级 / 7-day trial, upgrade required after
- **单轮对话**，每次对话不保留上下文 / Single-turn only, no conversation memory
- **不支持图片和文件** / No image or file support
- **每条回复末尾带升级提示** / Each reply includes an upgrade prompt

---

## 升级 Pro / Upgrade to Pro

Pro 版解锁全部功能：
Pro unlocks everything:

- ✅ 无限消息，无试用期限制 / Unlimited messages, no trial limit
- ✅ 多轮对话，保留完整上下文 / Multi-turn chat with full context
- ✅ 图片分析 / Image analysis
- ✅ 文件分析（PDF、Excel、CSV、代码等）/ File analysis (PDF, Excel, CSV, code, etc.)
- ✅ 会话历史，可随时恢复对话 / Session history with resume support
- ✅ 无广告 / No ads

**购买地址 / Purchase:** [claudeanywhere.gumroad.com/l/claude-anywhere](https://claudeanywhere.gumroad.com/l/claude-anywhere)（$5.99/月）

购买后，使用 `/activate CA-XXXX-XXXX-XXXX-XXXX` 命令激活。
After purchase, activate with: `/activate CA-XXXX-XXXX-XXXX-XXXX`

---

## 常见问题 / FAQ

**Q: 启动时报错 `claude: command not found`**

A: Claude Code CLI 未安装或未在 PATH 中。运行以下命令安装：
```bash
npm install -g @anthropic-ai/claude-code
claude --version   # 验证
```
如仍报错，在 `.env` 中设置完整路径：
```ini
CLAUDE_PATH=/home/youruser/.local/bin/claude
```
用 `which claude` 或 `find / -name claude 2>/dev/null` 查找实际路径。

---

**Q: Telegram Bot 没有任何响应 / Telegram bot not responding**

A: 按以下步骤排查：
1. 确认 `TELEGRAM_BOT_TOKEN` 填写正确，`=` 后无空格
2. 确认服务正在运行：`systemctl status claude-anywhere` 或终端里直接运行 `npm run telegram`
3. 检查网络能否访问 Telegram：`curl -s https://api.telegram.org` 应有 JSON 响应
4. 确认你在 Telegram 里给 **你的 Bot** 发消息，不是给 BotFather

---

**Q: 报错 `409 Conflict`**

A: 同一个 Bot Token 有多个实例在同时运行。
```bash
# 查找并停止重复进程 / Find and kill duplicate processes
ps aux | grep bridge-telegram
pkill -f bridge-telegram
# 再重新启动 / Then restart
npm run telegram
```

---

**Q: 报错 `code 143` 或对话超时 / Timeout error**

A: Claude 执行超时（默认 10 分钟）。可在 `.env` 中增加超时时间：
```ini
CLAUDE_TIMEOUT_MS=900000   # 15 分钟
```

---

**Q: /sessions 没有显示我电脑上的会话 / /sessions not showing my desktop sessions**

A: 确保 `.env` 中的 `CLAUDE_CWD` 指向你的工作目录。Claude Anywhere 会扫描 `~/.claude/projects/` 下的所有会话。
```ini
CLAUDE_CWD=/home/youruser/your-project
```

---

**Q: 三个平台的会话是共享的吗 / Are sessions shared across platforms?**

A: 是的！在 Telegram 创建的会话，可以在企业微信或 QQ 上用 `/resume` 继续，反之亦然。
Yes! Sessions created on Telegram can be resumed on WeCom or QQ with `/resume`, and vice versa.

---

**Q: 一键启动多个平台 / How to start all platforms at once**

A: 在 `.env` 里配好所有 Token，然后运行：
```bash
npm start
```
会自动启动所有已配置的平台。

---

**Q: 企业微信 Bot 没有响应 / WeChat Work bot not responding**

A: 检查 `WECOM_BOT_ID` 和 `WECOM_SECRET` 是否正确，确认企业微信管理后台中 Bot 已启用并分配给了相应的部门或用户。

---

**Q: 免费版试用期到了还能用吗 / Can I use after free trial?**

A: 试用期结束后需要升级 Pro。购买地址：[claudeanywhere.gumroad.com/l/claude-anywhere](https://claudeanywhere.gumroad.com/l/claude-anywhere)

---

**Q: 是否支持 Windows？/ Does it work on Windows?**

A: 支持，但推荐在 WSL2（Windows Subsystem for Linux）环境下运行。
Yes, but running inside WSL2 is recommended.
在 WSL2 中，安装和使用方式与 Linux 完全相同。
Inside WSL2, the installation and usage is identical to Linux.

---

## 联系 / Contact

有问题或建议，请联系：
For support or feedback:

📧 support@claudeanywhere.com

---

*Claude Anywhere — 让 Claude Code 随时随地为你服务。*
*Claude Anywhere — Claude Code, wherever you are.*
