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

通过 Telegram 和企业微信随时随地使用 Claude Code，摆脱终端束缚。
Use Claude Code anywhere via Telegram & WeChat Work — no terminal needed.

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

检查是否已安装（Check if installed）：
```bash
node --version
# 应显示 v18.x.x 或更高 / Should show v18.x.x or higher
```

如未安装，请访问 [nodejs.org](https://nodejs.org/) 下载安装，或使用以下命令：
If not installed, visit [nodejs.org](https://nodejs.org/) or run:

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS (需要先安装 Homebrew / requires Homebrew)
brew install node
```

### 2. Claude Code CLI

检查是否已安装（Check if installed）：
```bash
claude --version
# 应显示版本号 / Should show version number
```

如未安装（If not installed）：
```bash
npm install -g @anthropic-ai/claude-code
```

安装后需要完成一次登录（After install, complete login once）：
```bash
claude
# 按提示登录 Anthropic 账号 / Follow prompts to log in to your Anthropic account
```

### 3. Telegram Bot Token（Telegram 用户必填 / Required for Telegram）

按以下步骤创建你的 Telegram Bot：
Follow these steps to create your Telegram Bot:

1. 打开 Telegram，在搜索框搜索 **@BotFather**
   Open Telegram, search for **@BotFather**

2. 点击进入对话，发送命令：`/newbot`
   Start a chat and send: `/newbot`

3. BotFather 会询问 Bot 的名称（Name），随便填，例如：`My Claude Bot`
   BotFather will ask for a name, e.g.: `My Claude Bot`

4. 再填 Username（必须以 `bot` 结尾），例如：`myclaudebot_bot`
   Enter a username (must end with `bot`), e.g.: `myclaudebot_bot`

5. BotFather 会返回一串 Token，格式如：`7123456789:AAHxxx...`
   BotFather will return a token like: `7123456789:AAHxxx...`

6. **复制并保存这个 Token，后面配置时需要用到。**
   **Copy and save this token — you'll need it during configuration.**

### 5. 企业微信 AI Bot（可选 / Optional for WeChat Work）

如果你需要在企业微信中使用，请在企业微信管理后台创建 AI Bot，获取 Bot ID 和 Secret。
If you need WeChat Work support, create an AI Bot in the WeCom admin console and get the Bot ID and Secret.

---

## 安装 / Installation

### 第 1 步：下载代码 / Step 1: Clone the repository

```bash
git clone https://github.com/yizhao1978/claude-anywhere.git
cd claude-anywhere
```

### 第 2 步：安装依赖 / Step 2: Install dependencies

```bash
npm install
```

正常输出类似（Normal output looks like）：
```
added 120 packages in 5s
```

### 第 3 步：创建配置文件 / Step 3: Create config file

```bash
cp .env.example .env
```

### 第 4 步：编辑配置文件 / Step 4: Edit config file

```bash
# Linux / macOS
nano .env

# 或者用任意文本编辑器打开 / Or open with any text editor
```

---

## 配置说明 / Configuration

打开 `.env` 文件，填写以下内容：
Open `.env` and fill in the following:

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
```

**配置后保存文件。** 按 `Ctrl+O` 保存，`Ctrl+X` 退出（nano 编辑器）。
**Save the file.** Press `Ctrl+O` to save, `Ctrl+X` to exit (nano editor).

---

## 启动 / Start

### 方式一：直接运行（测试用）/ Option 1: Run directly (for testing)

```bash
# 启动 Telegram Bot / Start Telegram Bot
npm run telegram

# 或启动企业微信 Bot / Or start WeChat Work Bot
npm run wecom
```

看到类似以下输出表示启动成功：
Startup is successful when you see output like:
```
✓ Claude found: /usr/local/bin/claude
✓ Telegram bot started
Bot is running. Send a message to your bot on Telegram.
```

按 `Ctrl+C` 停止。关闭终端后 Bot 也会停止，建议使用下面的后台运行方式。
Press `Ctrl+C` to stop. The bot stops when the terminal closes — use background methods below for persistent running.

---

### 方式二：tmux 后台运行（推荐新手）/ Option 2: tmux (recommended for beginners)

首先安装 tmux（Install tmux first）：
```bash
# Ubuntu / Debian
sudo apt install tmux

# macOS
brew install tmux
```

启动后台会话（Start background session）：
```bash
# 创建新 tmux 会话 / Create new tmux session
tmux new -s claude-anywhere

# 在 tmux 里启动 Bot / Start bot inside tmux
npm run telegram

# 脱离 tmux（Bot 在后台继续运行）/ Detach from tmux (bot keeps running)
# 按键：先按 Ctrl+B，松开，再按 D
# Keys: Press Ctrl+B, release, then press D
```

之后重新进入查看日志（Reattach later to view logs）：
```bash
tmux attach -t claude-anywhere
```

---

### 方式三：systemd 服务（推荐生产环境）/ Option 3: systemd (recommended for production)

**Telegram Bot 服务 / Telegram Bot service:**

```bash
# 1. 复制服务文件 / Copy service file
sudo cp systemd/claude-anywhere.service /etc/systemd/system/

# 2. 编辑服务文件，填入正确的用户名和路径
# 2. Edit service file with your username and path
sudo nano /etc/systemd/system/claude-anywhere.service
# 修改 User=、WorkingDirectory= 和 ExecStart= 中的路径
# Modify User=, WorkingDirectory= and ExecStart= paths

# 3. 重载并启动 / Reload and start
sudo systemctl daemon-reload
sudo systemctl enable claude-anywhere
sudo systemctl start claude-anywhere

# 4. 查看状态 / Check status
sudo systemctl status claude-anywhere

# 5. 查看日志 / View logs
journalctl -u claude-anywhere -f
```

**企业微信服务 / WeChat Work service:**

```bash
sudo cp systemd/claude-anywhere-wecom.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable claude-anywhere-wecom
sudo systemctl start claude-anywhere-wecom
```

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
| `/status` | 查看当前账号状态和今日用量 / Show tier & daily usage |
| `/activate <key>` | 激活 Pro 授权码 / Activate Pro license key |
| `/help` | 显示帮助和功能列表 / Show help & feature list |

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
`npm install -g @anthropic-ai/claude-code`
安装后运行 `claude --version` 验证。如仍报错，在 `.env` 中设置完整路径：
`CLAUDE_PATH=/home/youruser/.local/bin/claude`

---

**Q: Telegram Bot 没有任何响应 / Telegram bot not responding**
A: 按以下步骤排查：
1. 检查 `TELEGRAM_BOT_TOKEN` 是否填写正确，确认没有多余空格
2. 确认 Bot 服务正在运行：`npm run telegram` 或 `systemctl status claude-anywhere`
3. 检查网络是否能访问 Telegram API：`curl https://api.telegram.org`（需要能访问）
4. 确认你在 Telegram 中给 Bot 发了消息（不是 BotFather）

---

**Q: 报错 `409 Conflict`**
A: 同一个 Bot Token 有多个实例在同时运行。
检查是否有其他进程：`ps aux | grep node`
停止重复进程后重新启动。

---

**Q: 报错 `code 143` 或对话超时 / Timeout error**
A: Claude 执行超时（默认 10 分钟）。复杂任务可能需要更长时间。
可以在 `.env` 中增加超时时间：`CLAUDE_TIMEOUT_MS=900000`（15分钟）

---

**Q: 企业微信 Bot 没有响应 / WeChat Work bot not responding**
A: 检查 `WECOM_BOT_ID` 和 `WECOM_SECRET` 是否正确，确认企业微信管理后台中 Bot 已启用。

---

**Q: 免费版试用期到了还能用吗 / Can I use after free trial?**
A: 试用期结束后需要升级 Pro。购买地址：[claudeanywhere.gumroad.com/l/claude-anywhere](https://claudeanywhere.gumroad.com/l/claude-anywhere)

---

**Q: 是否支持 Windows？/ Does it work on Windows?**
A: 支持，但推荐在 WSL2（Windows Subsystem for Linux）环境下运行。
Yes, but running inside WSL2 is recommended.

---

## 联系 / Contact

有问题或建议，请联系：
For support or feedback:

📧 support@claudeanywhere.com

---

*Claude Anywhere — 让 Claude Code 随时随地为你服务。*
*Claude Anywhere — Claude Code, wherever you are.*
